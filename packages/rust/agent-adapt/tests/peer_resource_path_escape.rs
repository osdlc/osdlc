//! Regression tests for `P40` — *a path escapes the skill dir*.
//!
//! Without the containment check in [`agent_adapt::paths`], a
//! `SkillResource::relative_path` joins onto the slug directory unvalidated: a
//! `..` segment walks out of the skill directory and an absolute path replaces
//! the destination prefix outright. Both reproduced end-to-end, landing the
//! escaping file outside the anchor with its executable bit set.
//!
//! Each test names the literal input that reproduced, asserts the render is
//! refused with the path named, and — for the on-disk cases — asserts that
//! nothing exists at the escaped path afterwards and that no partial tree
//! was left behind.

use std::path::{Path, PathBuf};

use agent_adapt::runtimes::{Amp, Antigravity, ClaudeCode, CodexCli, NpmPackage, OpenCode};
use agent_adapt::{Scope, Skill, SkillCapability, SkillResource, install};

/// The two paths the research (`G8`) reproduced verbatim.
const REPRODUCED: [&str; 2] = ["../../../../etc/evil.sh", "/absolute/evil.md"];

fn skill_with_resource(relative_path: &str) -> Skill {
    let mut skill = Skill::new("escape", "d", "b");
    skill.resources.push(SkillResource {
        relative_path: relative_path.into(),
        content: b"#!/bin/sh\necho pwned\n".to_vec(),
        executable: true,
    });
    skill
}

fn refusal_for(relative_path: &str) -> String {
    ClaudeCode
        .render_skill(&skill_with_resource(relative_path))
        .expect_err(&format!("{relative_path:?} must be refused"))
        .to_string()
}

fn script_with_slug(slug: &str) -> agent_adapt::Script {
    agent_adapt::Script {
        name: "Evil".into(),
        slug: slug.into(),
        description: None,
        language: agent_adapt::ScriptLanguage::Bash,
        body: "echo hi".into(),
        timeout_ms: 0,
        tags: vec![],
        category: None,
        is_template: false,
    }
}

#[test]
fn p40_reproduced_paths_are_refused_and_named() {
    for input in REPRODUCED {
        let msg = refusal_for(input);
        assert!(msg.contains(input), "refusal must name the path: {msg}");
        assert!(msg.contains("unsafe path"), "{msg}");
    }
}

#[test]
fn p40_parent_segment_is_refused_even_when_it_would_land_inside() {
    let msg = refusal_for("a/../b.md");
    assert!(msg.contains("a/../b.md"), "{msg}");
}

#[test]
fn p40_rooted_and_windows_shaped_paths_are_refused() {
    // A bare leading slash is the same trap as the reproduced absolute
    // path: `join` replaces rather than appends.
    assert!(refusal_for("/evil.md").contains("/evil.md"));
    // These are single filename components on Unix but roots on Windows.
    // Refused everywhere: content validated on one platform gets written
    // on another.
    assert!(refusal_for("C:\\Windows\\evil.md").contains("drive-letter"));
    assert!(refusal_for("\\\\server\\share\\evil.md").contains("unsafe path"));
    assert!(refusal_for("a\\..\\evil.md").contains("unsafe path"));
}

#[test]
fn p40_dot_sequences_are_refused() {
    for input in ["./../evil.md", "a/./../../evil.md", "...//../evil.md", "."] {
        assert!(refusal_for(input).contains("unsafe path"), "{input:?}");
    }
}

#[test]
fn p40_degenerate_paths_that_name_no_file_are_refused() {
    // Neither of these extends the slug directory by a component.
    for input in ["", "sub/"] {
        assert!(refusal_for(input).contains("unsafe path"), "{input:?}");
    }
}

#[test]
fn p40_nothing_is_percent_or_unicode_decoded() {
    // The crate decodes nothing, so these are ordinary directory names.
    // They render, and they render *inside* the slug directory.
    for input in ["%2e%2e/evil.md", "..%2fevil.md", "\u{ff0e}\u{ff0e}/evil.md"] {
        let files = ClaudeCode
            .render_skill(&skill_with_resource(input))
            .unwrap_or_else(|e| panic!("{input:?} should render: {e}"));
        assert!(
            files[1].path.starts_with(".claude/skills/escape"),
            "{}",
            files[1].path.display()
        );
    }
}

#[test]
fn p40_legitimate_peer_resources_still_render() {
    let mut skill = Skill::new("escape", "d", "b");
    for path in ["notes.md", "scripts/run.sh", "refs/a/b/c.md", ".gitignore"] {
        skill.resources.push(SkillResource {
            relative_path: path.into(),
            content: b"x".to_vec(),
            executable: false,
        });
    }
    let files = ClaudeCode.render_skill(&skill).unwrap();
    assert_eq!(files.len(), 5);
    assert_eq!(
        files[2].path,
        PathBuf::from(".claude/skills/escape/scripts/run.sh")
    );
}

#[test]
fn p40_every_runtime_refuses_because_they_share_the_renderer() {
    for input in REPRODUCED {
        let skill = skill_with_resource(input);
        assert!(ClaudeCode.render_skill(&skill).is_err(), "claude-code");
        assert!(Antigravity.render_skill(&skill).is_err(), "antigravity");
        assert!(CodexCli.render_skill(&skill).is_err(), "codex-cli");
        assert!(OpenCode.render_skill(&skill).is_err(), "opencode");
        assert!(Amp.render_skill(&skill).is_err(), "amp");
        assert!(NpmPackage.render_skill(&skill).is_err(), "npm-package");
    }
}

#[test]
fn p40_nothing_is_written_at_the_escaped_path() {
    let tmp = tempfile::TempDir::new().unwrap();
    // A nested anchor so an escape has somewhere to land that we can then
    // assert is empty.
    let anchor = tmp.path().join("outer/project");
    std::fs::create_dir_all(&anchor).unwrap();
    let outside = tmp.path().join("outer/evil.sh");

    let skill = skill_with_resource("../../../../../evil.sh");
    let err = install::install_skill(&ClaudeCode, &anchor, Scope::Project, &skill).unwrap_err();
    assert!(err.to_string().contains("../../../../../evil.sh"), "{err}");

    assert!(!outside.exists(), "escaping resource must not be written");
    // Invariant 5: no partial tree either — the SKILL.md that would have
    // been written first is absent too, because the render is refused
    // whole.
    assert!(
        !anchor.join(".claude/skills/escape/SKILL.md").exists(),
        "no partial tree may survive a refusal"
    );
    assert!(
        !anchor.join(".claude/skills").exists(),
        "no partial tree may survive a refusal"
    );
}

#[test]
fn p40_absolute_resource_path_writes_nothing_outside_the_anchor() {
    let tmp = tempfile::TempDir::new().unwrap();
    let anchor = tmp.path().join("project");
    std::fs::create_dir_all(&anchor).unwrap();
    let outside = tmp.path().join("absolute-evil.md");

    let skill = skill_with_resource(&outside.to_string_lossy());
    let err = install::install_skill(&ClaudeCode, &anchor, Scope::Project, &skill).unwrap_err();
    assert!(err.to_string().contains("absolute"), "{err}");
    assert!(!outside.exists(), "absolute path must not be written");
}

#[test]
fn write_tree_refuses_a_hand_built_escaping_file() {
    let tmp = tempfile::TempDir::new().unwrap();
    let anchor = tmp.path().join("outer/project");
    std::fs::create_dir_all(&anchor).unwrap();

    let mut tree = agent_adapt::ExportedTree::new();
    tree.push(agent_adapt::ExportedFile::text_file(
        "../../evil.md",
        "x",
        agent_adapt::ExportedFileType::Other,
    ));
    let err = install::write_tree(&tree, &anchor).unwrap_err();
    assert!(err.to_string().contains("../../evil.md"), "{err}");
    assert!(!tmp.path().join("evil.md").exists());
}

#[test]
fn agent_and_script_slugs_are_contained_too() {
    // Same defect shape: neither slug is slugified before it becomes a
    // filename, so both were joined onto their directory unvalidated.
    let mut agent = agent_adapt::Agent::new("Evil", "../../../../etc/evil");
    let err = agent_adapt::AgentCapability::render_agent(&ClaudeCode, &agent).unwrap_err();
    assert!(err.to_string().contains("../../../../etc/evil.md"), "{err}");

    agent.slug = "good-agent".into();
    let files = agent_adapt::AgentCapability::render_agent(&ClaudeCode, &agent).unwrap();
    assert_eq!(
        files[0].path,
        Path::new(".claude/agents/good-agent.md").to_path_buf()
    );

    let script = script_with_slug("/tmp/evil");
    let err = agent_adapt::ScriptCapability::render_script(&ClaudeCode, &script).unwrap_err();
    assert!(err.to_string().contains("/tmp/evil.sh"), "{err}");
}

/// One containment rule, one error shape.
///
/// `paths::join_within` is the crate's only containment check, so every
/// "this path is not safe" refusal — whichever render raised it — is
/// [`agent_adapt::Error::UnsafePath`]. A second check with its own error
/// type is what this test exists to prevent: two rules can disagree, and a
/// caller matching on the error would then have to know which one fired.
///
/// An un-sluggable skill *name* is deliberately not in that set. It is a
/// naming defect, caught by `slugify_skill_name` before any path exists,
/// and it keeps `Error::Validation`.
#[test]
fn one_containment_rule_means_one_error_shape() {
    fn is_unsafe_path(err: &agent_adapt::Error) -> bool {
        matches!(err, agent_adapt::Error::UnsafePath { .. })
    }

    let err = ClaudeCode
        .render_skill(&skill_with_resource("../../../../etc/evil.sh"))
        .unwrap_err();
    assert!(is_unsafe_path(&err), "render_skill resource: {err:?}");

    let agent = agent_adapt::Agent::new("Evil", "../../etc/evil");
    let err = agent_adapt::AgentCapability::render_agent(&ClaudeCode, &agent).unwrap_err();
    assert!(is_unsafe_path(&err), "render_agent slug: {err:?}");

    let err =
        agent_adapt::ScriptCapability::render_script(&ClaudeCode, &script_with_slug("/tmp/evil"))
            .unwrap_err();
    assert!(is_unsafe_path(&err), "render_script slug: {err:?}");

    let tmp = tempfile::TempDir::new().unwrap();
    let mut tree = agent_adapt::ExportedTree::new();
    tree.push(agent_adapt::ExportedFile::text_file(
        "../../evil.md",
        "x",
        agent_adapt::ExportedFileType::Other,
    ));
    let err = install::write_tree(&tree, tmp.path()).unwrap_err();
    assert!(is_unsafe_path(&err), "write_tree: {err:?}");

    // The naming defect keeps its own shape.
    let err = ClaudeCode
        .render_skill(&Skill::new("日本語", "d", "b"))
        .unwrap_err();
    assert!(
        matches!(err, agent_adapt::Error::Validation(_)),
        "an un-sluggable name is a naming defect, not a path refusal: {err:?}"
    );
}

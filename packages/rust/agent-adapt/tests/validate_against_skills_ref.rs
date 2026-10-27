//! The reference validator as an oracle: render every target, and ask
//! `agentskills validate` whether the result is a skill.
//!
//! # Why an external binary rather than a re-implementation
//!
//! The Agent Skills specification carries no version number — no changelog,
//! no releases, nothing to pin — so drift cannot be detected by comparing
//! versions. The reference validator is the only place the closed
//! six-key field set is written down at all: the rendered specification page
//! never says an unknown key is illegal, `skills_ref.validator`'s
//! `ALLOWED_FIELDS` does. A second copy of that rule living here would be a
//! second thing to keep in step, and it would agree with itself forever.
//!
//! Its limit is stated rather than hidden: it catches only the changes
//! `skills-ref` itself implements. A floor, not a guarantee.
//!
//! # The validator is not a dependency of this crate
//!
//! It is a Python tool, installed by whoever runs the suite, and it is
//! absent on a plain checkout. [`SKIP_HINT`] names the install command, and
//! every test writes it to the real stderr and returns rather than passing
//! quietly — a green suite that never ran the oracle is worse than no suite.
//!
//! ```text
//! uv tool install skills-ref   # or: pipx install skills-ref
//! ```
//!
//! `skills-ref` is the PyPI package; `agentskills` is the command it
//! installs. That mismatch is the one thing that stops somebody finding it.
//! The pinned reading is `agentskills` 0.1.1, which versions the validator
//! and **not** the format.
//!
//! # Claude Code is invalid on purpose
//!
//! [`agent_adapt::AGENT_SKILLS_EXTENSION_FIELDS`] are six keys that harness
//! documents and the specification does not. Keeping them is the point of
//! that target, so its render is non-conformant by construction. The
//! assertion here names all six rather than exempting the target: an
//! extension key going missing, or a seventh appearing, should be as red as
//! a conformance failure anywhere else.

use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;

use agent_adapt::runtimes::skill_renderer_for;
use agent_adapt::{
    AGENT_SKILLS_EXTENSION_FIELDS, ExportedTree, RuntimeId, Skill, SkillResource, install,
};

/// Printed instead of a pass when the validator is not installed.
const SKIP_HINT: &str = "SKIPPED: the Agent Skills reference validator is not on PATH. \
     Install it with `uv tool install skills-ref` (or `pipx install skills-ref`), \
     which provides the `agentskills` command, then re-run.";

/// The binary `skills-ref` installs — see the module docs above for why
/// the package and command names differ.
const VALIDATOR: &str = "agentskills";

/// `true` when the validator can be run at all.
fn validator_present() -> bool {
    Command::new(VALIDATOR)
        .arg("--version")
        .output()
        .is_ok_and(|out| out.status.success())
}

/// `false` when the oracle ran; `true` when it could not, having said so.
///
/// Written straight to the process's stderr rather than through
/// `eprintln!`, which libtest captures and then discards for a test that
/// passes. A skip nobody sees is the silent pass this exists to prevent.
fn skipped_for_missing_validator() -> bool {
    if validator_present() {
        return false;
    }
    use std::io::Write;
    let mut err = std::io::stderr();
    let _ = writeln!(err, "{SKIP_HINT}");
    let _ = err.flush();
    true
}

/// One validator verdict: whether the tree is a conformant skill, and what
/// it said when it is not.
struct Verdict {
    valid: bool,
    output: String,
}

fn validate(skill_dir: &Path) -> Verdict {
    let out = Command::new(VALIDATOR)
        .arg("validate")
        .arg(skill_dir)
        .output()
        .expect("the validator was present a moment ago");
    let mut output = String::from_utf8_lossy(&out.stdout).into_owned();
    output.push_str(&String::from_utf8_lossy(&out.stderr));
    Verdict {
        valid: out.status.success(),
        output,
    }
}

/// `name` and `description` and nothing else — the floor the spec requires.
fn minimal() -> Skill {
    Skill::new("minimal", "Does the least a skill can do.", "Do it.\n")
}

/// Every key this crate can emit, set. Includes all six Claude Code
/// extensions, so the one target that keeps them is invalid on exactly
/// those.
fn maximal() -> Skill {
    let mut s = Skill::new(
        "Code Review",
        "Reviews a diff for correctness bugs. Use when asked to review code.",
        "# Code Review\n\nSee [the house style](references/house-style.md).\n",
    );
    s.allowed_tools = vec!["Read".into(), "Grep".into()];
    s.license = Some("MIT".into());
    s.compatibility = Some("Requires git 2.40 or newer and a POSIX shell.".into());
    s.metadata = BTreeMap::from([
        ("team".to_owned(), "platform".to_owned()),
        ("tier".to_owned(), "1".to_owned()),
    ]);
    s.argument_hint = Some("<pr-number>".into());
    s.argument_names = Some(vec!["pr_number".into()]);
    s.model_override = Some("opus".into());
    s.context_mode = Some("fork".into());
    s.user_invocable = false;
    s.disable_model_invocation = true;
    s
}

/// Frontmatter the model does not understand, in every JSON shape — the
/// case that put unknown keys at the top level, where the validator
/// rejects them.
fn unknown_note_frontmatter() -> Skill {
    let mut s = Skill::new(
        "carried-keys",
        "Carries frontmatter this model has no field for.",
        "Body.\n",
    );
    s.annotations
        .insert("owner".into(), serde_json::json!("kelly"));
    s.annotations
        .insert("priority".into(), serde_json::json!(3));
    s.annotations
        .insert("reviewers".into(), serde_json::json!(["a", "b"]));
    s.annotations
        .insert("nested".into(), serde_json::json!({"inner": {"deep": 1}}));
    s.annotations
        .insert("empty_map".into(), serde_json::json!({}));
    s.annotations.insert("flag".into(), serde_json::json!(true));
    s
}

/// Peer files under the slug directory, and a body link into one of them —
/// the shape a compiled note publishes as.
fn with_peer_resources() -> Skill {
    let mut s = Skill::new(
        "with-resources",
        "Ships peer files beside SKILL.md.",
        "# With Resources\n\nFollow [the checklist](references/checklist.md).\n",
    );
    s.resources = vec![
        SkillResource {
            relative_path: "references/checklist.md".into(),
            content: b"# Checklist\n\n- One\n".to_vec(),
            executable: false,
        },
        SkillResource {
            relative_path: "scripts/run.sh".into(),
            content: b"#!/bin/sh\necho hi\n".to_vec(),
            executable: true,
        },
    ];
    s
}

fn corpus() -> Vec<(&'static str, Skill)> {
    vec![
        ("minimal", minimal()),
        ("maximal", maximal()),
        ("unknown-note-frontmatter", unknown_note_frontmatter()),
        ("peer-resources", with_peer_resources()),
    ]
}

/// Write `skill` to a fresh tree for `runtime` and return the slug
/// directory the validator is pointed at.
///
/// The renderer and the writer are the ones a publish calls, so the tree
/// under test is the tree a publish writes rather than a second assembly of
/// the same bytes.
fn render_to_disk(runtime: RuntimeId, skill: &Skill, anchor: &Path) -> std::path::PathBuf {
    let renderer = skill_renderer_for(runtime).expect("every target under test renders skills");
    let tree: ExportedTree = renderer
        .render_skill(skill)
        .unwrap_or_else(|e| panic!("{} failed to render: {e}", runtime.as_str()))
        .into_iter()
        .collect();
    let written = install::write_tree(&tree, anchor)
        .unwrap_or_else(|e| panic!("{} failed to write: {e}", runtime.as_str()));
    let skill_md = written
        .iter()
        .find(|p| p.file_name().is_some_and(|f| f == "SKILL.md"))
        .expect("a rendered skill has a SKILL.md");
    skill_md
        .parent()
        .expect("SKILL.md sits in the slug directory")
        .to_path_buf()
}

/// Every target that renders skills, minus the three that are invalid on
/// purpose.
///
/// Claude Code keeps all six of its extension keys; Cursor and Pi keep one of
/// them, `disable-model-invocation`, because each harness reads it.
/// All three render for a harness that reads those keys, and none renders for
/// a validator. A collection that needs an upload-clean copy publishes portable.
fn conformant_targets() -> Vec<RuntimeId> {
    RuntimeId::ALL
        .iter()
        .copied()
        .filter(|id| {
            !matches!(
                id,
                RuntimeId::ClaudeCode | RuntimeId::Cursor | RuntimeId::Pi
            ) && skill_renderer_for(*id).is_some()
        })
        .collect()
}

#[test]
fn every_conformant_target_renders_a_conformant_skill() {
    if skipped_for_missing_validator() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let mut checked = 0;
    for (label, skill) in corpus() {
        for runtime in conformant_targets() {
            let anchor = tmp.path().join(format!("{label}-{}", runtime.as_str()));
            std::fs::create_dir_all(&anchor).unwrap();
            let dir = render_to_disk(runtime, &skill, &anchor);
            let verdict = validate(&dir);
            assert!(
                verdict.valid,
                "{label} rendered for {} is not a conformant skill:\n{}\n\n{}",
                runtime.as_str(),
                verdict.output,
                std::fs::read_to_string(dir.join("SKILL.md")).unwrap(),
            );
            checked += 1;
        }
    }
    // The corpus is four skills over six targets. A silently empty loop is
    // the other way this test could pass without checking anything.
    assert_eq!(checked, 24, "the whole matrix ran");
}

/// Cursor's and Pi's one deviation, pinned: the render is rejected for
/// `disable-model-invocation` and for nothing else.
#[test]
fn cursor_and_pi_are_invalid_on_exactly_disable_model_invocation() {
    if skipped_for_missing_validator() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    for runtime in [RuntimeId::Cursor, RuntimeId::Pi] {
        let anchor = tmp.path().join(runtime.as_str());
        std::fs::create_dir_all(&anchor).unwrap();
        let dir = render_to_disk(runtime, &maximal(), &anchor);
        let verdict = validate(&dir);

        assert!(
            !verdict.valid,
            "{} keeps a key the spec does not define, so it cannot validate:\n{}",
            runtime.as_str(),
            verdict.output
        );
        assert!(
            verdict
                .output
                .contains("Unexpected fields in frontmatter: disable-model-invocation."),
            "{}: that one key, and nothing beside it:\n{}",
            runtime.as_str(),
            verdict.output
        );
    }
}

#[test]
fn claude_code_is_invalid_on_exactly_its_six_extension_keys() {
    if skipped_for_missing_validator() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let anchor = tmp.path().join("claude-code");
    std::fs::create_dir_all(&anchor).unwrap();
    let dir = render_to_disk(RuntimeId::ClaudeCode, &maximal(), &anchor);
    let verdict = validate(&dir);

    assert!(
        !verdict.valid,
        "claude-code keeps six keys the spec does not define, so it cannot validate:\n{}",
        verdict.output
    );
    for field in AGENT_SKILLS_EXTENSION_FIELDS {
        let kebab = field.replace('_', "-");
        assert!(
            verdict.output.contains(&kebab),
            "the refusal must name `{kebab}`:\n{}",
            verdict.output
        );
    }
    // Nothing but those six. A spec key showing up in the refusal would mean
    // this target is failing for a second, unintended reason.
    for field in ["name", "description", "license", "compatibility"] {
        assert!(
            !verdict
                .output
                .contains(&format!("Unexpected fields in frontmatter: {field}")),
            "a spec field must not be in the refusal:\n{}",
            verdict.output
        );
    }
}

/// The same skill, rendered portably, is what a caller uses to get an
/// upload-clean copy — so the pair must not both be invalid.
#[test]
fn the_portable_render_of_the_claude_code_skill_validates() {
    if skipped_for_missing_validator() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let anchor = tmp.path().join("portable");
    std::fs::create_dir_all(&anchor).unwrap();
    let dir = render_to_disk(RuntimeId::Portable, &maximal(), &anchor);
    let verdict = validate(&dir);
    assert!(verdict.valid, "{}", verdict.output);

    // And it still carries the three optional spec fields, which is the
    // half of conformance a "drop everything unrecognised" render would
    // also pass.
    let text = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
    assert!(text.contains("license: MIT"), "{text}");
    assert!(text.contains("compatibility: Requires git"), "{text}");
    assert!(text.contains("  team: platform"), "{text}");
}

/// The skip is the one outcome that must never look like a pass. This
/// asserts the message a reader would act on, whichever branch ran.
#[test]
fn the_skip_names_the_install_command() {
    assert!(SKIP_HINT.contains("uv tool install skills-ref"));
    assert!(SKIP_HINT.contains(VALIDATOR));
    skipped_for_missing_validator();
}

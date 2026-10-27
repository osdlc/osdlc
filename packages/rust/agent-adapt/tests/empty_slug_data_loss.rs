//! Regression test: un-sluggable skill names are refused.
//!
//! The Agent Skills `name` field is `^[a-z0-9]+(-[a-z0-9]+)*$`, 1-64 chars.
//! An empty slug is not in that language, so there is no legal slug to fall back to.
//! Names that cannot be slugged must be rejected before writing to disk.

use std::path::{Path, PathBuf};

use agent_adapt::install::install_skill;
use agent_adapt::runtimes::{all, skill_renderer_for};
use agent_adapt::{Scope, Skill, SkillCapability, runtimes::ClaudeCode};

/// Names carrying no ASCII alphanumeric — every one of these used to slug
/// to `""`.
const UNSLUGGABLE: [&str; 5] = ["!!!", "日本語", "Привет", "---", ""];

/// The data-loss case. Two skills whose names both slug to empty used to
/// resolve to the same destination, and the second write clobbered the
/// first. Nothing may be written for either.
#[test]
fn a_second_unsluggable_skill_cannot_overwrite_the_first() {
    let root = tempfile::tempdir().expect("tempdir");

    let first = Skill::new("!!!", "the first skill", "FIRST BODY");
    let second = Skill::new("日本語", "the second skill", "SECOND BODY");

    let first_result = install_skill(&ClaudeCode, root.path(), Scope::Project, &first);
    let second_result = install_skill(&ClaudeCode, root.path(), Scope::Project, &second);

    assert!(first_result.is_err(), "un-sluggable name must be refused");
    assert!(second_result.is_err(), "un-sluggable name must be refused");

    let on_disk = collect_files(root.path());
    assert!(
        on_disk.is_empty(),
        "a refused skill wrote to disk anyway: {on_disk:?}"
    );
}

/// A published skill's bytes survive a later publish of an un-sluggable
/// one. This is the property that broke: the collapsed path could land
/// inside a populated skills directory.
#[test]
fn publishing_an_unsluggable_skill_leaves_existing_skills_intact() {
    let root = tempfile::tempdir().expect("tempdir");

    let good = Skill::new("Real Skill", "a real skill", "REAL BODY");
    let good_paths = install_skill(&ClaudeCode, root.path(), Scope::Project, &good)
        .expect("real skill installs");
    let before = snapshot(&good_paths);

    for name in UNSLUGGABLE {
        let bad = Skill::new(name, "collides", "CLOBBER");
        assert!(
            install_skill(&ClaudeCode, root.path(), Scope::Project, &bad).is_err(),
            "{name:?} must be refused"
        );
    }

    assert_eq!(
        snapshot(&good_paths),
        before,
        "an existing skill's bytes changed while publishing refused skills"
    );
}

/// `日本語` specifically — the case a real user hits. Refused, on every
/// runtime, not written.
#[test]
fn non_ascii_only_name_is_refused_on_every_runtime() {
    let skill = Skill::new("日本語", "a description", "body");
    for runtime in all() {
        let renderer = skill_renderer_for(runtime.id()).expect("renders skills");
        let err = renderer
            .render_skill(&skill)
            .expect_err("un-sluggable name must be refused");
        let msg = err.to_string();
        assert!(
            msg.contains("日本語"),
            "refusal names the offending skill: {msg}"
        );
        assert!(msg.contains("[a-z0-9-]"), "refusal states the fix: {msg}");
    }
}

/// No projected path may equal the skills directory, and every rendered
/// file must extend it by a slug component.
#[test]
fn a_projected_path_always_extends_the_skills_dir() {
    let skill = Skill::new("My Skill", "d", "b");
    let files = ClaudeCode.render_skill(&skill).expect("renders");
    for file in &files {
        assert_ne!(
            file.path,
            PathBuf::from(".claude/skills/SKILL.md"),
            "skill directory collapsed onto the skills root"
        );
        let rest = file
            .path
            .strip_prefix(".claude/skills")
            .expect("stays under the skills dir");
        assert!(
            rest.components().count() >= 2,
            "path does not extend the skills dir by a slug component: {}",
            file.path.display()
        );
    }
}

/// `name:` is required by the spec. Any skill that renders at all carries
/// it; the ones that cannot are refused rather than shipped without it.
#[test]
fn name_is_never_omitted_from_rendered_frontmatter() {
    for name in UNSLUGGABLE {
        let skill = Skill::new(name, "a description", "body");
        assert!(
            ClaudeCode.render_skill(&skill).is_err(),
            "{name:?} rendered instead of being refused"
        );
    }

    let skill = Skill::new("café résumé", "a description", "body");
    let files = ClaudeCode
        .render_skill(&skill)
        .expect("partly-ASCII renders");
    let content = String::from_utf8(files[0].content.clone()).expect("utf8");
    assert!(
        content.contains("name: caf-r-sum"),
        "required `name:` key missing:\n{content}"
    );
}

fn snapshot(paths: &[PathBuf]) -> Vec<(PathBuf, Vec<u8>)> {
    paths
        .iter()
        .map(|p| (p.clone(), std::fs::read(p).expect("file still on disk")))
        .collect()
}

fn collect_files(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            out.extend(collect_files(&path));
        } else {
            out.push(path);
        }
    }
    out
}

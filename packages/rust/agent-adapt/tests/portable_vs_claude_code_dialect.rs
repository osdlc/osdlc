//! One skill, two dialects: the Claude Code superset and the portable
//! (Agent Skills) projection must not be the same bytes.
//!
//! A test that only checked "portable output has no extension keys" would
//! still pass if someone pointed the portable target back at the Claude Code
//! dialect and the skill happened to set none of them. Comparing the two
//! renders of the *same* skill is what closes that.

use agent_adapt::runtimes::{ClaudeCode, Portable};
use agent_adapt::{AGENT_SKILLS_EXTENSION_FIELDS, Skill, SkillCapability};

/// Every key this crate can emit, set — so a dropped one is visible.
fn maximal_skill() -> Skill {
    let mut s = Skill::new(
        "Code Review",
        "Reviews a diff for correctness bugs. Use when asked to review code.",
        "# Code Review\n\nSee [the house style](references/house-style.md).\n",
    );
    s.allowed_tools = vec!["Read".into(), "Grep".into()];
    s.argument_hint = Some("<pr-number>".into());
    s.argument_names = Some(vec!["pr_number".into()]);
    s.model_override = Some("opus".into());
    s.context_mode = Some("fork".into());
    s.user_invocable = false;
    s.disable_model_invocation = true;
    s
}

fn frontmatter(text: &str) -> String {
    text.split("---\n")
        .nth(1)
        .expect("frontmatter between the fences")
        .to_owned()
}

fn keys(frontmatter: &str) -> Vec<String> {
    frontmatter
        .lines()
        .filter(|line| !line.starts_with(' ') && !line.starts_with('-'))
        .filter_map(|line| line.split_once(':').map(|(k, _)| k.trim().to_owned()))
        .collect()
}

#[test]
fn portable_drops_exactly_the_claude_code_extension_keys() {
    let skill = maximal_skill();
    let claude = ClaudeCode.render_skill(&skill).unwrap();
    let portable = Portable.render_skill(&skill).unwrap();

    let claude_fm = frontmatter(claude[0].text().unwrap());
    let portable_fm = frontmatter(portable[0].text().unwrap());

    assert_ne!(
        claude_fm, portable_fm,
        "one skill rendering identically to both dialects is the defect this test exists to prevent"
    );

    let claude_keys = keys(&claude_fm);
    let portable_keys = keys(&portable_fm);
    let dropped: Vec<&String> = claude_keys
        .iter()
        .filter(|k| !portable_keys.contains(k))
        .collect();

    let expected: Vec<String> = AGENT_SKILLS_EXTENSION_FIELDS
        .iter()
        .map(|f| f.replace('_', "-"))
        .collect();
    assert_eq!(
        dropped,
        expected.iter().collect::<Vec<&String>>(),
        "portable must drop argument-hint, arguments, model, context, \
         user-invocable, disable-model-invocation — and nothing else"
    );
    assert!(
        portable_keys
            .iter()
            .all(|k| ["name", "description", "allowed-tools"].contains(&k.as_str())),
        "portable keys are inside the spec's six: {portable_keys:?}"
    );
}

#[test]
fn claude_code_render_is_unchanged_by_the_portable_target() {
    let text = ClaudeCode.render_skill(&maximal_skill()).unwrap()[0]
        .text()
        .unwrap()
        .to_owned();
    for key in [
        "argument-hint: \"<pr-number>\"",
        "arguments:\n  - pr_number",
        "model: opus",
        "context: fork",
        "user-invocable: false",
        "disable-model-invocation: true",
    ] {
        assert!(text.contains(key), "claude-code still emits `{key}`");
    }
}

#[test]
fn both_targets_write_the_skill_where_their_convention_says() {
    let skill = maximal_skill();
    assert_eq!(
        ClaudeCode.render_skill(&skill).unwrap()[0]
            .path
            .to_string_lossy(),
        ".claude/skills/code-review/SKILL.md"
    );
    assert_eq!(
        Portable.render_skill(&skill).unwrap()[0]
            .path
            .to_string_lossy(),
        ".agents/skills/code-review/SKILL.md"
    );
}

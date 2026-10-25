//! A command as Markdown-with-frontmatter: the shape Claude Code, Codex
//! CLI, OpenCode, and GitHub Copilot's prompt files all share.
//!
//! One function, [`render_command_md`], renders all four. What differs
//! between them is not the rendering *logic* — frontmatter block, then
//! body, then the arguments section — but *which* optional frontmatter
//! keys their format accepts and what to call the tool-list key when it
//! does. That difference is [`CommandFields`], a small per-runtime
//! constant each runtime module declares next to its `paths()` and
//! `dialect()`.

use crate::Command;
use crate::render::arguments::{ArgumentSite, append_arguments_section};
use crate::render::frontmatter::FrontmatterBuilder;
use crate::runtime::{FieldNaming, FrontmatterDialect, RuntimeId};
use crate::tools::ToolRegistry;

/// Which optional frontmatter keys one runtime's command format accepts,
/// and what to call the tool-list key when it does.
///
/// Deliberately not [`crate::FrontmatterDialect`]: that struct's
/// `omit_fields` is one list a runtime applies to *every* frontmatter it
/// renders — skills, agents, and commands alike — and a runtime's command
/// format can diverge from its skill format on exactly these keys. Codex
/// CLI's skill dialect omits `argument-hint` (a Claude Code extension key
/// outside [`crate::AGENT_SKILLS_FIELDS`]), but Codex's own custom-prompt
/// format defines `argument-hint` itself; reusing one omit-list for both
/// would drop a key the command format documents. `description` is not a
/// field here because every runtime this crate renders commands for
/// documents it — there is nothing to select.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CommandFields {
    /// Casing for every key this builder emits.
    pub field_naming: FieldNaming,
    /// Emit `name: <slug>`.
    pub name: bool,
    /// Emit `argument-hint`/`argument_hint` when [`Command::argument_hint`]
    /// is set.
    pub argument_hint: bool,
    /// Emit Claude Code's own `arguments:` positional-name list when
    /// [`Command::argument_names`] is set.
    pub argument_names: bool,
    /// Emit `model` when [`Command::model`] is set.
    pub model: bool,
    /// The frontmatter key name for [`Command::tools`], or `None` to omit
    /// the tool list entirely. Not every runtime spells it `allowed-tools`:
    /// GitHub Copilot's own field is literally named `tools`.
    pub tools_key: Option<&'static str>,
}

/// Renders one command in the Markdown-with-frontmatter shape, honoring
/// `fields` for which optional keys `runtime`'s format accepts and
/// `runtime` (via [`ArgumentSite::Command`]) for how the arguments section
/// names that runtime's own placeholder syntax.
///
/// Tool names are translated per runtime through the same registry a skill
/// and an agent use, so a command naming `Grep` reaches every runtime under
/// whatever that runtime calls it — or, for a runtime this crate has no
/// tool-name table for, the canonical name unchanged (see
/// [`ToolRegistry::translate_tool_name`]).
pub fn render_command_md(
    command: &Command,
    runtime: RuntimeId,
    fields: &CommandFields,
    registry: &ToolRegistry,
) -> String {
    render_command_md_reporting(command, runtime, fields, registry).0
}

/// [`render_command_md`], plus the redundant half of
/// [`crate::render::FrontmatterBuilder::apply_overrides`]'s report: every
/// [`Command::overrides`] key whose value is what this render already wrote.
///
/// The sibling exists for the same reason [`crate::render::skill_md`]'s does:
/// a diagnostic is not a file, so a caller that wants bytes calls the plain
/// function and a caller that wants the report calls this one.
pub fn render_command_md_reporting(
    command: &Command,
    runtime: RuntimeId,
    fields: &CommandFields,
    registry: &ToolRegistry,
) -> (String, Vec<String>) {
    let dialect = FrontmatterDialect {
        field_naming: fields.field_naming,
        omit_fields: &[],
        emit_user_invocable_default: false,
    };
    let mut b = FrontmatterBuilder::new(&dialect);
    if fields.name {
        b.scalar("name", &command.slug);
    }
    if let Some(description) = command.description.as_deref() {
        b.scalar("description", description);
    }
    if fields.argument_hint
        && let Some(hint) = command.argument_hint.as_deref()
    {
        // Quoted, matching `render_skill_md` — a hint naming an enum
        // (`<mode: fast|thorough>`) carries a `: `, which an unquoted plain
        // YAML scalar cannot: a colon-space inside one reads as a nested
        // mapping key to a strict parser.
        b.scalar_quoted("argument_hint", hint);
    }
    if fields.argument_names
        && let Some(names) = command.argument_names.as_deref()
    {
        b.list("arguments", names);
    }
    if fields.model
        && let Some(model) = command.model.as_deref()
    {
        b.scalar("model", model);
    }
    if let Some(tools_key) = fields.tools_key {
        let translated: Vec<String> = command
            .tools
            .iter()
            .map(|t| registry.translate_tool_name(t, runtime))
            .collect();
        b.list(tools_key, &translated);
    }

    // The override has the final word — the merge contract
    // `Command::overrides` documents.
    let redundant = b.apply_overrides(&command.overrides);

    // `build` emits the fenced block, so the body is appended to it exactly as
    // an agent's system prompt is — one shape for both, and neither hand-rolls
    // the fences.
    let frontmatter = b.build();
    let body = append_arguments_section(
        command.body.trim_end(),
        &command.arguments,
        runtime,
        ArgumentSite::Command,
    );
    let text = if body.is_empty() {
        frontmatter
    } else {
        format!("{frontmatter}\n{body}\n")
    };
    (text, redundant)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Claude Code keeps every key: the reference dialect every other
    /// runtime's fixture in this file diverges from on purpose.
    const CLAUDE_CODE_FIELDS: CommandFields = CommandFields {
        field_naming: FieldNaming::Kebab,
        name: true,
        argument_hint: true,
        argument_names: true,
        model: true,
        tools_key: Some("allowed_tools"),
    };

    fn command() -> Command {
        Command {
            name: "Ship it".to_owned(),
            slug: "ship".to_owned(),
            description: Some("Cuts a release.".to_owned()),
            argument_hint: Some("<version>".to_owned()),
            argument_names: None,
            arguments: Vec::new(),
            tools: vec!["Read".to_owned()],
            model: None,
            body: "Cut the release for $ARGUMENTS.".to_owned(),
            overrides: serde_json::Map::new(),
        }
    }

    #[test]
    fn a_command_renders_its_frontmatter_and_its_prompt() {
        let out = render_command_md(
            &command(),
            RuntimeId::ClaudeCode,
            &CLAUDE_CODE_FIELDS,
            &ToolRegistry::default(),
        );

        assert!(out.starts_with("---\n"), "{out}");
        assert!(out.contains("name: ship"), "{out}");
        assert!(out.contains("Cuts a release."), "{out}");
        assert!(out.contains("<version>"), "{out}");
        assert!(out.ends_with("Cut the release for $ARGUMENTS.\n"), "{out}");
    }

    /// `Command::overrides` merges last, like `Skill::overrides` — a key the
    /// modelled fields never write is added, and one they do write is
    /// replaced and reported as redundant only when it says the same thing.
    #[test]
    fn overrides_merge_last_over_the_modelled_keys() {
        let mut command = command();
        command.overrides = serde_json::json!({
            "permissionMode": "plan",
            "description": "Cuts a release, carefully.",
        })
        .as_object()
        .unwrap()
        .clone();

        let (out, redundant) = render_command_md_reporting(
            &command,
            RuntimeId::ClaudeCode,
            &CLAUDE_CODE_FIELDS,
            &ToolRegistry::default(),
        );

        assert!(out.contains("permissionMode: plan"), "{out}");
        assert!(
            out.contains("description: \"Cuts a release, carefully.\""),
            "{out}"
        );
        assert!(!out.contains("description: Cuts a release.\n"), "{out}");
        assert!(redundant.is_empty(), "{redundant:?}");
    }

    /// An override that says exactly what the projection already wrote is
    /// reported, not refused.
    #[test]
    fn a_redundant_override_is_reported() {
        let mut command = command();
        command.overrides = serde_json::json!({"name": "ship"})
            .as_object()
            .unwrap()
            .clone();

        let (out, redundant) = render_command_md_reporting(
            &command,
            RuntimeId::ClaudeCode,
            &CLAUDE_CODE_FIELDS,
            &ToolRegistry::default(),
        );

        assert!(out.contains("name: ship"), "{out}");
        assert_eq!(redundant, vec!["name".to_owned()]);
    }

    // The one key a command has that a skill does not require and an agent has
    // no use for. Absent means the harness shows no hint, not an empty one.
    #[test]
    fn an_absent_argument_hint_writes_no_key() {
        let mut command = command();
        command.argument_hint = None;

        let out = render_command_md(
            &command,
            RuntimeId::ClaudeCode,
            &CLAUDE_CODE_FIELDS,
            &ToolRegistry::default(),
        );

        assert!(!out.contains("argument"), "{out}");
    }

    #[test]
    fn argument_names_render_as_a_block_sequence() {
        let mut cmd = command();
        cmd.argument_names = Some(vec!["issue".into(), "branch".into()]);
        let out = render_command_md(
            &cmd,
            RuntimeId::ClaudeCode,
            &CLAUDE_CODE_FIELDS,
            &ToolRegistry::default(),
        );
        assert!(out.contains("arguments:\n  - issue\n  - branch"), "{out}");
    }

    // A field this runtime's `CommandFields` does not turn on is dropped even
    // when the data is present — the mechanism every other command dialect
    // relies on to omit a key its harness does not know.
    #[test]
    fn a_field_the_dialect_does_not_select_is_omitted_even_when_populated() {
        let mut cmd = command();
        cmd.argument_names = Some(vec!["issue".into()]);
        let out = render_command_md(
            &cmd,
            RuntimeId::OpenCode,
            &CommandFields {
                field_naming: FieldNaming::Kebab,
                name: false,
                argument_hint: false,
                argument_names: false,
                model: false,
                tools_key: None,
            },
            &ToolRegistry::default(),
        );
        assert!(!out.contains("arguments:"), "{out}");
        assert!(!out.contains("name:"), "{out}");
        assert!(!out.contains("argument-hint"), "{out}");
        assert!(!out.contains("allowed-tools"), "{out}");
    }

    #[test]
    fn the_tool_list_key_name_is_the_dialects_to_choose() {
        // GitHub Copilot's own field is literally `tools`, not
        // `allowed-tools` — this is the mechanism that makes that possible
        // without a second render function.
        let out = render_command_md(
            &command(),
            RuntimeId::GithubCopilot,
            &CommandFields {
                field_naming: FieldNaming::Kebab,
                name: false,
                argument_hint: false,
                argument_names: false,
                model: false,
                tools_key: Some("tools"),
            },
            &ToolRegistry::default(),
        );
        assert!(out.contains("tools:\n  - Read"), "{out}");
        assert!(!out.contains("allowed-tools"), "{out}");
    }

    #[test]
    fn arguments_render_a_section_after_the_prompt_and_exactly_one_trailing_newline() {
        let mut cmd = command();
        cmd.arguments = vec![crate::Argument::required("version", "desc")];
        let out = render_command_md(
            &cmd,
            RuntimeId::ClaudeCode,
            &CLAUDE_CODE_FIELDS,
            &ToolRegistry::default(),
        );
        assert!(
            out.contains("Cut the release for $ARGUMENTS.\n\n## Arguments"),
            "{out}"
        );
        assert!(out.ends_with("- `version` (required): desc\n"), "{out}");
        assert!(!out.ends_with("\n\n"), "{out}");
    }

    #[test]
    fn a_command_with_no_prompt_is_still_a_valid_file() {
        let mut command = command();
        command.body = String::new();

        let out = render_command_md(
            &command,
            RuntimeId::ClaudeCode,
            &CLAUDE_CODE_FIELDS,
            &ToolRegistry::default(),
        );

        assert!(out.starts_with("---\n"), "{out}");
        assert!(out.trim_end().ends_with("---"), "{out}");
    }
}

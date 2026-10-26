//! GitHub Copilot runtime adapter.
//!
//! Command-only in this crate today: [`Copilot`] implements
//! [`CodingAgentRuntime`] and [`CommandCapability`] and nothing else. VS
//! Code's Copilot Chat does have its own skill and custom-agent formats
//! (`.github/skills/`, `.github/agents/*.agent.md` — see
//! the vendors' documentation), but this build has not
//! verified either against its current docs the way it has prompt files, so
//! [`crate::runtimes::skill_renderer_for`] and
//! [`crate::runtimes::agent_renderer_for`] both return `None` for
//! [`crate::RuntimeId::GithubCopilot`] rather than render a guessed layout.
//! `paths`' `skills_dir`, `agents_dir`, and `scripts_dir` are declared
//! anyway, the same way [`crate::runtimes::portable`] declares fields no
//! capability of its reads, because [`RuntimePaths`] has no optional form
//! for "unverified" — only for "absent" ([`hooks_file`](RuntimePaths::hooks_file),
//! [`mcp_config_file`](RuntimePaths::mcp_config_file), which genuinely are
//! absent here since no hook or MCP format is modelled either).
//!
//! # Prompt files (commands)
//!
//! `.github/prompts/<slug>.prompt.md` — note the compound extension, not
//! plain `.md`. Source:
//! <https://code.visualstudio.com/docs/agent-customization/prompt-files>
//! (retrieved 2026-09-06). "Workspace | `.github/prompts` folder" (the
//! "Prompt file locations" table); "Prompt files are Markdown files with
//! the `.prompt.md` extension."
//!
//! Frontmatter, from the same page's field table: `description`, `name`
//! ("The name of the prompt, used after typing `/` in chat. If not
//! specified, the file name is used."), `argument-hint` ("Hint text shown
//! in the chat input field..."), `agent` (`ask`/`agent`/`plan`/a custom
//! agent name — this crate's [`crate::Command`] has no field for it, so it
//! is never written), `model`, and `tools` — that is the field's own name,
//! not `allowed-tools`: "A list of tool or tool set names that are
//! available for this prompt." `COMMAND_FIELDS` turns on every one of
//! these this crate models.
//!
//! Argument syntax, same page: `${input:variableName}`, optionally
//! `${input:variableName:placeholder}` — "you can use a syntax like
//! `${input:variableName}`, `${input:variableName:placeholder}`. Most
//! language models understand this syntax and will prompt for these
//! inputs." This crate's rendered arguments section names each declared
//! argument's `${input:name}` form; see
//! [`crate::render::render_arguments_section`]'s Copilot arm. The
//! `:placeholder` half is not emitted — nothing on [`crate::Argument`]
//! models a distinct placeholder string beyond its own `description`.
//!
//! Tool names are passed through the shared [`crate::tools::ToolRegistry`]
//! unchanged: Copilot's own tool vocabulary (`search/codebase`,
//! `vscode/askQuestions`, `<server>/*` for an MCP server's tools, per the
//! same page's examples) is not the canonical Read/Write/Edit/Bash
//! vocabulary this crate's registry translates *to* for any runtime, and
//! this build has not mapped one onto the other — the registry's own
//! "unknown runtime" fallback (canonical name unchanged) is what a command
//! naming `Read` renders here, honestly rather than guessed.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{
    self, Claim, DeclaresCapabilities, Evidence, RuntimeCapabilities, Support,
};
use crate::render::CommandFields;
use crate::runtimes::standard;
use crate::{
    AGENT_SKILLS_EXTENSION_FIELDS, CodingAgentRuntime, Command, CommandCapability, ExportedFile,
    FieldNaming, FrontmatterDialect, Result, RuntimeId, RuntimePaths, ScopedRelative,
};

/// GitHub Copilot's own documented fields for a prompt file — see the
/// module doc's "Prompt files" section. `tools_key` is `"tools"`, not
/// `"allowed-tools"`: Copilot's field is spelled differently from every
/// other runtime's.
const COMMAND_FIELDS: CommandFields = CommandFields {
    field_naming: FieldNaming::Kebab,
    name: true,
    argument_hint: true,
    argument_names: false,
    model: true,
    tools_key: Some("tools"),
};

/// GitHub Copilot runtime adapter.
pub struct Copilot;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        // Declared but unread — see the module doc: no `SkillCapability` or
        // `AgentCapability` is implemented, so nothing joins onto these.
        skills_dir: ScopedRelative::same(".github/skills"),
        agents_dir: ScopedRelative::same(".github/agents"),
        commands_dir: Some(ScopedRelative::same(".github/prompts")),
        scripts_dir: ScopedRelative::same(".github/scripts"),
        // No hook or MCP config format is modelled for Copilot in this crate.
        hooks_file: None,
        mcp_config_file: None,
    })
}

fn dialect() -> &'static FrontmatterDialect {
    static DIALECT: OnceLock<FrontmatterDialect> = OnceLock::new();
    DIALECT.get_or_init(|| FrontmatterDialect {
        field_naming: FieldNaming::Kebab,
        // Unread today (no `SkillCapability`/`AgentCapability`), kept
        // consistent with every other non-Claude-Code dialect so it is
        // correct the day one is added.
        omit_fields: AGENT_SKILLS_EXTENSION_FIELDS,
        emit_user_invocable_default: false,
    })
}

impl CodingAgentRuntime for Copilot {
    fn id(&self) -> RuntimeId {
        RuntimeId::GithubCopilot
    }
    fn display_name(&self) -> &'static str {
        "GitHub Copilot"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl CommandCapability for Copilot {
    fn render_command(&self, command: &Command) -> Result<Vec<ExportedFile>> {
        standard::render_command(
            self,
            command,
            &COMMAND_FIELDS,
            ".prompt.md",
            standard::registry(),
        )
    }
}

// ── Capability declaration ───────────────────────────────────────────────

/// Copilot CLI's concept documentation, which names permission flags and no
/// file key that persists them.
const CLI: Evidence = Evidence {
    url: "https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli",
    observed_on: capabilities::OBSERVED,
    version: capabilities::UNVERSIONED,
};

impl DeclaresCapabilities for Copilot {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::GithubCopilot,
            assets: capabilities::derived_assets(RuntimeId::GithubCopilot),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::GithubCopilot),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(
                Claim::observed(Support::Ignored, capabilities::HARNESS_SURVEY).with_note(
                    "this crate has no Copilot hook renderer, so no `Stop` hook reaches it",
                ),
            ),
            overrides: capabilities::derived_override_keys(dialect()),
        }
    }
}

fn permissions() -> BTreeMap<String, Claim> {
    [
        (
            "allow",
            Claim::observed(Support::Translated, CLI)
                .with_spelling("--allow-tool")
                .with_note("a command-line flag; the docs name no file key that persists it"),
        ),
        (
            "deny",
            Claim::observed(Support::Translated, CLI)
                .with_spelling("--deny-tool")
                .with_note(
                    "a command-line flag, documented as taking precedence over the allow flags",
                ),
        ),
        (
            "ask",
            Claim::observed(Support::Ignored, CLI)
                .with_note("asking is the interactive default; the docs name no ask rule to declare"),
        ),
        (
            "mode",
            Claim::observed(Support::Translated, CLI)
                .with_spelling("--allow-all-tools")
                .with_note(
                    "a flag and the `/allow-all` and `/yolo` slash commands; no documented file key",
                ),
        ),
    ]
    .into_iter()
    .map(|(concept, claim)| (concept.to_owned(), claim))
    .collect()
}

/// Rejected throughout: the survey places Copilot's hooks at
/// `.github/hooks/*.json`, but this crate renders commands and nothing else.
fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            (
                (*event).to_owned(),
                Claim::observed(Support::Rejected, capabilities::HARNESS_SURVEY).with_note(
                    "Copilot CLI documents hooks and the survey places them at `.github/hooks/*.json`, but this crate has no Copilot hook renderer",
                ),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn sample_command() -> Command {
        let mut c = Command::new("Ship it", "ship");
        c.description = Some("Cuts a release.".to_owned());
        c.argument_hint = Some("<version>".to_owned());
        c.model = Some("Claude Sonnet 4".to_owned());
        c.tools = vec!["Read".to_owned()];
        c.body = "Cut the release for the given version.".to_owned();
        c
    }

    #[test]
    fn id_is_github_copilot() {
        assert_eq!(Copilot.id(), RuntimeId::GithubCopilot);
    }

    #[test]
    fn command_path_has_the_compound_prompt_md_extension() {
        let files = Copilot.render_command(&sample_command()).unwrap();
        assert_eq!(
            files[0].path,
            PathBuf::from(".github/prompts/ship.prompt.md")
        );
    }

    #[test]
    fn command_frontmatter_keeps_every_documented_key() {
        let files = Copilot.render_command(&sample_command()).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("name: ship"), "{text}");
        assert!(text.contains("description: Cuts a release."), "{text}");
        assert!(text.contains("argument-hint: \"<version>\""), "{text}");
        assert!(text.contains("model: Claude Sonnet 4"), "{text}");
        // The field is literally `tools`, not `allowed-tools`.
        assert!(text.contains("tools:\n  - Read"), "{text}");
        assert!(!text.contains("allowed-tools"), "{text}");
        // Claude Code's own `arguments:` positional-name list is not part
        // of Copilot's documented format.
        assert!(!text.contains("arguments:"), "{text}");
    }

    #[test]
    fn command_arguments_section_names_each_input_variable() {
        let mut command = sample_command();
        command.arguments = vec![
            crate::Argument::required("pr-number", "desc"),
            crate::Argument::optional("channel", "desc"),
        ];
        let files = Copilot.render_command(&command).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("${input:pr-number}"), "{text}");
        assert!(text.contains("${input:channel}"), "{text}");
    }

    #[test]
    fn no_commands_directory_is_a_no_op_not_an_empty_file() {
        // Guards the `commands_dir: None` branch `standard::render_command`
        // shares with every other runtime, exercised here because Copilot
        // is the one adapter in this module with nothing else to assert it
        // against.
        struct NoCommands;
        fn no_commands_paths() -> &'static RuntimePaths {
            static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
            PATHS.get_or_init(|| RuntimePaths {
                skills_dir: ScopedRelative::same(".x/skills"),
                agents_dir: ScopedRelative::same(".x/agents"),
                commands_dir: None,
                scripts_dir: ScopedRelative::same(".x/scripts"),
                hooks_file: None,
                mcp_config_file: None,
            })
        }
        impl CodingAgentRuntime for NoCommands {
            fn id(&self) -> RuntimeId {
                RuntimeId::GithubCopilot
            }
            fn display_name(&self) -> &'static str {
                "No Commands"
            }
            fn paths(&self) -> &RuntimePaths {
                no_commands_paths()
            }
            fn frontmatter_dialect(&self) -> &FrontmatterDialect {
                dialect()
            }
        }
        let files = standard::render_command(
            &NoCommands,
            &sample_command(),
            &COMMAND_FIELDS,
            ".prompt.md",
            standard::registry(),
        )
        .unwrap();
        assert!(files.is_empty());
    }
}

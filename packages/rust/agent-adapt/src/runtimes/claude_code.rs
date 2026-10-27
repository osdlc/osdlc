//! Anthropic Claude Code runtime adapter.
//!
//! Project-scope layout:
//!
//! ```text
//! <project>/
//! ├── .mcp.json            (at project root, not under .claude/)
//! └── .claude/
//!     ├── skills/<slug>/SKILL.md
//!     ├── agents/<slug>.md
//!     ├── scripts/<slug>.{sh,py,js}
//!     └── hooks.json
//! ```
//!
//! Claude Code is the reference runtime — every other adapter inherits
//! its vocabulary and only overrides where it diverges.
//!
//! # Frontmatter
//!
//! **The one dialect that omits nothing.** Claude Code documents and
//! honours [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] — `argument-hint`,
//! `model`, `context`, `user-invocable`, `disable-model-invocation` — so
//! they are correct here and only here. They are not Agent Skills fields
//! (see [`crate::AGENT_SKILLS_FIELDS`]), which is why every other adapter
//! drops them; a Claude Code skill carrying them is fine until it is
//! uploaded to claude.ai or the Skills API, both of which validate against
//! the spec's closed set. Rendering the same skill to
//! [`crate::runtimes::portable`] is how a user gets an upload-clean copy.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use crate::capabilities::{
    self, Claim, DeclaresCapabilities, Evidence, RuntimeCapabilities, Support,
};
use crate::mcp::{McpCapability, McpServer, render::render_claude_json};
use crate::render::CommandFields;
use crate::runtimes::standard;
use crate::{
    Agent, AgentCapability, CodingAgentRuntime, Command, CommandCapability, ExportedFile,
    FieldNaming, FrontmatterDialect, Hook, HookCapability, Result, RuntimeId, RuntimePaths,
    ScopedRelative, Script, ScriptCapability, Skill, SkillCapability,
};

/// Claude Code documents and honours every key this crate models for a
/// command — see [`dialect`]'s own doc for why that is true of skills too.
const COMMAND_FIELDS: CommandFields = CommandFields {
    field_naming: FieldNaming::Kebab,
    name: true,
    argument_hint: true,
    argument_names: true,
    model: true,
    tools_key: Some("allowed_tools"),
};

/// Claude Code runtime adapter. Zero-sized unit struct.
pub struct ClaudeCode;

fn paths() -> &'static RuntimePaths {
    static PATHS: OnceLock<RuntimePaths> = OnceLock::new();
    PATHS.get_or_init(|| RuntimePaths {
        skills_dir: ScopedRelative::same(".claude/skills"),
        agents_dir: ScopedRelative::same(".claude/agents"),
        commands_dir: Some(ScopedRelative::same(".claude/commands")),
        scripts_dir: ScopedRelative::same(".claude/scripts"),
        hooks_file: Some(ScopedRelative::same(".claude/hooks.json")),
        // Claude Code's MCP config lives at the project root, not under .claude/.
        mcp_config_file: Some(ScopedRelative::same(".mcp.json")),
    })
}

fn dialect() -> &'static FrontmatterDialect {
    static DIALECT: OnceLock<FrontmatterDialect> = OnceLock::new();
    DIALECT.get_or_init(|| FrontmatterDialect {
        field_naming: FieldNaming::Kebab,
        // Empty on purpose, and the only dialect for which that is true:
        // Claude Code is where the extension keys are documented.
        omit_fields: &[],
        emit_user_invocable_default: false,
    })
}

impl CodingAgentRuntime for ClaudeCode {
    fn id(&self) -> RuntimeId {
        RuntimeId::ClaudeCode
    }
    fn display_name(&self) -> &'static str {
        "Claude Code"
    }
    fn paths(&self) -> &RuntimePaths {
        paths()
    }
    fn frontmatter_dialect(&self) -> &FrontmatterDialect {
        dialect()
    }
}

impl SkillCapability for ClaudeCode {
    fn render_skill(&self, skill: &Skill) -> Result<Vec<ExportedFile>> {
        standard::render_skill(self, skill, standard::registry())
    }
}

impl AgentCapability for ClaudeCode {
    fn render_agent(&self, agent: &Agent) -> Result<Vec<ExportedFile>> {
        standard::render_agent(self, agent, standard::registry())
    }
}

impl CommandCapability for ClaudeCode {
    fn render_command(&self, command: &Command) -> Result<Vec<ExportedFile>> {
        standard::render_command(self, command, &COMMAND_FIELDS, ".md", standard::registry())
    }
}

impl HookCapability for ClaudeCode {
    fn render_hooks(&self, hooks: &[Hook]) -> Result<Vec<ExportedFile>> {
        standard::render_hooks(self, hooks, standard::registry())
    }
}

impl ScriptCapability for ClaudeCode {
    fn render_script(&self, script: &Script) -> Result<ExportedFile> {
        standard::render_script(self, script)
    }
}

impl McpCapability for ClaudeCode {
    fn render_mcp_server(&self, server: &McpServer) -> Result<Vec<ExportedFile>> {
        let content = render_claude_json(server)?;
        Ok(standard::wrap_mcp_config(self, content))
    }
}

// ── Capability declaration ───────────────────────────────────────────────

/// Claude Code's settings reference, which documents the `permissions` block.
const SETTINGS: Evidence = Evidence {
    url: "https://code.claude.com/docs/en/settings",
    observed_on: capabilities::OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// The subagent reference, which documents the per-unit permission mode.
const SUBAGENTS: Evidence = Evidence {
    url: "https://code.claude.com/docs/en/sub-agents",
    observed_on: capabilities::OVERRIDE_KEYS_OBSERVED,
    version: capabilities::UNVERSIONED,
};

/// The hooks reference's decision-control table, read for what a `Stop`
/// hook's output can do.
const STOP_OUTPUT: Evidence = Evidence {
    url: "https://code.claude.com/docs/en/hooks",
    observed_on: capabilities::HOOKS_OBSERVED,
    version: capabilities::UNVERSIONED,
};

impl DeclaresCapabilities for ClaudeCode {
    fn capabilities(&self) -> RuntimeCapabilities {
        RuntimeCapabilities {
            runtime: RuntimeId::ClaudeCode,
            assets: capabilities::derived_assets(RuntimeId::ClaudeCode),
            fields: capabilities::derived_fields(dialect()),
            tools: capabilities::derived_tools(standard::registry(), RuntimeId::ClaudeCode),
            permissions: permissions(),
            hook_events: hook_events(),
            behaviours: capabilities::behaviours(Claim::observed(Support::Native, STOP_OUTPUT).with_spelling("decision: \"block\"").with_note("a `Stop` hook answering `decision: \"block\"` with a `reason` keeps the conversation going")),
            overrides: capabilities::override_keys(
                dialect(),
                [capabilities::harness_key(
                    "permissionMode",
                    "the permission mode this unit runs under; no canonical field maps onto it",
                    SUBAGENTS,
                )],
            ),
        }
    }
}

/// The `permissions` block in `settings.json` — the vocabulary this crate's
/// permission concepts are named after, so every claim is native.
fn permissions() -> BTreeMap<String, Claim> {
    [
        (
            "allow",
            "permissions.allow",
            "a list of tool rules in `settings.json`",
        ),
        (
            "deny",
            "permissions.deny",
            "applies immediately, without the workspace-trust step `allow` waits for",
        ),
        (
            "ask",
            "permissions.ask",
            "prompts rather than refusing; applies without waiting for workspace trust",
        ),
        (
            "mode",
            "permissions.defaultMode",
            "`auto` and `bypassPermissions` are refused from project and local settings",
        ),
    ]
    .into_iter()
    .map(|(concept, spelling, note)| {
        (
            concept.to_owned(),
            Claim::observed(Support::Native, SETTINGS)
                .with_spelling(spelling)
                .with_note(note),
        )
    })
    .collect()
}

/// Every event Claude Code's own reference documents, natively under its
/// own name with the matcher rule the reference gives it. An event only
/// Codex CLI documents ([`capabilities::CODEX_ONLY_HOOK_EVENTS`]) is ignored: Claude Code's
/// reference names no such point in the loop.
fn hook_events() -> BTreeMap<String, Claim> {
    capabilities::hook_events()
        .map(|(event, _)| {
            let claim = match matcher(event) {
                Some(matcher) => {
                    Claim::observed(Support::Native, capabilities::HOOK_EVENT_VOCABULARY)
                        .with_spelling(event)
                        .with_note(matcher)
                }
                None => Claim::observed(Support::Ignored, capabilities::HOOK_EVENT_VOCABULARY)
                    .with_note(
                        "only another harness documents this event; Claude Code's reference names no such point in the loop",
                    ),
            };
            ((*event).to_owned(), claim)
        })
        .collect()
}

/// The matcher rule the hooks reference documents for one of Claude Code's
/// own events, or `None` for an event only another harness documents.
fn matcher(event: &str) -> Option<&'static str> {
    Some(match event {
        "SessionStart" => {
            "matcher: how the session started (startup, resume, clear, compact, fork)"
        }
        "Setup" => "matcher: which CLI flag triggered setup (init, maintenance)",
        "UserPromptSubmit" => "no matcher",
        "UserPromptExpansion" => "matcher: command name (skill or command names)",
        "PreToolUse" => "matcher: tool name",
        "PermissionRequest" => "matcher: tool name",
        "PermissionDenied" => "matcher: tool name",
        "PostToolUse" => "matcher: tool name",
        "PostToolUseFailure" => "matcher: tool name",
        "PostToolBatch" => "no matcher",
        "Notification" => "matcher: notification type",
        "MessageDisplay" => "no matcher",
        "SubagentStart" => "matcher: agent type",
        "SubagentStop" => "matcher: agent type",
        "TaskCreated" => "no matcher",
        "TaskCompleted" => "no matcher",
        "Stop" => "no matcher",
        "StopFailure" => "matcher: error type",
        "TeammateIdle" => "no matcher",
        "InstructionsLoaded" => "matcher: load reason",
        "ConfigChange" => "matcher: configuration source",
        "CwdChanged" => "no matcher",
        "DirectoryAdded" => "matcher: how the directory was added",
        "FileChanged" => "matcher: literal filenames to watch",
        "WorktreeCreate" => "no matcher",
        "WorktreeRemove" => "no matcher",
        "PreCompact" => "matcher: what triggered compaction",
        "PostCompact" => "matcher: what triggered compaction",
        "PreModelSwitch" => "matcher: canonical model name",
        "PostModelSwitch" => "matcher: canonical model name",
        "Elicitation" => "matcher: MCP server name",
        "ElicitationResult" => "matcher: MCP server name",
        "SessionEnd" => "matcher: why the session ended",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ExportedFileType;
    use std::path::PathBuf;

    fn sample_skill() -> Skill {
        let mut s = Skill::new("My Skill", "A test skill", "Do the thing.");
        s.allowed_tools = vec!["Read".into(), "Write".into()];
        s
    }

    #[test]
    fn id_is_claude_code() {
        assert_eq!(ClaudeCode.id(), RuntimeId::ClaudeCode);
    }

    #[test]
    fn skill_path_is_nested_under_claude_skills() {
        let files = ClaudeCode.render_skill(&sample_skill()).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(
            files[0].path,
            PathBuf::from(".claude/skills/my-skill/SKILL.md")
        );
        assert_eq!(files[0].kind, ExportedFileType::Skill);
    }

    #[test]
    fn skill_content_is_kebab_frontmatter() {
        let files = ClaudeCode.render_skill(&sample_skill()).unwrap();
        let text = files[0].text().unwrap();
        assert!(text.contains("allowed-tools: Read Write"));
    }

    #[test]
    fn skill_resources_render_under_the_slug_dir() {
        let mut s = sample_skill();
        s.resources.push(crate::SkillResource {
            relative_path: "scripts/run.sh".into(),
            content: b"#!/bin/sh\n".to_vec(),
            executable: true,
        });
        s.resources.push(crate::SkillResource {
            relative_path: "notes.md".into(),
            content: b"peer\n".to_vec(),
            executable: false,
        });
        let files = ClaudeCode.render_skill(&s).unwrap();
        assert_eq!(files.len(), 3);
        assert_eq!(
            files[0].path,
            PathBuf::from(".claude/skills/my-skill/SKILL.md")
        );
        assert_eq!(
            files[1].path,
            PathBuf::from(".claude/skills/my-skill/scripts/run.sh")
        );
        assert_eq!(files[1].kind, ExportedFileType::Resource);
        assert!(files[1].executable);
        assert_eq!(
            files[2].path,
            PathBuf::from(".claude/skills/my-skill/notes.md")
        );
        assert!(!files[2].executable);
    }

    #[test]
    fn agent_path_uses_slug() {
        let agent = Agent::new("Reviewer", "reviewer");
        let files = ClaudeCode.render_agent(&agent).unwrap();
        assert_eq!(files[0].path, PathBuf::from(".claude/agents/reviewer.md"));
    }

    #[test]
    fn mcp_config_path_is_project_root_mcp_json() {
        let server = McpServer::http("x", "http://y");
        let files = ClaudeCode.render_mcp_server(&server).unwrap();
        assert_eq!(files[0].path, PathBuf::from(".mcp.json"));
    }
}

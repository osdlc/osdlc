use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::Error;

/// What a hook *does* when it fires.
///
/// A closed enum, and an unknown spelling is a parse refusal rather than a
/// pass-through: the value is written into a harness's own config file, and a
/// typo carried through unchanged is a hook that is installed and never runs.
///
/// The five the harnesses document between them. Each names a different
/// payload on [`Hook`] — a command, a URL, a prompt — except `mcp_tool` and
/// `agent`, whose payloads no harness spells the same way twice and which
/// travel through [`Hook::overrides`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookType {
    /// Run a shell command. [`Hook::command`] carries it.
    Command,
    /// POST the event to a URL. [`Hook::url`] carries it.
    Http,
    /// Call an MCP tool. Its arguments are the harness's own shape.
    McpTool,
    /// Hand a prompt to the model. [`Hook::prompt`] carries it.
    Prompt,
    /// Hand the event to a subagent.
    Agent,
}

impl HookType {
    /// Every spelling [`HookType::from_str`] accepts, in the order a refusal
    /// lists them.
    pub const KNOWN: &'static [&'static str] = &["agent", "command", "http", "mcp_tool", "prompt"];

    /// The spelling a `hooks.json` carries.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Command => "command",
            Self::Http => "http",
            Self::McpTool => "mcp_tool",
            Self::Prompt => "prompt",
            Self::Agent => "agent",
        }
    }
}

impl fmt::Display for HookType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for HookType {
    type Err = Error;

    /// Exact match, no case folding — the same rule the other
    /// vocabularies follow, and for the same reason: two surfaces writing one
    /// vocabulary have to write one spelling.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "command" => Ok(Self::Command),
            "http" => Ok(Self::Http),
            "mcp_tool" => Ok(Self::McpTool),
            "prompt" => Ok(Self::Prompt),
            "agent" => Ok(Self::Agent),
            other => Err(Error::Validation(format!(
                "`{other}` is not a hook type (known: {})",
                HookType::KNOWN.join(", ")
            ))),
        }
    }
}

/// An automation hook: "when event X fires and the matcher Y is met, do Z."
///
/// The canonical form matches Claude Code's vocabulary (e.g. event
/// `"PreToolUse"`, matcher `"Edit|Write"`) because that's the richest
/// superset. [`crate::render::render_hooks_json`] translates the event name
/// per target and refuses an event the target does not carry.
///
/// # Field notes
///
/// * [`Hook::matcher`] is a pipe-delimited string of canonical tool
///   names. Render impls split on `|`, translate each half, and rejoin.
/// * [`Hook::timeout_ms`] of `0` means "runtime default / no timeout." The
///   `hooks.json` shape spells the same value in whole seconds, which is the
///   unit the harnesses read.
/// * `Hook::type` decides which payload field carries the work.
///   `None` reads as [`HookType::Command`] — see [`Hook::command`] for why
///   that is the default.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct Hook {
    /// Human-readable name.
    pub name: String,
    /// Stable kebab-case identifier.
    pub slug: String,
    /// Optional description.
    pub description: Option<String>,
    /// Lifecycle event name (e.g. `"PreToolUse"`).
    pub event: String,
    /// Optional pipe-delimited matcher of canonical tool names.
    pub matcher: Option<String>,
    /// What this hook does. `None` reads as [`HookType::Command`].
    #[serde(default, rename = "type")]
    pub r#type: Option<HookType>,
    /// Shell command to execute, for a [`HookType::Command`] hook.
    pub command: Option<String>,
    /// The endpoint an [`HookType::Http`] hook posts the event to.
    #[serde(default)]
    pub url: Option<String>,
    /// The prompt a [`HookType::Prompt`] hook hands the model.
    #[serde(default)]
    pub prompt: Option<String>,
    /// A guard expression the harness evaluates before running the hook.
    /// Written through unchanged: what makes one true is the harness's.
    #[serde(default, rename = "if")]
    pub r#if: Option<String>,
    /// Run without blocking the turn. `None` leaves the harness's default.
    #[serde(default, rename = "async")]
    pub r#async: Option<bool>,
    /// Fire at most once per session. `None` leaves the harness's default.
    #[serde(default)]
    pub once: Option<bool>,
    /// Timeout in milliseconds. `0` means no timeout.
    pub timeout_ms: i64,
    /// Free-form tags.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Optional category.
    pub category: Option<String>,
    /// If `true`, this hook is a template.
    pub is_template: bool,
    /// This render's own `ap-overrides.<target>` map, merged last over
    /// everything else here. Same contract as [`crate::Skill::overrides`].
    #[serde(default)]
    pub overrides: serde_json::Map<String, serde_json::Value>,
}

impl Hook {
    /// A hook with no type and no payload yet. Set `r#type` and its field
    /// (`command`, `url` or `prompt`) afterwards; with no type it renders as
    /// a [`HookType::Command`] hook.
    pub fn new(name: &str, slug: &str, event: &str) -> Self {
        Self {
            name: name.to_owned(),
            slug: slug.to_owned(),
            description: None,
            event: event.to_owned(),
            matcher: None,
            r#type: None,
            command: None,
            url: None,
            prompt: None,
            r#if: None,
            r#async: None,
            once: None,
            timeout_ms: 0,
            tags: Vec::new(),
            category: None,
            is_template: false,
            overrides: serde_json::Map::new(),
        }
    }

    /// A command hook — the shape every harness that reads a `hooks.json`
    /// documents first, and the one every other field is optional around.
    pub fn command(name: &str, slug: &str, event: &str, command: &str) -> Self {
        Self {
            r#type: Some(HookType::Command),
            command: Some(command.to_owned()),
            ..Self::new(name, slug, event)
        }
    }

    /// The type this hook renders as: what it declared, or
    /// [`HookType::Command`] where it declared nothing.
    pub fn effective_type(&self) -> HookType {
        self.r#type.unwrap_or(HookType::Command)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_known_spelling_parses_back_to_itself() {
        for spelling in HookType::KNOWN {
            let parsed: HookType = spelling.parse().unwrap();
            assert_eq!(parsed.as_str(), *spelling);
        }
    }

    #[test]
    fn an_unknown_type_spelling_is_refused_by_name() {
        let err = "shell".parse::<HookType>().unwrap_err();
        let text = err.to_string();
        assert!(text.contains("shell"), "{text}");
        assert!(text.contains("command"), "{text}");
    }

    #[test]
    fn a_hook_that_declares_no_type_renders_as_a_command() {
        let mut hook = Hook::command("Lint", "lint", "PreToolUse", "just lint");
        hook.r#type = None;
        assert_eq!(hook.effective_type(), HookType::Command);
    }
}

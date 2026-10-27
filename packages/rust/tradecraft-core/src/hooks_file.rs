//! A plugin's hooks from one file on disk, and the gap report that says what
//! each harness does with them.
//!
//! The file is a Claude Code `hooks.json` —
//! `{"hooks": {"<Event>": [{"matcher": "…", "hooks": [{"type": "command",
//! "command": "…", "timeout": 5}]}]}}` — and parses into the same
//! [`agent_adapt::Hook`] a vault hook note does, so both render through one
//! path.
//!
//! Unlike a hook note, a hook a harness cannot carry — its event, or for
//! Cursor its shape (see `agent_adapt::render::hook_refusal`) — does not stop
//! the build: it is left out of that harness's file and listed in the gap
//! report's `left_out`, which is the explicit record of what was left out.
//!
//! A command names the plugin's own files as `${CLAUDE_PLUGIN_ROOT}/…`. Each
//! pack's copy names its harness's own variable instead ([`localize`]),
//! because a hook runs in the session's working directory, not the plugin's
//! (sources: `agent_adapt::runtimes::{codex_cli, cursor}`). Two
//! placeholders are filled per pack: `{{harness}}`, the root's name, and
//! `{{event}}`, the event the hook is registered under, spelled as in the
//! file. Any other `{{…}}`, or an unclosed `{{`, is refused when the file is
//! parsed. Only `command` is rewritten; other fields, and hook notes from the
//! vault, are written as they are.

use std::collections::{BTreeMap, BTreeSet};

use agent_adapt::capabilities::{self, Claim, STOP_CONTINUE};
use agent_adapt::{Hook, HookType, RuntimeId};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::error::CoreError;

/// Where every pack carries its copy of the gap report.
pub const GAP_REPORT_PATH: &str = "hooks/gap-report.json";

/// One harness as the gap report sees it.
#[derive(Debug, Clone, Copy)]
pub struct GapHarness {
    /// The harness's root name (`claude`, `codex`, …).
    pub name: &'static str,
    /// The runtime whose claims answer for it.
    pub runtime: RuntimeId,
    /// Where its pack carries this file's hooks, or `None` when it carries
    /// none of them.
    pub file: Option<&'static str>,
    /// See [`PluginRootVar`]. `None` leaves `${CLAUDE_PLUGIN_ROOT}` as written.
    pub plugin_root_var: Option<PluginRootVar>,
}

/// The variable a hook command names a plugin's installed root by on one
/// harness, and the page it was read from. Serializes, without `name`, as the
/// gap report's `plugin_root_evidence`; fields stay alphabetical, since field
/// order is key order there.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct PluginRootVar {
    /// The variable's name, without `$` or braces.
    #[serde(skip)]
    pub name: &'static str,
    /// What else the source says, including what it leaves open.
    pub note: Option<&'static str>,
    /// ISO date the source was read.
    pub observed_on: &'static str,
    /// The page the name was read from.
    pub url: &'static str,
}

/// The token a hooks file names the plugin root by.
const CANONICAL_ROOT: &str = "${CLAUDE_PLUGIN_ROOT}";

/// The placeholders a hook command may carry; [`localize`] pairs them with
/// their values by position.
const PLACEHOLDERS: [&str; 2] = ["harness", "event"];

/// Parse a canonical hooks file. `from` names the file in every refusal.
///
/// # Errors
///
/// * `refused: malformed-hooks-file` — not JSON, or an entry of the wrong
///   shape; the message names the entry.
/// * `refused: unknown-hook-event` — an event no harness documents.
/// * `refused: unknown-hook-placeholder` — a command carries a `{{…}}` other
///   than `{{harness}}` and `{{event}}`.
pub fn parse_hooks_file(text: &str, from: &str) -> Result<Vec<Hook>, CoreError> {
    let malformed =
        |what: String| CoreError::refused("malformed-hooks-file", format!("{from}: {what}"));
    let root: Value = serde_json::from_str(text).map_err(|e| malformed(e.to_string()))?;
    let Some(root) = root.as_object() else {
        return Err(malformed("the file must be a JSON object".into()));
    };
    if let Some(key) = root.keys().find(|key| *key != "hooks") {
        return Err(malformed(format!("unknown top-level key `{key}`")));
    }
    let Some(events) = root.get("hooks").and_then(Value::as_object) else {
        return Err(malformed("`hooks` must be an object keyed by event".into()));
    };

    let mut out = Vec::new();
    for (event, groups) in events {
        if !capabilities::hook_events().any(|(known, _)| known == event) {
            return Err(CoreError::refused(
                "unknown-hook-event",
                format!("{from}: `hooks.{event}` is not a hook event any harness documents"),
            ));
        }
        let Some(groups) = groups.as_array() else {
            return Err(malformed(format!("`hooks.{event}` must be an array")));
        };
        for (g, group) in groups.iter().enumerate() {
            let at = format!("hooks.{event}[{g}]");
            let Some(group) = group.as_object() else {
                return Err(malformed(format!("`{at}` must be an object")));
            };
            if let Some(key) = group.keys().find(|k| *k != "matcher" && *k != "hooks") {
                return Err(malformed(format!("`{at}` has unknown key `{key}`")));
            }
            let matcher = optional_string(group, "matcher", &at).map_err(malformed)?;
            let Some(entries) = group.get("hooks").and_then(Value::as_array) else {
                return Err(malformed(format!("`{at}.hooks` must be an array")));
            };
            for (h, entry) in entries.iter().enumerate() {
                let at = format!("{at}.hooks[{h}]");
                let hook = parse_entry(entry, event, matcher.clone(), &at).map_err(malformed)?;
                if let Some(bad) = hook.command.as_deref().and_then(unknown_placeholder) {
                    let known = PLACEHOLDERS.map(|p| format!("`{{{{{p}}}}}`")).join(", ");
                    return Err(CoreError::refused(
                        "unknown-hook-placeholder",
                        format!(
                            "{from}: `{at}.command` has `{bad}`; a hook command may use \
                             {known}"
                        ),
                    ));
                }
                out.push(hook);
            }
        }
    }
    Ok(out)
}

/// One hook object. A key the model does not carry travels as an override,
/// merged into the rendered entry unchanged.
fn parse_entry(
    entry: &Value,
    event: &str,
    matcher: Option<String>,
    at: &str,
) -> Result<Hook, String> {
    let Some(entry) = entry.as_object() else {
        return Err(format!("`{at}` must be an object"));
    };
    let r#type = match optional_string(entry, "type", at)? {
        None => HookType::Command,
        Some(spelled) => spelled
            .parse::<HookType>()
            .map_err(|e| format!("`{at}`: {e}"))?,
    };
    let timeout_ms = match entry.get("timeout") {
        None => 0,
        Some(value) => value
            .as_i64()
            .filter(|seconds| *seconds >= 0)
            .map(|seconds| seconds * 1000)
            .ok_or_else(|| format!("`{at}.timeout` must be a whole number of seconds"))?,
    };
    let mut hook = Hook::command(at, at, event, "");
    hook.matcher = matcher;
    hook.r#type = Some(r#type);
    hook.command = optional_string(entry, "command", at)?;
    hook.url = optional_string(entry, "url", at)?;
    hook.prompt = optional_string(entry, "prompt", at)?;
    hook.r#if = optional_string(entry, "if", at)?;
    hook.r#async = optional_bool(entry, "async", at)?;
    hook.once = optional_bool(entry, "once", at)?;
    hook.timeout_ms = timeout_ms;
    const MODELLED: &[&str] = &[
        "type", "timeout", "command", "url", "prompt", "if", "async", "once",
    ];
    hook.overrides = entry
        .iter()
        .filter(|(key, _)| !MODELLED.contains(&key.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();

    let missing = match r#type {
        HookType::Command => hook.command.is_none().then_some("command"),
        HookType::Http => hook.url.is_none().then_some("url"),
        HookType::Prompt => hook.prompt.is_none().then_some("prompt"),
        HookType::McpTool | HookType::Agent => None,
    };
    match missing {
        Some(key) => Err(format!("`{at}` is a `{type}` hook with no `{key}`")),
        None => Ok(hook),
    }
}

fn optional_string(
    map: &Map<String, Value>,
    key: &str,
    at: &str,
) -> Result<Option<String>, String> {
    match map.get(key) {
        None => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone()).filter(|v| !v.trim().is_empty())),
        Some(_) => Err(format!("`{at}.{key}` must be a string")),
    }
}

fn optional_bool(map: &Map<String, Value>, key: &str, at: &str) -> Result<Option<bool>, String> {
    match map.get(key) {
        None => Ok(None),
        Some(Value::Bool(value)) => Ok(Some(*value)),
        Some(_) => Err(format!("`{at}.{key}` must be `true` or `false`")),
    }
}

/// The first `{{name}}` in `command` that is not a known placeholder, or an
/// unclosed `{{` and the rest of the command, as written.
fn unknown_placeholder(command: &str) -> Option<&str> {
    let mut rest = command;
    while let Some(open) = rest.find("{{") {
        let Some(close) = rest[open + 2..].find("}}") else {
            return Some(&rest[open..]);
        };
        let end = open + 2 + close + 2;
        if !PLACEHOLDERS.contains(&&rest[open + 2..end - 2]) {
            return Some(&rest[open..end]);
        }
        rest = &rest[end..];
    }
    None
}

/// `hook` as the pack for root `harness` carries it: `${CLAUDE_PLUGIN_ROOT}`
/// in its command becomes `${<plugin_root_var>}` (left as is when `None`, or
/// when a name character follows it), and the placeholders are filled.
pub fn localize(mut hook: Hook, harness: &str, plugin_root_var: Option<&str>) -> Hook {
    let Some(mut command) = hook.command.take() else {
        return hook;
    };
    if let Some(var) = plugin_root_var {
        let with = format!("${{{var}}}");
        command = crate::text::replace_bounded(&command, CANONICAL_ROOT, &with, |c| {
            c.is_alphanumeric() || c == '_'
        })
        .0;
    }
    for (name, value) in PLACEHOLDERS.iter().zip([harness, hook.event.as_str()]) {
        command = command.replace(&format!("{{{{{name}}}}}"), value);
    }
    hook.command = Some(command);
    hook
}

/// The hooks `runtime` carries, in file order. The others are left out and
/// listed in the gap report; see the module doc.
pub fn carried_hooks(hooks: &[Hook], runtime: RuntimeId) -> Vec<Hook> {
    hooks
        .iter()
        .filter(|hook| agent_adapt::render::hook_refusal(hook, runtime).is_none())
        .cloned()
        .collect()
}

// Field order is key order: `stable_json` keeps it, so the fields of these
// structs stay alphabetical.
#[derive(Serialize)]
struct GapReport<'a> {
    harnesses: BTreeMap<&'static str, HarnessGap>,
    source: &'a str,
    version: u32,
}

#[derive(Serialize)]
struct HarnessGap {
    behaviours: BTreeMap<String, ClaimEntry>,
    delivery: &'static str,
    events: BTreeMap<String, ClaimEntry>,
    file: Option<&'static str>,
    left_out: Vec<LeftOut>,
    plugin_root_evidence: Option<PluginRootVar>,
    plugin_root_var: Option<&'static str>,
}

#[derive(Serialize)]
struct LeftOut {
    hook: String,
    reason: String,
}

#[derive(Serialize)]
struct ClaimEntry {
    note: Option<&'static str>,
    spelling: Option<String>,
    support: &'static str,
}

impl From<&Claim> for ClaimEntry {
    fn from(claim: &Claim) -> Self {
        Self {
            note: claim.note,
            spelling: claim.harness_spelling.clone(),
            support: claim.support.as_str(),
        }
    }
}

/// The gap report for one hooks file: per harness, whether its pack carries
/// a hooks file, each event the file uses with that harness's claim, every
/// hook left out of its file and why, its `stop-continue` behaviour, and the
/// variable its hook commands name the plugin root by, with its source.
///
/// Sorted keys, two-space indent, one trailing newline and nothing
/// time-dependent, so two builds give identical bytes.
pub fn render_gap_report(from: &str, hooks: &[Hook], harnesses: &[GapHarness]) -> String {
    let events: BTreeSet<&str> = hooks.iter().map(|hook| hook.event.as_str()).collect();
    let report = GapReport {
        harnesses: harnesses
            .iter()
            .map(|harness| {
                let declaration = agent_adapt::runtimes::declaration_for(harness.runtime);
                let gap = HarnessGap {
                    behaviours: [STOP_CONTINUE]
                        .into_iter()
                        .filter_map(|key| {
                            let claim = declaration.behaviours.get(key)?;
                            Some((key.to_owned(), ClaimEntry::from(claim)))
                        })
                        .collect(),
                    delivery: if harness.file.is_some() {
                        "plugin"
                    } else {
                        "none"
                    },
                    events: events
                        .iter()
                        .filter_map(|event| {
                            let claim = declaration.hook_events.get(*event)?;
                            Some(((*event).to_owned(), ClaimEntry::from(claim)))
                        })
                        .collect(),
                    file: harness.file,
                    left_out: hooks
                        .iter()
                        .filter_map(|hook| {
                            let reason = agent_adapt::render::hook_refusal(hook, harness.runtime)?;
                            Some(LeftOut {
                                hook: hook.slug.clone(),
                                reason,
                            })
                        })
                        .collect(),
                    plugin_root_evidence: harness.plugin_root_var,
                    plugin_root_var: harness.plugin_root_var.map(|var| var.name),
                };
                (harness.name, gap)
            })
            .collect(),
        source: from,
        version: 1,
    };
    crate::export::stable_json(&report)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FILE: &str = r#"{"hooks": {
        "SessionStart": [{"hooks": [{"type": "command", "command": "start", "timeout": 5}]}],
        "Stop": [{"matcher": "", "hooks": [{"command": "stop", "statusMessage": "bye"}]}]
    }}"#;

    #[test]
    fn a_canonical_file_parses_into_hooks() {
        let hooks = parse_hooks_file(FILE, "hooks.json").unwrap();
        assert_eq!(hooks.len(), 2);
        assert_eq!(hooks[0].event, "SessionStart");
        assert_eq!(hooks[0].timeout_ms, 5000);
        assert_eq!(hooks[1].command.as_deref(), Some("stop"));
        assert_eq!(hooks[1].overrides["statusMessage"], "bye");
    }

    #[test]
    fn an_unknown_event_names_the_file_and_the_event() {
        let err = parse_hooks_file(r#"{"hooks": {"OnBoot": []}}"#, "plugin/hooks.json")
            .unwrap_err()
            .to_string();
        assert!(err.contains("unknown-hook-event"), "{err}");
        assert!(err.contains("plugin/hooks.json"), "{err}");
        assert!(err.contains("OnBoot"), "{err}");
    }

    #[test]
    fn a_malformed_entry_names_the_entry() {
        let err = parse_hooks_file(
            r#"{"hooks": {"Stop": [{"hooks": [{"command": 3}]}]}}"#,
            "hooks.json",
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("malformed-hooks-file"), "{err}");
        assert!(err.contains("hooks.Stop[0].hooks[0].command"), "{err}");
    }

    #[test]
    fn a_command_hook_without_a_command_is_refused() {
        let err = parse_hooks_file(r#"{"hooks": {"Stop": [{"hooks": [{}]}]}}"#, "h.json")
            .unwrap_err()
            .to_string();
        assert!(err.contains("no `command`"), "{err}");
    }

    #[test]
    fn carried_hooks_leaves_out_what_the_runtime_does_not_carry() {
        let hooks = parse_hooks_file(
            r#"{"hooks": {"Stop": [{"hooks": [{"command": "a"}]}], "Notification": [{"hooks": [{"command": "b"}]}]}}"#,
            "h.json",
        )
        .unwrap();
        let cursor = carried_hooks(&hooks, RuntimeId::Cursor);
        assert_eq!(cursor.len(), 1);
        assert_eq!(cursor[0].event, "Stop");
        assert_eq!(carried_hooks(&hooks, RuntimeId::ClaudeCode).len(), 2);
    }

    #[test]
    fn the_gap_report_is_sorted_and_ends_in_one_newline() {
        let hooks = parse_hooks_file(FILE, "hooks.json").unwrap();
        let harnesses = [
            GapHarness {
                name: "pi",
                runtime: RuntimeId::Pi,
                file: None,
                plugin_root_var: None,
            },
            GapHarness {
                name: "cursor",
                runtime: RuntimeId::Cursor,
                file: Some("hooks/hooks.json"),
                plugin_root_var: Some(PluginRootVar {
                    name: "CURSOR_PLUGIN_ROOT",
                    note: None,
                    observed_on: "2026-10-05",
                    url: "https://example.test/plugins",
                }),
            },
        ];
        let text = render_gap_report("hooks.json", &hooks, &harnesses);
        assert!(text.ends_with("}\n") && !text.ends_with("\n\n"));
        assert!(text.find("\"cursor\"").unwrap() < text.find("\"pi\"").unwrap());
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["version"], 1);
        assert_eq!(value["harnesses"]["pi"]["delivery"], "none");
        assert_eq!(value["harnesses"]["cursor"]["delivery"], "plugin");
        assert_eq!(
            value["harnesses"]["cursor"]["events"]["Stop"]["spelling"],
            "stop"
        );
        assert_eq!(
            value["harnesses"]["cursor"]["behaviours"]["stop-continue"]["support"],
            "translated"
        );
        assert_eq!(
            value["harnesses"]["cursor"]["plugin_root_var"],
            "CURSOR_PLUGIN_ROOT"
        );
        assert_eq!(
            value["harnesses"]["cursor"]["plugin_root_evidence"]["observed_on"],
            "2026-10-05"
        );
        assert_eq!(value["harnesses"]["pi"]["plugin_root_var"], Value::Null);
    }

    fn command(text: &str) -> Hook {
        Hook::command("h", "h", "Stop", text)
    }

    #[test]
    fn localize_names_the_harness_variable() {
        let hook = localize(
            command("${CLAUDE_PLUGIN_ROOT}/cli/sdlc x"),
            "codex",
            Some("PLUGIN_ROOT"),
        );
        assert_eq!(hook.command.as_deref(), Some("${PLUGIN_ROOT}/cli/sdlc x"));
    }

    #[test]
    fn localize_leaves_a_longer_token_alone() {
        let hook = localize(
            command("${CLAUDE_PLUGIN_ROOT}x ${CLAUDE_PLUGIN_ROOT}_Y ${CLAUDE_PLUGIN_ROOT}"),
            "cursor",
            Some("CURSOR_PLUGIN_ROOT"),
        );
        assert_eq!(
            hook.command.as_deref(),
            Some("${CLAUDE_PLUGIN_ROOT}x ${CLAUDE_PLUGIN_ROOT}_Y ${CURSOR_PLUGIN_ROOT}")
        );
    }

    #[test]
    fn localize_fills_the_placeholders() {
        let hook = localize(
            command("run --harness {{harness}} --event {{event}}"),
            "cursor",
            None,
        );
        assert_eq!(
            hook.command.as_deref(),
            Some("run --harness cursor --event Stop")
        );
    }

    #[test]
    fn an_unclosed_placeholder_is_refused() {
        let err = parse_hooks_file(
            r#"{"hooks": {"Stop": [{"hooks": [{"command": "run {{harness"}]}]}}"#,
            "h.json",
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("unknown-hook-placeholder"), "{err}");
        assert!(err.contains("`{{harness`"), "{err}");
    }

    #[test]
    fn an_unknown_placeholder_names_the_hook() {
        let err = parse_hooks_file(
            r#"{"hooks": {"Stop": [{"hooks": [{"command": "run {{harness}} {{foo}}"}]}]}}"#,
            "h.json",
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("unknown-hook-placeholder"), "{err}");
        assert!(err.contains("hooks.Stop[0].hooks[0]"), "{err}");
        assert!(err.contains("{{foo}}"), "{err}");
    }
}

//! Render a collection of [`Hook`]s into the `hooks.json` shape the
//! harnesses actually read.
//!
//! The format is nested, keyed by the *target's* own event name:
//!
//! ```json
//! {
//!   "hooks": {
//!     "PreToolUse": [
//!       { "matcher": "Edit|Write",
//!         "hooks": [{ "type": "command", "command": "just lint", "timeout": 5 }] }
//!     ]
//!   }
//! }
//! ```
//!
//! Two levels of grouping, both of which the shape exists for: one entry per
//! event, and inside it one group per matcher, so several hooks watching the
//! same tools share one matcher rather than repeating it.
//!
//! # Two translations, and a refusal
//!
//! * **Tool names.** Matchers are pipe-delimited canonical names (e.g.
//!   `"Edit|Write"`). Each half goes through [`ToolRegistry`], so a target
//!   with its own tool vocabulary sees its own names.
//! * **Event names.** The event goes through
//!   [`crate::capabilities::hook_event_spelling`], so a target that names an
//!   event differently receives its own spelling.
//! * **The refusal.** An event the target does not carry stops the whole
//!   render, naming the event and the target. Nothing partial is written:
//!   a `hooks.json` missing one hook looks exactly like a `hooks.json` that
//!   was authored without it.
//!
//! # What the far side actually reads
//!
//! [`crate::capabilities`]'s hook-event rows carry the sourced difference,
//! and this renderer follows them:
//!
//! * Claude Code and Codex CLI read this file and this event vocabulary, from
//!   a project's own hooks file or from an enabled plugin's
//!   `hooks/hooks.json` (<https://developers.openai.com/codex/hooks> and
//!   <https://developers.openai.com/codex/plugins/build>, read 2026-10-05).
//! * Cursor reads its own `{ "version": 1, "hooks": {…} }` shape, flat per
//!   event with the matcher on each entry, from `.cursor/hooks.json` or a
//!   plugin's hooks file (<https://cursor.com/docs/hooks>,
//!   <https://cursor.com/docs/reference/plugins>, read 2026-10-05).
//!   [`render_cursor_hooks_json`] writes it.
//! * Antigravity documents no hook format at all, so every event refuses
//!   for it.
//! * OpenCode and Amp take hooks as plugin *code* — `.ts`/`.js` modules
//!   registering `tool.execute.before` or `amp.on("tool.call", …)` — and
//!   document no `hooks.json` at all, so every event refuses for them.
//!
//! # Timeouts are seconds here
//!
//! [`Hook::timeout_ms`] is milliseconds, because that is the unit the model
//! carries everywhere else. The harnesses document `timeout` in **seconds**,
//! so this rounds up to whole seconds on the way out — a sub-second timeout
//! becomes one second rather than zero, which is the only rounding that
//! cannot silently disable a hook.

use std::collections::BTreeMap;

use serde_json::{Map, Value};

use crate::capabilities::hook_event_spelling;
use crate::{Error, Hook, HookType, Result, RuntimeId, ToolRegistry};

/// Rebuilds `value` with every object's keys sorted, at every depth.
///
/// `serde_json::Map` keeps insertion order when `serde_json` is built with
/// `preserve_order`, so the sort has to be explicit for the output to be
/// byte-identical run to run. Recursive because an `sw-overrides` value can
/// itself be an object.
fn sorted(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, value)| (key, sorted(value)))
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(sorted).collect()),
        other => other,
    }
}

/// Render `hooks` as the complete contents of a `hooks.json` file.
///
/// # Errors
///
/// [`Error::Validation`] where the target does not carry a hook's event —
/// see the module docs. Serialization failures surface as [`Error::Json`].
pub fn render_hooks_json(
    hooks: &[Hook],
    runtime: RuntimeId,
    registry: &ToolRegistry,
) -> Result<String> {
    render_hooks_json_reporting(hooks, runtime, registry).map(|(text, _)| text)
}

/// [`render_hooks_json`], plus the redundant-override report: every
/// `<slug>.<key>` whose [`Hook::overrides`] value is what the entry already
/// carried.
///
/// A hook's override merges into its own entry, last, so a key the modelled
/// fields wrote (`matcher`, `timeout`) is replaced and a key nothing models
/// is added. Same contract as a skill's frontmatter, in the one format that
/// is not YAML. `matcher` is the one override that reaches the *group*
/// rather than the hook object, because that is where the shape keeps it —
/// which is what makes overriding a matcher regroup the hook rather than
/// write a key the harness ignores.
///
/// # Errors
///
/// The same refusal and serialization failures [`render_hooks_json`] raises.
pub(crate) fn render_hooks_json_reporting(
    hooks: &[Hook],
    runtime: RuntimeId,
    registry: &ToolRegistry,
) -> Result<(String, Vec<String>)> {
    let mut redundant = Vec::new();
    // `(event, matcher)` in first-seen order, each holding its hook objects.
    let mut groups: Vec<(String, Option<String>, Vec<Value>)> = Vec::new();

    for hook in hooks {
        let event = hook_event_spelling(runtime, &hook.event)?;
        let mut entry = hook_entry(hook, runtime, registry);
        apply_overrides(&mut entry, hook, &mut redundant);

        let matcher = match entry.remove("matcher") {
            Some(Value::String(matcher)) if !matcher.is_empty() => Some(matcher),
            Some(Value::String(_)) | None => None,
            Some(other) => Some(other.to_string()),
        };

        match groups
            .iter_mut()
            .find(|(e, m, _)| *e == event && *m == matcher)
        {
            Some((_, _, entries)) => entries.push(Value::Object(entry)),
            None => groups.push((event, matcher, vec![Value::Object(entry)])),
        }
    }

    let mut by_event: Map<String, Value> = Map::new();
    for (event, matcher, entries) in groups {
        let mut group = Map::new();
        if let Some(matcher) = matcher {
            group.insert("matcher".into(), Value::String(matcher));
        }
        group.insert("hooks".into(), Value::Array(entries));
        match by_event.get_mut(&event) {
            Some(Value::Array(list)) => list.push(Value::Object(group)),
            _ => {
                by_event.insert(event, Value::Array(vec![Value::Object(group)]));
            }
        }
    }

    let root = sorted(serde_json::json!({ "hooks": Value::Object(by_event) }));
    let text = serde_json::to_string_pretty(&root).map_err(Error::from)?;
    Ok((text, redundant))
}

/// Render `hooks` in Cursor's `{ "version": 1, "hooks": { "<event>": [{…}] } }`
/// shape, plus the redundant-override report `render_hooks_json_reporting`
/// returns.
///
/// Each entry is flat: `command`, `timeout` in seconds, and `matcher`, with no
/// matcher groups. The event name goes through Cursor's own claim, so
/// `UserPromptSubmit` arrives as `beforeSubmitPrompt`. An override merges into
/// the entry last, as in the nested shape.
///
/// # Errors
///
/// [`Error::Validation`] for an event Cursor does not carry, for a hook type
/// other than `command`, and for `if`, `async` or `once`: Cursor documents
/// none of the three, and a dropped guard is a hook that runs when it should
/// not.
pub fn render_cursor_hooks_json(
    hooks: &[Hook],
    registry: &ToolRegistry,
) -> Result<(String, Vec<String>)> {
    let runtime = RuntimeId::Cursor;
    let mut redundant = Vec::new();
    let mut by_event: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for hook in hooks {
        let event = hook_event_spelling(runtime, &hook.event)?;
        if let Some(why) = cursor_shape_refusal(hook) {
            return Err(Error::Validation(why));
        }
        let mut entry = hook_entry(hook, runtime, registry);
        entry.remove("type");
        apply_overrides(&mut entry, hook, &mut redundant);
        by_event
            .entry(event)
            .or_default()
            .push(Value::Object(entry));
    }
    let root = sorted(serde_json::json!({ "version": 1, "hooks": by_event }));
    let text = serde_json::to_string_pretty(&root).map_err(Error::from)?;
    Ok((text, redundant))
}

/// Why `runtime`'s hooks file cannot carry `hook`, or `None` when it can: the
/// event's claim, then the shape — the refusals [`render_hooks_json`] and
/// [`render_cursor_hooks_json`] would raise, without rendering.
pub fn hook_refusal(hook: &Hook, runtime: RuntimeId) -> Option<String> {
    if let Err(err) = hook_event_spelling(runtime, &hook.event) {
        return Some(match err {
            Error::Validation(msg) => msg,
            other => other.to_string(),
        });
    }
    match runtime {
        RuntimeId::Cursor => cursor_shape_refusal(hook),
        _ => None,
    }
}

/// What Cursor's flat entry cannot hold: a hook type other than `command`, or
/// `if`, `async` or `once`, none of which Cursor documents.
fn cursor_shape_refusal(hook: &Hook) -> Option<String> {
    if hook.effective_type() != HookType::Command {
        return Some(format!(
            "hook `{}` is a `{}` hook; this crate renders only `command` hooks for cursor",
            hook.slug,
            hook.effective_type()
        ));
    }
    let undocumented = if hook.r#if.is_some() {
        "if"
    } else if hook.r#async.is_some() {
        "async"
    } else if hook.once.is_some() {
        "once"
    } else {
        return None;
    };
    Some(format!(
        "hook `{}` sets `{undocumented}`, which cursor's hooks file does not document",
        hook.slug
    ))
}

/// Merges `hook`'s overrides into `entry`, last, reporting each one whose
/// value the entry already carried as `<slug>.<key>`.
fn apply_overrides(entry: &mut Map<String, Value>, hook: &Hook, redundant: &mut Vec<String>) {
    for (key, value) in &hook.overrides {
        if entry.get(key) == Some(value) {
            redundant.push(format!("{}.{key}", hook.slug));
        } else {
            entry.insert(key.clone(), value.clone());
        }
    }
}

/// One hook as a flat map — the hook object's own keys plus `matcher`, which
/// `render_hooks_json_reporting` lifts onto the group once the override has
/// had its say.
fn hook_entry(hook: &Hook, runtime: RuntimeId, registry: &ToolRegistry) -> Map<String, Value> {
    let mut entry = Map::new();

    if let Some(matcher) = hook.matcher.as_deref()
        && !matcher.is_empty()
    {
        let translated: String = matcher
            .split('|')
            .map(|m| registry.translate_tool_name(m.trim(), runtime))
            .collect::<Vec<_>>()
            .join("|");
        entry.insert("matcher".into(), Value::String(translated));
    }

    entry.insert(
        "type".into(),
        Value::String(hook.effective_type().as_str().to_owned()),
    );
    for (key, value) in [
        ("command", hook.command.as_deref()),
        ("url", hook.url.as_deref()),
        ("prompt", hook.prompt.as_deref()),
        ("if", hook.r#if.as_deref()),
    ] {
        if let Some(value) = value.filter(|v| !v.is_empty()) {
            entry.insert(key.into(), Value::String(value.to_owned()));
        }
    }
    for (key, value) in [("async", hook.r#async), ("once", hook.once)] {
        if let Some(value) = value {
            entry.insert(key.into(), Value::Bool(value));
        }
    }
    if hook.timeout_ms > 0 {
        entry.insert("timeout".into(), serde_json::json!(timeout_seconds(hook)));
    }
    entry
}

/// Converts [`Hook::timeout_ms`] to whole seconds; see the module docs' "Timeouts are seconds here" for why this rounds up rather than down.
fn timeout_seconds(hook: &Hook) -> i64 {
    (hook.timeout_ms + 999) / 1000
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_hook() -> Hook {
        let mut hook = Hook::command("Lint", "lint", "PreToolUse", "just lint");
        hook.matcher = Some("Edit|Write".into());
        hook.timeout_ms = 5000;
        hook
    }

    fn rendered(hooks: &[Hook], runtime: RuntimeId) -> Value {
        let out = render_hooks_json(hooks, runtime, &ToolRegistry::default()).unwrap();
        serde_json::from_str(&out).unwrap()
    }

    #[test]
    fn the_event_keys_the_object_and_the_matcher_keys_the_group() {
        let v = rendered(&[sample_hook()], RuntimeId::ClaudeCode);
        let group = &v["hooks"]["PreToolUse"][0];
        assert_eq!(group["matcher"], "Edit|Write");
        assert_eq!(group["hooks"][0]["type"], "command");
        assert_eq!(group["hooks"][0]["command"], "just lint");
    }

    #[test]
    fn an_event_the_target_does_not_carry_refuses_by_name() {
        // AC-5: Antigravity documents no hook events, so the render stops
        // rather than writing a file missing one hook.
        let mut hook = sample_hook();
        hook.event = "SubagentStop".into();
        let err = render_hooks_json(&[hook], RuntimeId::Antigravity, &ToolRegistry::default())
            .unwrap_err();
        let text = err.to_string();
        assert!(text.contains("SubagentStop"), "{text}");
        assert!(text.contains("antigravity"), "{text}");
    }

    #[test]
    fn a_target_that_reads_no_hooks_json_refuses_every_event() {
        for runtime in [RuntimeId::OpenCode, RuntimeId::Amp, RuntimeId::Antigravity] {
            let err =
                render_hooks_json(&[sample_hook()], runtime, &ToolRegistry::default()).unwrap_err();
            assert!(err.to_string().contains(runtime.as_str()), "{err}");
        }
    }

    #[test]
    fn two_hooks_on_one_event_and_matcher_share_a_group() {
        let mut second = sample_hook();
        second.slug = "format".into();
        second.command = Some("just fmt".into());
        let v = rendered(&[sample_hook(), second], RuntimeId::ClaudeCode);
        let groups = v["hooks"]["PreToolUse"].as_array().unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0]["hooks"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn a_different_matcher_on_the_same_event_is_its_own_group() {
        let mut second = sample_hook();
        second.slug = "bash-guard".into();
        second.matcher = Some("Bash".into());
        let v = rendered(&[sample_hook(), second], RuntimeId::ClaudeCode);
        let groups = v["hooks"]["PreToolUse"].as_array().unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[1]["matcher"], "Bash");
    }

    #[test]
    fn a_prompt_hook_carries_its_prompt_and_no_command() {
        let mut hook = sample_hook();
        hook.r#type = Some(HookType::Prompt);
        hook.command = None;
        hook.prompt = Some("Summarise the diff.".into());
        let v = rendered(&[hook], RuntimeId::ClaudeCode);
        let entry = &v["hooks"]["PreToolUse"][0]["hooks"][0];
        assert_eq!(entry["type"], "prompt");
        assert_eq!(entry["prompt"], "Summarise the diff.");
        assert!(entry["command"].is_null());
    }

    #[test]
    fn the_optional_flags_are_written_only_where_they_were_set() {
        let mut hook = sample_hook();
        hook.r#if = Some("$CI".into());
        hook.r#async = Some(true);
        let v = rendered(&[hook], RuntimeId::ClaudeCode);
        let entry = &v["hooks"]["PreToolUse"][0]["hooks"][0];
        assert_eq!(entry["if"], "$CI");
        assert_eq!(entry["async"], true);
        assert!(entry["once"].is_null());
    }

    #[test]
    fn the_timeout_arrives_in_whole_seconds() {
        let v = rendered(&[sample_hook()], RuntimeId::ClaudeCode);
        assert_eq!(v["hooks"]["PreToolUse"][0]["hooks"][0]["timeout"], 5);
    }

    #[test]
    fn a_sub_second_timeout_rounds_up_rather_than_to_no_timeout() {
        let mut hook = sample_hook();
        hook.timeout_ms = 400;
        let v = rendered(&[hook], RuntimeId::ClaudeCode);
        assert_eq!(v["hooks"]["PreToolUse"][0]["hooks"][0]["timeout"], 1);
    }

    #[test]
    fn zero_timeout_omitted() {
        let mut hook = sample_hook();
        hook.timeout_ms = 0;
        let v = rendered(&[hook], RuntimeId::ClaudeCode);
        assert!(v["hooks"]["PreToolUse"][0]["hooks"][0]["timeout"].is_null());
    }

    #[test]
    fn an_override_merges_into_the_hook_object_last() {
        // AC-6: exercises the override-merge contract documented on
        // `render_hooks_json_reporting` above.
        let mut h = sample_hook();
        h.overrides = serde_json::json!({"matcher": "Bash", "blocking": true})
            .as_object()
            .unwrap()
            .clone();
        let (out, redundant) =
            render_hooks_json_reporting(&[h], RuntimeId::ClaudeCode, &ToolRegistry::default())
                .unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        let group = &v["hooks"]["PreToolUse"][0];
        assert_eq!(group["matcher"], "Bash");
        assert_eq!(group["hooks"][0]["blocking"], true);
        assert_eq!(group["hooks"][0]["command"], "just lint");
        assert!(redundant.is_empty(), "{redundant:?}");
    }

    #[test]
    fn a_hook_override_equal_to_the_entry_is_reported_as_redundant() {
        let mut h = sample_hook();
        h.overrides = serde_json::json!({"command": "just lint"})
            .as_object()
            .unwrap()
            .clone();
        let (_, redundant) =
            render_hooks_json_reporting(&[h], RuntimeId::ClaudeCode, &ToolRegistry::default())
                .unwrap();
        assert_eq!(redundant, vec!["lint.command".to_string()]);
    }

    fn cursor(hooks: &[Hook]) -> Value {
        let (out, _) = render_cursor_hooks_json(hooks, &ToolRegistry::default()).unwrap();
        serde_json::from_str(&out).unwrap()
    }

    #[test]
    fn cursor_writes_its_own_versioned_flat_shape() {
        let mut hook = sample_hook();
        hook.matcher = Some("Bash".into());
        let v = cursor(&[hook]);
        assert_eq!(v["version"], 1);
        let entry = &v["hooks"]["preToolUse"][0];
        assert_eq!(entry["command"], "just lint");
        assert_eq!(entry["timeout"], 5);
        assert_eq!(entry["matcher"], "Shell");
        assert!(entry["hooks"].is_null() && entry["type"].is_null(), "{v}");
    }

    #[test]
    fn cursor_spells_events_its_own_way() {
        let prompt = Hook::command("p", "p", "UserPromptSubmit", "a");
        let stop = Hook::command("s", "s", "Stop", "b");
        let v = cursor(&[prompt, stop]);
        assert_eq!(v["hooks"]["beforeSubmitPrompt"][0]["command"], "a");
        assert_eq!(v["hooks"]["stop"][0]["command"], "b");
    }

    #[test]
    fn cursor_refuses_what_its_shape_cannot_carry() {
        let mut prompt = sample_hook();
        prompt.r#type = Some(HookType::Prompt);
        let mut guarded = sample_hook();
        guarded.r#if = Some("$CI".into());
        let mut uncarried = sample_hook();
        uncarried.event = "Notification".into();
        for hook in [prompt, guarded, uncarried] {
            assert!(render_cursor_hooks_json(&[hook], &ToolRegistry::default()).is_err());
        }
    }

    #[test]
    fn hook_refusal_names_the_event_and_the_shape() {
        let mut prompt = sample_hook();
        prompt.r#type = Some(HookType::Prompt);
        prompt.command = None;
        prompt.prompt = Some("p".into());
        assert!(hook_refusal(&prompt, RuntimeId::ClaudeCode).is_none());
        assert!(hook_refusal(&prompt, RuntimeId::Cursor).is_some());
        let mut notification = sample_hook();
        notification.event = "Notification".into();
        assert!(hook_refusal(&notification, RuntimeId::Cursor).is_some());
    }

    #[test]
    fn empty_matcher_omitted() {
        let mut h = sample_hook();
        h.matcher = Some(String::new());
        let v = rendered(&[h], RuntimeId::ClaudeCode);
        assert!(v["hooks"]["PreToolUse"][0]["matcher"].is_null());
    }
}

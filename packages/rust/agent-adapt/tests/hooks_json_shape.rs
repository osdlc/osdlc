//! The `hooks.json` a harness actually reads, asserted whole.
//!
//! The unit tests beside `render_hooks_json` check one key at a time. These
//! check the *document* — nesting, grouping, key names, the translated event
//! and matcher — because the shape is the contract with the harness and a
//! per-key assertion cannot see a level go missing.

use agent_adapt::render::render_hooks_json;
use agent_adapt::{Hook, HookType, RuntimeId, ToolRegistry};

fn lint_hook() -> Hook {
    let mut hook = Hook::command("Lint", "lint", "PreToolUse", "just lint");
    hook.matcher = Some("Edit|Write".into());
    hook.timeout_ms = 5000;
    hook
}

fn stop_hook() -> Hook {
    let mut hook = Hook::command("Report", "report", "Stop", "just report");
    hook.r#async = Some(true);
    hook
}

// Key order is alphabetical: the renderer sorts explicitly (see `sorted` in
// render/hooks_json.rs).
#[test]
fn the_claude_code_render_is_the_documented_nesting() {
    let out = render_hooks_json(
        &[lint_hook(), stop_hook()],
        RuntimeId::ClaudeCode,
        &ToolRegistry::default(),
    )
    .unwrap();

    assert_eq!(
        out,
        r#"{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "command": "just lint",
            "timeout": 5,
            "type": "command"
          }
        ],
        "matcher": "Edit|Write"
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "async": true,
            "command": "just report",
            "type": "command"
          }
        ]
      }
    ]
  }
}"#
    );
}

#[test]
fn a_prompt_hook_renders_its_prompt_in_place_of_a_command() {
    let mut hook = Hook::command("Summarise", "summarise", "PostToolUse", "");
    hook.r#type = Some(HookType::Prompt);
    hook.command = None;
    hook.prompt = Some("Summarise what changed.".into());
    hook.once = Some(true);

    let out = render_hooks_json(&[hook], RuntimeId::ClaudeCode, &ToolRegistry::default()).unwrap();

    assert_eq!(
        out,
        r#"{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "once": true,
            "prompt": "Summarise what changed.",
            "type": "prompt"
          }
        ]
      }
    ]
  }
}"#
    );
}

#[test]
fn one_unmapped_event_refuses_the_whole_document() {
    let mut orphan = lint_hook();
    orphan.slug = "orphan".into();
    orphan.event = "TeammateIdle".into();

    let err = render_hooks_json(
        &[lint_hook(), orphan],
        RuntimeId::CodexCli,
        &ToolRegistry::default(),
    )
    .unwrap_err();

    let text = err.to_string();
    assert!(text.contains("TeammateIdle"), "{text}");
    assert!(text.contains("codex-cli"), "{text}");
}

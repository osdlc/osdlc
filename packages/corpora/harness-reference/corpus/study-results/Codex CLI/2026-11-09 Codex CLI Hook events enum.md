---
kind: source
reportedIn:
  - "[openai codex protocol src protocol.rs at c138238](../../documents/github.com/openai%20codex%20protocol%20src%20protocol.rs%20at%20c138238.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.162.0
version_basis: exact
observed: 2026-11-09
locator: codex-rs/protocol/src/protocol.rs#L1595-L1608 at c1382380de69521303b416720a52f42d51af6248
excerpt:
  exact: pub enum HookEventName { PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, Stop, Interrupt, }
  prefix: 'rde(rename_all = "snake_case")] '
  suffix: " #[derive(Debug, Clone, Copy, De"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
---

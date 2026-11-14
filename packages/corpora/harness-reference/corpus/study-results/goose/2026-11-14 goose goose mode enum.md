---
kind: source
reportedIn:
  - "[aaif-goose goose goose_mode.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20goose_mode.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-provider-types/src/goose_mode.rs#L24-L31 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: '#[strum(message = "Automatically approve tool calls")] Auto, #[strum(message = "Ask before every tool call")] Approve, #[strum(message = "Ask only for sensitive tool calls")] SmartApprove, #[strum(message = "Chat only, no tool calls")] Chat,'
  prefix: "pub enum GooseMode { #[default] "
  suffix: " }"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> #[strum(message = "Automatically approve tool calls")] Auto, #[strum(message = "Ask before every tool call")] Approve, #[strum(message = "Ask only for sensitive tool calls")] SmartApprove, #[strum(message = "Chat only, no tool calls")] Chat,

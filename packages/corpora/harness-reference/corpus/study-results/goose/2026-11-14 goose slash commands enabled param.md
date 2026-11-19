---
kind: source
reportedIn:
  - "[aaif-goose goose execute_commands.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20execute_commands.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/agents/execute_commands.rs#L5-L6 at 2365bc5e898a38133c373eef2d1357416acd66e2 (slash_commands_enabled)
excerpt:
  exact: .get_param::<bool>("GOOSE_SLASH_COMMANDS_ENABLED") .unwrap_or(true)
  prefix: "crate::config::Config::global() "
  suffix: " } pub const COMPACT_TRIGGERS: &"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> .get_param::<bool>("GOOSE_SLASH_COMMANDS_ENABLED") .unwrap_or(true)

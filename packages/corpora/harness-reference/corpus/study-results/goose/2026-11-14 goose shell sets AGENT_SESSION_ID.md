---
kind: source
reportedIn:
  - "[aaif-goose goose developer shell.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20developer%20shell.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/agents/platform_extensions/developer/shell.rs#L616-L618 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: 'fn apply_session_environment(command: &mut tokio::process::Command, session_id: Option<&str>) { if let Some(session_id) = session_id.filter(|id| !id.is_empty()) { command.env("AGENT_SESSION_ID", session_id);'
  prefix: "_args(command_line)); command } "
  suffix: ' } else { command.env_remove("AG'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> fn apply_session_environment(command: &mut tokio::process::Command, session_id: Option<&str>) { if let Some(session_id) = session_id.filter(|id| !id.is_empty()) { command.env("AGENT_SESSION_ID", session_id);

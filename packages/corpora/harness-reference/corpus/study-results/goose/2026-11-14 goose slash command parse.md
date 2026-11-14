---
kind: source
reportedIn:
  - "[aaif-goose goose ops_slash_command.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20ops_slash_command.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/agents/state_machine/ops_slash_command.rs#L27-L31 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: let command = message.strip_prefix('/')?; let (command, params_str) = command .split_once(' ') .map(|(command, params)| (command, params.trim())) .unwrap_or((command, ""));
  prefix: 'ze" ) { message = "/compact"; } '
  suffix: " Some(SlashCommand { command, pa"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> let command = message.strip_prefix('/')?; let (command, params_str) = command .split_once(' ') .map(|(command, params)| (command, params.trim())) .unwrap_or((command, ""));

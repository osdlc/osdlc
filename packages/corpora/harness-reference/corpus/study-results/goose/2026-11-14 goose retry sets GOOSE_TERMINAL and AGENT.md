---
kind: source
reportedIn:
  - "[aaif-goose goose retry.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20retry.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/agents/retry.rs#L60-L62 at 2365bc5e898a38133c373eef2d1357416acd66e2 (execute_shell_command)
excerpt:
  exact: cmd.args(["-c", command]); cmd.env("GOOSE_TERMINAL", "1"); cmd.env("AGENT", "goose");
  prefix: 't mut cmd = Command::new("sh"); '
  suffix: " cmd }; cmd.set_no_window(); let"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> cmd.args(["-c", command]); cmd.env("GOOSE_TERMINAL", "1"); cmd.env("AGENT", "goose");

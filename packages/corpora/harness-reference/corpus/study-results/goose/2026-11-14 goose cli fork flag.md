---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L940-L942 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: requires = "resume", help = "Fork a previous session (creates new session with copied history)", long_help = "Create a new session by copying all messages from a previous session. Must be used with --resume. If --name or --session-id is provided, forks that specific session. Otherwise, forks the most recently used session."
  prefix: "th copied history) #[arg( long, "
  suffix: " )] fork: bool, /// Open the ses"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> requires = "resume", help = "Fork a previous session (creates new session with copied history)", long_help = "Create a new session by copying all messages from a previous session. Must be used with --resume. If --name or --session-id is provided, forks that specific session. Otherwise, forks the most recently used session."

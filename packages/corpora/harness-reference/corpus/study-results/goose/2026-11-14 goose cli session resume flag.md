---
kind: source
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose-cli/src/cli.rs#L932-L933 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: help = "Resume a previous session (last used or specified by --name/--session-id)", long_help = "Continue from a previous session. If --name or --session-id is provided, resumes that specific session. Otherwise, resumes the most recently used session."
  prefix: "ous session #[arg( short, long, "
  suffix: " )] resume: bool, /// Fork a pre"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> help = "Resume a previous session (last used or specified by --name/--session-id)", long_help = "Continue from a previous session. If --name or --session-id is provided, resumes that specific session. Otherwise, resumes the most recently used session."

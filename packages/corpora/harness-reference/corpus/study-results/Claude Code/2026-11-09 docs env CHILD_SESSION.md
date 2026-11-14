---
kind: docs
reportedIn:
  - "[Claude Code docs environment variables](../../documents/code.claude.com/Claude%20Code%20docs%20environment%20variables.md)"
version: 2.1.319
version_basis: inferred
locator: Environment variables, CLAUDE_CODE_CHILD_SESSION
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-09
excerpt:
  exact: Set to 1 in subprocesses Claude Code spawns via the Bash, PowerShell, and Monitor tools, hook commands, and status line commands. Not set for stdio MCP server subprocesses, which are long-lived and outlive the session that spawned them.
  prefix: "ystem CLAUDE_CODE_CHILD_SESSION "
  suffix: " Unlike CLAUDECODE, this is only"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
---

> Set to 1 in subprocesses Claude Code spawns via the Bash, PowerShell, and Monitor tools, hook commands, and status line commands. Not set for stdio MCP server subprocesses, which are long-lived and outlive the session that spawned them.

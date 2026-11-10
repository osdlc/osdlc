---
kind: docs
reportedIn:
  - "[Claude Code docs CLI reference](../../documents/code.claude.com/Claude%20Code%20docs%20CLI%20reference.md)"
version: 2.1.319
version_basis: inferred
locator: CLI flags, --disallowedTools
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-09
excerpt:
  exact: '--disallowedTools, --disallowed-tools Deny rules. A bare tool name removes the matching tools from Claude’s context: "Edit" removes Edit, "*" removes every tool, and "mcp__*" removes every MCP tool. A scoped rule such as Bash(rm *) leaves the tool available and denies only calls that match as written.'
  prefix: "claude --disable-slash-commands "
  suffix: " A rule naming EndConversation c"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T07:53:54Z
---

> --disallowedTools, --disallowed-tools Deny rules. A bare tool name removes the matching tools from Claude’s context: "Edit" removes Edit, "*" removes every tool, and "mcp__*" removes every MCP tool. A scoped rule such as Bash(rm *) leaves the tool available and denies only calls that match as written.

---
kind: docs
reportedIn:
  - "[Claude Code docs plugins reference](../../documents/code.claude.com/Claude%20Code%20docs%20plugins%20reference.md)"
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
observed: 2026-11-04
locator: Environment variables, Where each variable resolves
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/plugin-root-variable@claude-code#observation-1
---

Imported from `facts/claude-code/skills/plugin-root-variable.md`, observation 1.

- variable: "${CLAUDE_PLUGIN_ROOT}"
- resolves_to: "absolute path of the plugin's installed version"
- substituted_in: ["skill, command and agent markdown body","hook command and args","MCP stdio command, args, env","MCP http/sse/ws url, headers, headersHelper","LSP command, args, env, workspaceFolder"]

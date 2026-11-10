---
kind: docs
reportedIn:
  - "[Copilot docs CLI plugin reference](../../documents/docs.github.com/Copilot%20docs%20CLI%20plugin%20reference.md)"
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
observed: 2026-11-04
locator: Agent Plugins 1.0 MCP servers
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/plugin-root-variable@copilot-cli#observation-1
---

Imported from `facts/copilot-cli/skills/plugin-root-variable.md`, observation 1.

- variable: "${PLUGIN_ROOT} with aliases ${CLAUDE_PLUGIN_ROOT} and ${COPILOT_PLUGIN_ROOT}"
- substituted_in: "stdio MCP server args, env values and cwd; LSP cwd and script paths"
- not_in: "remote http/sse/streamable-http values"

Read through a fetch tool that summarises, so the quoted wording may be paraphrased.

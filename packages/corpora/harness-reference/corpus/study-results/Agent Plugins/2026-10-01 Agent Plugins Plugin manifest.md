---
kind: docs
reportedIn:
  - "[Agent Plugins](../../documents/agent-plugins.org/Agent%20Plugins.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
observed: 2026-10-01
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:plugins/manifest@agent-plugins#observation-1
---

Imported from `facts/agent-plugins/plugins/manifest.md`, observation 1.

- file: "plugin.json (at the plugin root)"
- skills: "optional `skills/<name>/SKILL.md`"
- mcp: "optional mcp.json"
- client_extensions: "reverse-domain directories"
- covers: "skills and MCP only"
- schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"

Read by Codex (source) and Cursor (docs); Kiro's Powers use it (harness comparison).

---
kind: docs
reportedIn:
  - "[Cursor docs Plugins reference cursor.com](../../documents/cursor.com/Cursor%20docs%20Plugins%20reference%20cursor.com.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
observed: 2026-11-04
locator: MCP servers
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/plugin-root-variable@cursor#observation-1
---

Imported from `facts/cursor/skills/plugin-root-variable.md`, observation 1.

- variables: ["${CURSOR_PLUGIN_ROOT}","${CLAUDE_PLUGIN_ROOT}"]
- substituted_in: ["command","args","env values","cwd"]
- context: "mcp.json"
- not_expanded: ["${PLUGIN_ROOT}","${PLUGIN_DATA}"]

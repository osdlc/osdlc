---
kind: docs
reportedIn:
  - "[Cursor docs Plugins reference](../../documents/cursor.com/Cursor%20docs%20Plugins%20reference.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
observed: 2026-11-05
locator: Cursor Plugin manifest; Cursor Plugin component discovery
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@cursor#observation-1
---

Imported from `facts/cursor/plugins/manifest-fields.md`, observation 1.

- file: ".cursor-plugin/plugin.json"
- also_loads: "plugin.json (Agent Plugins root manifest)"
- fields: [{"name":"name","type":"string","required":true,"use":"plugin id; lowercase kebab-case, alphanumerics, hyphens and periods"},{"name":"description","type":"string","required":false,"use":"brief plugin description"},{"name":"version","type":"string","required":false,"use":"semantic version"},{"name":"author","type":"object","required":false,"use":"author info"},{"name":"author.name","required":"conditional","use":"not documented","note":"Required when author is set."},{"name":"author.email","required":false,"use":"not documented"},{"name":"homepage","type":"string","required":false,"use":"URL to the plugin homepage"},{"name":"repository","type":"string","required":false,"use":"URL to the plugin repository"},{"name":"license","type":"string","required":false,"use":"license identifier"},{"name":"keywords","type":"array","required":false,"use":"tags for discovery and categorization"},{"name":"logo","type":"string","required":false,"use":"logo path or absolute URL; relative paths resolve to raw.githubusercontent.com URLs"},{"name":"rules","type":"string | array","required":false,"use":"rule files or directories; replaces folder discovery"},{"name":"agents","type":"string | array","required":false,"use":"agent files or directories; replaces folder discovery"},{"name":"skills","type":"string | array","required":false,"use":"skill directories; replaces folder discovery"},{"name":"commands","type":"string | array","required":false,"use":"command files or directories; replaces folder discovery"},{"name":"hooks","type":"string | object","required":false,"use":"hooks config file, or inline hook config"},{"name":"mcpServers","type":"string | object | array","required":false,"use":"MCP config file, inline servers, or an array of either; overrides mcp.json discovery"},{"name":"variables","type":"object","required":false,"use":"JSON Schema naming variables users set in the dashboard; substituted into ${VAR} placeholders"}]

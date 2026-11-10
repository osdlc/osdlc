---
kind: docs
reportedIn:
  - "[Cursor docs Plugins reference](../../documents/cursor.com/Cursor%20docs%20Plugins%20reference.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
observed: 2026-11-05
locator: "Cursor multi-plugin repositories: Marketplace manifest fields; Plugin entry fields; How resolution works"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/marketplace-fields@cursor#observation-1
---

Imported from `facts/cursor/plugins/marketplace-fields.md`, observation 1.

- file: ".cursor-plugin/marketplace.json"
- fields: [{"name":"name","type":"string","required":true,"use":"marketplace id (kebab-case)"},{"name":"owner","type":"object","required":true,"use":"marketplace owner"},{"name":"owner.name","required":true,"use":"not documented"},{"name":"owner.email","required":false,"use":"not documented"},{"name":"plugins","type":"array","required":true,"use":"plugin entries; the whole file must be 10 MB or smaller"},{"name":"metadata","type":"object","required":false,"use":"marketplace metadata"},{"name":"metadata.description","required":false,"use":"not documented"},{"name":"metadata.version","required":false,"use":"not documented"},{"name":"metadata.pluginRoot","required":false,"use":"prefix path for all plugin sources"}]
- entry_fields: [{"name":"name","type":"string","required":true,"use":"plugin id (kebab-case)"},{"name":"source","type":"string | object","required":false,"use":"plugin directory, or an object with path and options","note":"The docs mark only name required in an entry."},{"name":"description","type":"string","required":false,"use":"plugin description"},{"name":"version","type":"string","required":false,"use":"semantic version"},{"name":"author","type":"object","required":false,"use":"author info"},{"name":"homepage","type":"string","required":false,"use":"URL"},{"name":"repository","type":"string","required":false,"use":"URL"},{"name":"license","type":"string","required":false,"use":"license identifier"},{"name":"keywords","type":"array","required":false,"use":"search tags"},{"name":"logo","type":"string","required":false,"use":"relative path or URL to the logo"},{"name":"category","type":"string","required":false,"use":"plugin category"},{"name":"tags","type":"array","required":false,"use":"additional tags"},{"name":"skills","type":"string | array","required":false,"use":"component paths"},{"name":"rules","type":"string | array","required":false,"use":"component paths"},{"name":"agents","type":"string | array","required":false,"use":"component paths"},{"name":"commands","type":"string | array","required":false,"use":"component paths"},{"name":"hooks","type":"string | object","required":false,"use":"hooks config path or inline config"},{"name":"mcpServers","type":"string | object","required":false,"use":"MCP config path or inline config"},{"name":"variables","type":"object","required":false,"use":"JSON Schema of variable names; the plugin.json value wins when both are set"}]

The entry is merged with the plugin's own .cursor-plugin/plugin.json, and the plugin.json values take precedence.

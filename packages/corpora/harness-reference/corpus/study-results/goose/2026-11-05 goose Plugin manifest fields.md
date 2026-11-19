---
kind: source
reportedIn:
  - "[block goose plugin format source at 4facf56](../../documents/github.com/block%20goose%20plugin%20format%20source%20at%204facf56.md)"
harness: "[goose](../../harnesses/goose.md)"
observed: 2026-11-05
locator: crates/goose/src/plugins/formats/open_plugins.rs:14-33, 155-180, 340-412; crates/goose/src/plugins/formats/gemini.rs:11-17 at 4facf56cbab049142809d9afa4648ebe6823ba80
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@goose#observation-1
---

Imported from `facts/goose/plugins/manifest-fields.md`, observation 1.

- file: "plugin.json"
- also_read: [".goose-plugin/plugin.json",".plugin/plugin.json"]
- fields: [{"name":"name","type":"string","required":false,"use":"plugin id and install directory; namespaces skills as name:skill; 1-64 lowercase letters, digits, dashes or periods","note":"When empty or absent, goose infers the name from the source URL or the directory."},{"name":"version","type":"string","required":false,"use":"shown on install; unknown when absent"},{"name":"skills","type":"string | string[] | object","required":false,"use":"skill directories; an object takes paths and exclusive (true replaces the default skills directory)"},{"name":"mcpServers","type":"string | string[] | object","required":false,"use":"MCP config file paths (default .mcp.json), or an inline object with an mcpServers key"}]
- not_in_manifest: "hooks come from hooks/hooks.json, not a manifest key"
- gemini_file: "gemini-extension.json"
- gemini_fields: [{"name":"name","type":"string","required":true,"use":"plugin id"},{"name":"version","type":"string","required":true,"use":"plugin version"}]

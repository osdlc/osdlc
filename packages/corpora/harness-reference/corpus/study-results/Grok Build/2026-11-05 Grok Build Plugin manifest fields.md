---
kind: source
reportedIn:
  - "[xai-org grok-build plugins manifest.rs](../../documents/github.com/xai-org%20grok-build%20plugins%20manifest.rs.md)"
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
observed: 2026-11-05
locator: crates/codegen/xai-grok-agent/src/plugins/manifest.rs:1-9, 17-36, 117-152, 168-210, 261-265 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@grok-build#observation-1
---

Imported from `facts/grok-build/plugins/manifest-fields.md`, observation 1.

- file: "plugin.json"
- files_checked: ["plugin.json",".grok-plugin/plugin.json",".claude-plugin/plugin.json"]
- fields: [{"name":"name","type":"string","required":true,"use":"plugin namespace; 1-64 lowercase letters, digits and hyphens, no leading or trailing hyphen"},{"name":"version","type":"string","required":false,"use":"semver version; grok plugin tag makes a release tag from it"},{"name":"description","type":"string","required":false,"use":"printed by grok plugin validate"},{"name":"author","type":"object","required":false,"use":"not documented"},{"name":"author.name","type":"string","required":false,"use":"not documented"},{"name":"author.email","type":"string","required":false,"use":"not documented"},{"name":"author.url","type":"string","required":false,"use":"not documented"},{"name":"homepage","type":"string","required":false,"use":"not documented"},{"name":"repository","type":"string","required":false,"use":"not documented"},{"name":"license","type":"string","required":false,"use":"not documented"},{"name":"keywords","type":"string[]","required":false,"use":"not documented"},{"name":"skills","type":"string | string[]","required":false,"use":"skill directories; replaces the default skills directory"},{"name":"commands","type":"string | string[]","required":false,"use":"command directories; replaces the default commands directory"},{"name":"agents","type":"string | string[]","required":false,"use":"agent directories; replaces the default agents directory"},{"name":"hooks","type":"string | object","required":false,"use":"hooks file path or inline hooks; default hooks/hooks.json"},{"name":"mcpServers","type":"string | object","required":false,"use":"MCP config path or inline servers; default .mcp.json"},{"name":"lspServers","type":"string | object","required":false,"use":"LSP config path or inline servers; default .lsp.json"}]

files_checked is the search order. A paths field that is set replaces the default directory (resolve_dirs), although a code comment calls the fields overrides that supplement the convention dirs. Paths that escape the plugin root are skipped with a warning.

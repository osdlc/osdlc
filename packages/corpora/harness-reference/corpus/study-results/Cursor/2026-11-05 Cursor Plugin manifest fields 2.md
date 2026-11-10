---
kind: source
reportedIn:
  - "[cursor plugins plugin.schema.json](../../documents/github.com/cursor%20plugins%20plugin.schema.json.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
observed: 2026-11-05
locator: schemas/plugin.schema.json:1-196 at 2776ddd2355d6d6c8747d3964600f28daf62f049
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@cursor#observation-2
---

Imported from `facts/cursor/plugins/manifest-fields.md`, observation 2.

- schema_file: ".cursor-plugin/plugin.json"
- schema_fields: [{"name":"name","type":"string","required":true,"use":"plugin id in kebab-case"},{"name":"displayName","type":"string","required":false,"use":"human-readable display name"},{"name":"description","type":"string","required":false,"use":"short description"},{"name":"version","type":"string","required":false,"use":"semantic version"},{"name":"minClientVersions","type":"object","required":false,"use":"minimum client versions to install, keyed by client id; \"never\" hides the plugin from that client"},{"name":"minClientVersions.cursor","type":"string","required":false,"use":"minimum Cursor version, or never"},{"name":"minClientVersions.grokbot","type":"string","required":false,"use":"minimum Grok Bot version, or never"},{"name":"minClientVersions.sand","type":"string","required":false,"use":"deprecated id for Grok Bot"},{"name":"author","type":"object","required":false,"use":"the plugin author"},{"name":"author.name","type":"string","required":"conditional","use":"author name","note":"Required when author is set."},{"name":"author.email","type":"string","required":false,"use":"author email address; format email"},{"name":"publisher","type":"string","required":false,"use":"publisher or organisation name"},{"name":"homepage","type":"string","required":false,"use":"homepage URL; format uri"},{"name":"repository","type":"string","required":false,"use":"source repository URL; format uri"},{"name":"license","type":"string","required":false,"use":"SPDX license identifier"},{"name":"logo","type":"string","required":false,"use":"logo path relative to the plugin root, or an absolute URL"},{"name":"keywords","type":"string[]","required":false,"use":"keywords for discovery and search"},{"name":"category","type":"string","required":false,"use":"category for marketplace classification"},{"name":"tags","type":"string[]","required":false,"use":"tags for filtering and discovery"},{"name":"commands","type":"string | string[]","required":false,"use":"globs or paths to command files"},{"name":"agents","type":"string | string[]","required":false,"use":"globs or paths to agent files"},{"name":"skills","type":"string | string[]","required":false,"use":"globs or paths to skill files"},{"name":"rules","type":"string | string[]","required":false,"use":"globs or paths to rule files"},{"name":"hooks","type":"string | object","required":false,"use":"hooks config file, or an inline hooks object"},{"name":"variables","type":"object","required":false,"use":"JSON Schema for user-configured plugin variables"},{"name":"variables.type","type":"string","required":"conditional","use":"must be object","note":"Required when variables is set."},{"name":"variables.properties","type":"object","required":false,"use":"not documented"},{"name":"variables.required","type":"string[]","required":false,"use":"not documented"},{"name":"mcpServers","type":"string | object | (string | object)[]","required":false,"use":"MCP server config path, inline config, or an array of either"}]

The JSON Schema that the official cursor/plugins marketplace repository checks every plugin against in CI. Its $id URL, cursor.com/schemas/cursor-plugin/plugin.json, served an HTML page, not the schema, on 2026-11-05.

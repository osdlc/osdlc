---
kind: docs
reportedIn:
  - "[GitHub Docs GitHub Copilot CLI plugin reference](../../documents/github.com/GitHub%20Docs%20GitHub%20Copilot%20CLI%20plugin%20reference.md)"
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
observed: 2026-11-05
locator: content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md:184-216, 387-394 at 17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@copilot-cli#observation-2
---

Imported from `facts/copilot-cli/plugins/manifest-fields.md`, observation 2.

- legacy_files: [".plugin/plugin.json","plugin.json",".github/plugin/plugin.json",".claude-plugin/plugin.json"]
- legacy_fields: [{"name":"name","type":"string","required":true,"use":"kebab-case plugin name, letters, numbers and hyphens; at most 64 characters"},{"name":"description","type":"string","required":false,"use":"brief description; at most 1024 characters"},{"name":"version","type":"string","required":false,"use":"semantic version"},{"name":"author","type":"object","required":false,"use":"author details"},{"name":"author.name","required":"conditional","use":"not documented","note":"Required when author is set."},{"name":"author.email","required":false,"use":"not documented"},{"name":"author.url","required":false,"use":"not documented"},{"name":"homepage","type":"string","required":false,"use":"plugin homepage URL"},{"name":"repository","type":"string","required":false,"use":"source repository URL"},{"name":"license","type":"string","required":false,"use":"license identifier"},{"name":"keywords","type":"string[]","required":false,"use":"search keywords"},{"name":"category","type":"string","required":false,"use":"plugin category"},{"name":"tags","type":"string[]","required":false,"use":"additional tags"},{"name":"agents","type":"string | string[]","required":false,"use":"agent directories (.agent.md files); default agents"},{"name":"skills","type":"string | string[]","required":false,"use":"skill directories; default skills"},{"name":"commands","type":"string | string[]","required":false,"use":"command directories"},{"name":"hooks","type":"string | object","required":false,"use":"hooks config file, or an inline hooks object"},{"name":"extensions","type":"string | string[] | object","required":false,"use":"extension directories; { paths, exclusive: true } suppresses built-in extensions"},{"name":"mcpServers","type":"string | object","required":false,"use":"MCP config file, or inline server definitions"},{"name":"lspServers","type":"string | object","required":false,"use":"LSP config file, or inline server definitions"}]

The legacy Copilot format: any manifest without a recognized Agent Plugins $schema. legacy_files is the search order. extensions means something different here than in an Agent Plugins manifest.

---
kind: docs
reportedIn:
  - "[GitHub Docs GitHub Copilot CLI plugin reference](../../documents/github.com/GitHub%20Docs%20GitHub%20Copilot%20CLI%20plugin%20reference.md)"
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
observed: 2026-11-05
locator: content/copilot/reference/copilot-cli-reference/cli-plugin-reference.md:119-144 at 17d6ee52f965e7c46f74b4339d5fa1ad6f4f4493
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@copilot-cli#observation-1
---

Imported from `facts/copilot-cli/plugins/manifest-fields.md`, observation 1.

- file: "plugin.json"
- fields: [{"name":"$schema","type":"string","required":true,"use":"must be the Agent Plugins 1.0.0 or 1.1.0 schema URL; opts the plugin into Agent Plugins semantics; an unsupported version is rejected"},{"name":"name","type":"string","required":true,"use":"plugin name; 1-64 lowercase letters, digits, hyphens and periods, no -- or .."},{"name":"version","type":"string","required":false,"use":"version string; semver recommended"},{"name":"description","type":"string","required":false,"use":"brief description"},{"name":"author","type":"object","required":false,"use":"optional name, email and url strings"},{"name":"author.name","type":"string","required":false,"use":"not documented"},{"name":"author.email","type":"string","required":false,"use":"not documented"},{"name":"author.url","type":"string","required":false,"use":"not documented"},{"name":"homepage","type":"string","required":false,"use":"plugin homepage or documentation"},{"name":"repository","type":"string","required":false,"use":"source repository"},{"name":"license","type":"string","required":false,"use":"license identifier; SPDX recommended"},{"name":"keywords","type":"string[]","required":false,"use":"search and discovery keywords"},{"name":"extensions","type":"object","required":false,"use":"client-specific data keyed by reverse-domain namespace"}]

The Agent Plugins format. Component paths are fixed (skills, mcp.json, and com.github.copilot for agents, commands, rules, hooks and LSP) and cannot be set in the manifest.

---
type: Harness Fact
title: "Agent Plugins: Plugin manifest"
description: "Plugin manifest in Agent Plugins, as observed over time."
tags: [plugins]
harness: agent-plugins
subject: plugins/manifest
observations:
  - value: { file: plugin.json (at the plugin root), skills: "optional `skills/<name>/SKILL.md`", mcp: optional mcp.json, client_extensions: reverse-domain directories, covers: skills and MCP only, schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" }
    since: "1.0.0"
    until: null
    observed: "2026-10-01"
    source: agent-plugins-site
    via: skill-naming
    evidence: docs
    note: "Read by Codex (source) and Cursor (docs); Kiro's Powers use it (harness comparison)."
sources:
  - id: agent-plugins-site
    resource: "https://agent-plugins.org/"
    title: Agent Plugins
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Plugin manifest](/subjects/plugins/manifest.md) in
[Agent Plugins](/harnesses/agent-plugins.md). The manifest file that makes a directory a plugin or
package.

## Observations

- 2026-10-01 (from 1.0.0): file: plugin.json (at the plugin root); skills: optional
  `skills/<name>/SKILL.md`; mcp: optional mcp.json; client extensions: reverse-domain directories;
  covers: skills and MCP only; schema: <https://agent-plugins.org/schemas/1.0.0/plugin.schema.json>.
  Read by Codex (source) and Cursor (docs); Kiro's Powers use it (harness
  comparison).[^agent-plugins-site][^skill-naming]

[^agent-plugins-site]: Agent Plugins
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

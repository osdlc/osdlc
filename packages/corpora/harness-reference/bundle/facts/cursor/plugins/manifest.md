---
type: Harness Fact
title: "Cursor: Plugin manifest"
description: "Plugin manifest in Cursor, as observed over time."
tags: [plugins]
harness: cursor
subject: plugins/manifest
observations:
  - value: { files: [".cursor-plugin/plugin.json", plugin.json (Agent Plugins root)], components: "default directories, or custom paths in the manifest" }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-plugins
    via: skill-naming
    evidence: docs
open:
  - question: Whether custom component paths in the manifest replace or add to the default directories.
    observed: "2026-10-01"
    source: skill-naming
sources:
  - id: cursor-plugins
    resource: "https://cursor.com/docs/plugins"
    title: "Cursor docs: plugins"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Plugin manifest](/subjects/plugins/manifest.md) in
[Cursor](/harnesses/cursor.md). The manifest file that makes a directory a plugin or package.

## Observations

- 2026-10-01: files: `.cursor-plugin/plugin.json`, `plugin.json (Agent Plugins root)`; components:
  default directories, or custom paths in the manifest.[^cursor-plugins][^skill-naming]

## Open questions

- Whether custom component paths in the manifest replace or add to the default
  directories.[^skill-naming]

[^cursor-plugins]: Cursor docs: plugins
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

---
type: Harness Fact
title: "Cursor: Plugin skill runtime name"
description: "Plugin skill runtime name in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/plugin-namespace
observations:
  - value: { runtime_name: review, namespace: none documented }
    since: null
    until: null
    observed: "2026-10-01"
    source: cursor-plugins
    via: skill-naming
    evidence: docs
    note: "First-party plugins use plain names such as `deslop`."
open:
  - question: "What happens when two plugins export the same skill name, and whether a plugin skill has a qualified form."
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

What the sources say about [Plugin skill runtime name](/subjects/skills/plugin-namespace.md) in
[Cursor](/harnesses/cursor.md). The name a skill gets when it ships in a plugin, for plugin
`acme-tools` and skill `review`.

## Observations

- 2026-10-01: runtime name: review; namespace: none documented. First-party plugins use plain names
  such as `deslop`.[^cursor-plugins][^skill-naming]

## Open questions

- What happens when two plugins export the same skill name, and whether a plugin skill has a
  qualified form.[^skill-naming]

[^cursor-plugins]: Cursor docs: plugins
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

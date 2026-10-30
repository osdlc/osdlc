---
type: Harness Fact
title: "Claude Code: Plugin skill runtime name"
description: "Plugin skill runtime name in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/plugin-namespace
observations:
  - value: { runtime_name: "acme-tools:review", namespace_from: "plugin manifest `name`", bare_alias: "`/review`, unless another command uses that name" }
    since: null
    until: null
    observed: "2026-10-01"
    source: claude-plugins-reference
    via: skill-naming
    checked_version: "2.1.286"
    evidence: docs
    note: "`displayName` is not used for namespacing. Without plugin.json the name comes from the marketplace entry, or the directory under `--plugin-dir`."
open:
  - question: "Whether the model's `Skill` tool resolves a bare plugin skill name, and in which versions."
    observed: "2026-10-01"
    source: skill-naming
sources:
  - id: claude-plugins-reference
    resource: "https://code.claude.com/docs/en/plugins-reference"
    title: "Claude Code docs: plugins reference"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Plugin skill runtime name](/subjects/skills/plugin-namespace.md) in
[Claude Code](/harnesses/claude-code.md). The name a skill gets when it ships in a plugin, for
plugin `acme-tools` and skill `review`.

## Observations

- 2026-10-01: runtime name: acme-tools:review; namespace from: plugin manifest `name`; bare alias:
  `/review`, unless another command uses that name. `displayName` is not used for namespacing.
  Without plugin.json the name comes from the marketplace entry, or the directory under
  `--plugin-dir`.[^claude-plugins-reference][^skill-naming]

## Open questions

- Whether the model's `Skill` tool resolves a bare plugin skill name, and in which
  versions.[^skill-naming]

[^claude-plugins-reference]: Claude Code docs: plugins reference
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

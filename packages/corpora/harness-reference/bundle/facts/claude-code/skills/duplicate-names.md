---
type: Harness Fact
title: "Claude Code: Duplicate skill names"
description: "Duplicate skill names in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/duplicate-names
observations:
  - value: { across_plugins: "distinct (`a:review`, `b:review`)", same_plugin_two_marketplaces: "identical prefix, no documented tiebreak" }
    since: null
    until: null
    observed: "2026-10-01"
    source: claude-marketplace-reference
    via: skill-naming
    evidence: docs
sources:
  - id: claude-marketplace-reference
    resource: "https://code.claude.com/docs/en/plugins/marketplace-reference"
    title: "Claude Code docs: marketplace reference"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in
[Claude Code](/harnesses/claude-code.md). What happens when two skills share a name.

## Observations

- 2026-10-01: across plugins: distinct (`a:review`, `b:review`); same plugin two marketplaces:
  identical prefix, no documented tiebreak.[^claude-marketplace-reference][^skill-naming]

[^claude-marketplace-reference]: Claude Code docs: marketplace reference
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

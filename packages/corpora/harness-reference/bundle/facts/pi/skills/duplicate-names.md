---
type: Harness Fact
title: "pi: Duplicate skill names"
description: "Duplicate skill names in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/duplicate-names
observations:
  - value: { rule: "first found wins, with a collision diagnostic naming both paths", order: user skills before project skills }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/src/core/skills.ts:432-447 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    evidence: source
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in
[pi](/harnesses/pi.md). What happens when two skills share a name.

## Observations

- 2026-10-01: rule: first found wins, with a collision diagnostic naming both paths; order: user
  skills before project skills.[^pi-repo][^skill-naming]

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

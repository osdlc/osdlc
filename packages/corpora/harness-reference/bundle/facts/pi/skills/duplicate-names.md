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
  - value: {"winner": "first discovered skill", "diagnostic": "warning"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Write portable frontmatter"
    evidence: docs
open:
  - question: "In which order are user, project, .agents and package skill locations scanned, so which scope wins a collision?"
    observed: "2026-11-04"
    source: pi-skills
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in
[pi](/harnesses/pi.md). What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-10-01: rule: first found wins, with a collision diagnostic naming both paths; order: user
  skills before project skills.[^pi-repo][^skill-naming]
- 2026-11-04: winner: first discovered skill; diagnostic: warning.[^pi-skills]

  > Name collisions keep the first discovered skill and produce a warning.

## Open questions

- In which order are user, project, .agents and package skill locations scanned, so which scope wins a collision?[^pi-skills]

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
[^pi-skills]: Pi docs: Skills (main at d57c2d2)

---
type: Harness Fact
title: "pi: Skill name validation"
description: "Skill name validation in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/name-validation
observations:
  - value: { checks: "length up to 64, ^[a-z0-9-]+$, no edge or double hyphens", blocking: false, must_match_directory: false, rejects_only: a missing description }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/src/core/skills.ts:92-111, 325-331 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    evidence: source
    note: "Failures are warnings; the skill loads anyway."
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Skill name validation](/subjects/skills/name-validation.md) in
[pi](/harnesses/pi.md). What the harness checks about a skill name, and whether a failure blocks
loading.

## Observations

- 2026-10-01: checks: length up to 64, ^[a-z0-9-]+$, no edge or double hyphens; blocking: `false`;
  must match directory: `false`; rejects only: a missing description. Failures are warnings; the
  skill loads anyway.[^pi-repo][^skill-naming]

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

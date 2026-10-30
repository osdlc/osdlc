---
type: Harness Fact
title: "pi: Skill name source"
description: "Skill name source in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/name-source
observations:
  - value: { rule: "frontmatter `name`, else the parent directory" }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/src/core/skills.ts:322-323 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    evidence: source
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Skill name source](/subjects/skills/name-source.md) in
[pi](/harnesses/pi.md). Where the skill's runtime name comes from (frontmatter `name`, directory, or
both).

## Observations

- 2026-10-01: rule: frontmatter `name`, else the parent directory.[^pi-repo][^skill-naming]

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

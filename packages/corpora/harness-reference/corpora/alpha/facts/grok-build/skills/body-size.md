---
type: Harness Fact
title: "Grok Build: Skill body size"
description: "Skill body size in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/body-size
observations:
  - value: {"cap": "first 25,000 tokens of the body are inlined", "same_cap_as": "read_file", "advice": "put long reference material in sibling files"}
    since: null
    until: null
    observed: "2026-11-04"
    source: grok-build-skills
    locator: "crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md:233 at 2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8"
    evidence: source
sources:
  - id: grok-build-skills
    resource: "https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md"
    title: "Grok Build user guide: Skills"
---

What the sources say about [Skill body size](/subjects/skills/body-size.md) in [Grok Build](/harnesses/grok-build.md).
Limits or guidance on the SKILL.md body size, and what happens past them.

## Observations

- 2026-11-04: cap: first 25,000 tokens of the body are inlined; same cap as: read_file; advice: put long reference material in sibling files.[^grok-build-skills]

  > Grok inlines at most the first 25,000 tokens of a skill body (the same cap as `read_file`).

[^grok-build-skills]: Grok Build user guide: Skills

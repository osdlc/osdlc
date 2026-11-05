---
type: Harness Fact
title: "Goose: Skill body size"
description: "Skill body size in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/body-size
observations:
  - value: {"recommendation": "keep skills focused; split long skills", "numeric_limit": false}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-skills
    locator: "Best practices"
    evidence: docs
open:
  - question: "Is there a numeric limit on SKILL.md size?"
    observed: "2026-11-04"
    source: goose-skills
sources:
  - id: goose-skills
    resource: "https://goose-docs.ai/docs/guides/context-engineering/using-skills"
    title: "goose docs: Skills"
---

What the sources say about [Skill body size](/subjects/skills/body-size.md) in [Goose](/harnesses/goose.md).
Limits or guidance on the SKILL.md body size, and what happens past them.

## Observations

- 2026-11-04: recommendation: keep skills focused; split long skills; numeric limit: no.[^goose-skills]

  > One skill per workflow or domain. If a skill is getting long, consider splitting it.

## Open questions

- Is there a numeric limit on SKILL.md size?[^goose-skills]

[^goose-skills]: goose docs: Skills

---
type: Harness Fact
title: "Goose: Skill picked from its description"
description: "Skill picked from its description in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/description-match
observations:
  - value: {"model_picks_from_description": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-skills
    locator: "intro"
    evidence: docs
open:
  - question: "Do the docs give guidance on writing descriptions or reliability of automatic selection?"
    observed: "2026-11-04"
    source: goose-skills
sources:
  - id: goose-skills
    resource: "https://goose-docs.ai/docs/guides/context-engineering/using-skills"
    title: "goose docs: Skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Goose](/harnesses/goose.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: model picks from description: yes.[^goose-skills]

  > Your request clearly matches a skill's purpose

## Open questions

- Do the docs give guidance on writing descriptions or reliability of automatic selection?[^goose-skills]

[^goose-skills]: goose docs: Skills

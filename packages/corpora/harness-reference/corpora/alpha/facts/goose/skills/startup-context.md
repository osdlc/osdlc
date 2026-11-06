---
type: Harness Fact
title: "Goose: Skills in context at startup"
description: "Skills in context at startup in Goose, as observed over time."
tags: [skills]
harness: goose
subject: skills/startup-context
observations:
  - value: {"listed": "discovered skill names and descriptions, in the instructions at session start"}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-skills
    locator: "intro"
    evidence: docs
open:
  - question: "Is the number of listed skills or the description length capped?"
    observed: "2026-11-04"
    source: goose-skills
sources:
  - id: goose-skills
    resource: "https://goose-docs.ai/docs/guides/context-engineering/using-skills"
    title: "goose docs: Skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Goose](/harnesses/goose.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: discovered skill names and descriptions, in the instructions at session start.[^goose-skills]

  > When a session starts, goose adds discovered skill names and descriptions to its instructions.

## Open questions

- Is the number of listed skills or the description length capped?[^goose-skills]

[^goose-skills]: goose docs: Skills

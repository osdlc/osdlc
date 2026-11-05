---
type: Harness Fact
title: "Kiro: Skills in context at startup"
description: "Skills in context at startup in Kiro, as observed over time."
tags: [skills]
harness: kiro
subject: skills/startup-context
observations:
  - value: {"listed": "name and description only", "name_max_chars": "64", "description_max_chars": "1024"}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is the number of skills listed at startup capped?"
    observed: "2026-11-04"
    source: kiro-skills
sources:
  - id: kiro-skills
    resource: "https://kiro.dev/docs/skills/"
    title: "Kiro docs: Agent Skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Kiro](/harnesses/kiro.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name and description only; name max chars: 64; description max chars: 1024. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-skills]

  > At startup, Kiro loads only the name and description of each skill

## Open questions

- Is the number of skills listed at startup capped?[^kiro-skills]

[^kiro-skills]: Kiro docs: Agent Skills

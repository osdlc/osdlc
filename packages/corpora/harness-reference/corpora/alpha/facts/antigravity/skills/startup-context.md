---
type: Harness Fact
title: "Antigravity CLI: Skills in context at startup"
description: "Skills in context at startup in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/startup-context
observations:
  - value: {"listed": "name and description of each available skill", "refreshed": "every turn"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is the number of listed skills or the description length capped?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Antigravity CLI](/harnesses/antigravity.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name and description of each available skill; refreshed: every turn. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-skills]

  > On every turn, the agent sees a list of available skills with their names and descriptions.

## Open questions

- Is the number of listed skills or the description length capped?[^antigravity-skills]

[^antigravity-skills]: Antigravity docs: Agent skills

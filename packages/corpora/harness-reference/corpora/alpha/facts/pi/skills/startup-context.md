---
type: Harness Fact
title: "pi: Skills in context at startup"
description: "Skills in context at startup in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/startup-context
observations:
  - value: {"listed": "name, description and path of each skill", "full_instructions_included": false}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Understand how skills load"
    evidence: docs
open:
  - question: "Is the number of listed skills, or the description length, capped?"
    observed: "2026-11-04"
    source: pi-skills
sources:
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [pi](/harnesses/pi.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name, description and path of each skill; full instructions included: no.[^pi-skills]

  > At startup, Pi scans configured skill locations and adds each skill’s name, description, and path to the system prompt. It does not add the full instructions.

## Open questions

- Is the number of listed skills, or the description length, capped?[^pi-skills]

[^pi-skills]: Pi docs: Skills (main at d57c2d2)

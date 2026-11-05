---
type: Harness Fact
title: "Cursor: Skills in context at startup"
description: "Skills in context at startup in Cursor, as observed over time."
tags: [skills]
harness: cursor
subject: skills/startup-context
observations:
  - value: {"discovered_at": "Cursor start", "presented_to_agent": "available skills"}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-skills
    locator: "How skills work"
    evidence: docs
open:
  - question: "Does the startup list hold only each skill name and description, and is the number of skills or the description length capped?"
    observed: "2026-11-04"
    source: cursor-skills
sources:
  - id: cursor-skills
    resource: "https://cursor.com/docs/skills"
    title: "Cursor docs: Agent Skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Cursor](/harnesses/cursor.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: discovered at: Cursor start; presented to agent: available skills.[^cursor-skills]

  > When Cursor starts, it automatically discovers skills from skill directories and makes them available to Agent. The agent is presented with available skills and decides when they are relevant based on context.

## Open questions

- Does the startup list hold only each skill name and description, and is the number of skills or the description length capped?[^cursor-skills]

[^cursor-skills]: Cursor docs: Agent Skills

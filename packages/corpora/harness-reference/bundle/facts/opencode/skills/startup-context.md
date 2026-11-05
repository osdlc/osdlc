---
type: Harness Fact
title: "OpenCode: Skills in context at startup"
description: "Skills in context at startup in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/startup-context
observations:
  - value: {"listed": "name and description of each skill, in the skill tool description", "format": "<available_skills> XML"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-skills
    locator: "Recognize tool description"
    evidence: docs
open:
  - question: "Is the number of listed skills or the description length capped?"
    observed: "2026-11-04"
    source: opencode-skills
sources:
  - id: opencode-skills
    resource: "https://opencode.ai/docs/skills"
    title: "OpenCode docs: Agent Skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [OpenCode](/harnesses/opencode.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name and description of each skill, in the skill tool description; format: <available_skills> XML.[^opencode-skills]

  > OpenCode lists available skills in the `skill` tool description. Each entry includes the skill name and description:

## Open questions

- Is the number of listed skills or the description length capped?[^opencode-skills]

[^opencode-skills]: OpenCode docs: Agent Skills

---
type: Harness Fact
title: "Gemini CLI: Skills in context at startup"
description: "Skills in context at startup in Gemini CLI, as observed over time."
tags: [skills]
harness: gemini-cli
subject: skills/startup-context
observations:
  - value: {"listed": "name and description of each enabled skill", "body_at_startup": false}
    since: null
    until: null
    observed: "2026-11-04"
    source: gemini-cli-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is the number of skills listed, or the length of each description, capped or truncated?"
    observed: "2026-11-04"
    source: gemini-cli-skills
sources:
  - id: gemini-cli-skills
    resource: "https://geminicli.com/docs/cli/skills/"
    title: "Gemini CLI docs: Agent Skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Gemini CLI](/harnesses/gemini-cli.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listed: name and description of each enabled skill; body at startup: no. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^gemini-cli-skills]

  > injects the name and description of all enabled skills into the system prompt.

## Open questions

- Is the number of skills listed, or the length of each description, capped or truncated?[^gemini-cli-skills]

[^gemini-cli-skills]: Gemini CLI docs: Agent Skills

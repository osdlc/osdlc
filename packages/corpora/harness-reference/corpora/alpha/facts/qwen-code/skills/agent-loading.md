---
type: Harness Fact
title: "Qwen Code: How the agent loads a skill"
description: "How the agent loads a skill in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/agent-loading
observations:
  - value: {"mechanism": "Skill tool call", "example": "Skill { skill: \"rust:pdf\" }"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is the body loaded only on invocation, or also at startup?"
    observed: "2026-11-04"
    source: qwen-code-skills
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Qwen Code](/harnesses/qwen-code.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: mechanism: Skill tool call; example: Skill { skill: "rust:pdf" }. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > The model calls it as `Skill { skill: "rust:pdf" }`.

## Open questions

- Is the body loaded only on invocation, or also at startup?[^qwen-code-skills]

[^qwen-code-skills]: Qwen Code docs: Skills

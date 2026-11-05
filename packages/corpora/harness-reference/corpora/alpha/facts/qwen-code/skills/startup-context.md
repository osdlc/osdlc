---
type: Harness Fact
title: "Qwen Code: Skills in context at startup"
description: "Skills in context at startup in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/startup-context
observations:
  - value: {"listing": "an available-skills listing exists (<available_skills>)", "path_gated": "skills with paths globs stay out of the listing until a matching file is touched"}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "What does the listing contain per skill (name, description, more), and is the count or description length capped?"
    observed: "2026-11-04"
    source: qwen-code-skills
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [Skills in context at startup](/subjects/skills/startup-context.md) in [Qwen Code](/harnesses/qwen-code.md).
What sits in the model's context before any skill is used: names and descriptions only, or more, and any cap or truncation of the list.

## Observations

- 2026-11-04: listing: an available-skills listing exists (<available_skills>); path gated: skills with paths globs stay out of the listing until a matching file is touched. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > stays out of the model’s available-skills listing until a tool call touches a matching file.

## Open questions

- What does the listing contain per skill (name, description, more), and is the count or description length capped?[^qwen-code-skills]

[^qwen-code-skills]: Qwen Code docs: Skills

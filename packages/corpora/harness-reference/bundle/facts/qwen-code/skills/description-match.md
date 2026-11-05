---
type: Harness Fact
title: "Qwen Code: Skill picked from its description"
description: "Skill picked from its description in Qwen Code, as observed over time."
tags: [skills]
harness: qwen-code
subject: skills/description-match
observations:
  - value: {"supported": true}
    since: null
    until: null
    observed: "2026-11-04"
    source: qwen-code-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: qwen-code-skills
    resource: "https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/"
    title: "Qwen Code docs: Skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Qwen Code](/harnesses/qwen-code.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: supported: yes. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^qwen-code-skills]

  > The model autonomously decides to use your Skill if it matches the request.

[^qwen-code-skills]: Qwen Code docs: Skills

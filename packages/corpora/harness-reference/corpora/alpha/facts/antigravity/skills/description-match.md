---
type: Harness Fact
title: "Antigravity CLI: Skill picked from its description"
description: "Skill picked from its description in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/description-match
observations:
  - value: {"supported": true, "guidance": "write the description in third person with relevant keywords"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Antigravity CLI](/harnesses/antigravity.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: supported: yes; guidance: write the description in third person with relevant keywords. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-skills]

  > The description is how the agent decides whether to use your skill.

[^antigravity-skills]: Antigravity docs: Agent skills

---
type: Harness Fact
title: "Kiro: Skill picked from its description"
description: "Skill picked from its description in Kiro, as observed over time."
tags: [skills]
harness: kiro
subject: skills/description-match
observations:
  - value: {"supported": true, "guidance": "include specific keywords and actions matching how you phrase requests"}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: kiro-skills
    resource: "https://kiro.dev/docs/skills/"
    title: "Kiro docs: Agent Skills"
---

What the sources say about [Skill picked from its description](/subjects/skills/description-match.md) in [Kiro](/harnesses/kiro.md).
Whether the model picks a skill from its description alone when the user does not name it.

## Observations

- 2026-11-04: supported: yes; guidance: include specific keywords and actions matching how you phrase requests. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-skills]

  > Kiro automatically activates skills when your request matches a skill's description.

[^kiro-skills]: Kiro docs: Agent Skills

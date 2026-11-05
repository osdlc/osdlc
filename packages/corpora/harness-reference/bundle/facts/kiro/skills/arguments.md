---
type: Harness Fact
title: "Kiro: Skill arguments"
description: "Skill arguments in Kiro, as observed over time."
tags: [skills]
harness: kiro
subject: skills/arguments
observations:
  - value: {"supported": "partial", "placeholders": ["$ARGUMENTS", "${N}"], "cli_only": true, "ide": "text after the slash command is passed to the agent as extra context"}
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

What the sources say about [Skill arguments](/subjects/skills/arguments.md) in [Kiro](/harnesses/kiro.md).
How text typed after a skill invocation reaches the skill.

## Observations

- 2026-11-04: supported: partial; placeholders: $ARGUMENTS, ${N}; cli only: yes; ide: text after the slash command is passed to the agent as extra context. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-skills]

  > `$ARGUMENTS` and `${N}` placeholder substitution into the skill body is currently CLI-only.

[^kiro-skills]: Kiro docs: Agent Skills

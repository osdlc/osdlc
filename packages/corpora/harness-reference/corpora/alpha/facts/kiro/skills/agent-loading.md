---
type: Harness Fact
title: "Kiro: How the agent loads a skill"
description: "How the agent loads a skill in Kiro, as observed over time."
tags: [skills]
harness: kiro
subject: skills/agent-loading
observations:
  - value: {"loads": "full SKILL.md on activation, when the request matches the description"}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is the body loaded through a tool or a file read?"
    observed: "2026-11-04"
    source: kiro-skills
sources:
  - id: kiro-skills
    resource: "https://kiro.dev/docs/skills/"
    title: "Kiro docs: Agent Skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Kiro](/harnesses/kiro.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: loads: full SKILL.md on activation, when the request matches the description. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-skills]

  > When your request matches a skill's description, Kiro loads the full instructions.

## Open questions

- Is the body loaded through a tool or a file read?[^kiro-skills]

[^kiro-skills]: Kiro docs: Agent Skills

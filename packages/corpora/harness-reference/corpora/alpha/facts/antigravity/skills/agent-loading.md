---
type: Harness Fact
title: "Antigravity CLI: How the agent loads a skill"
description: "How the agent loads a skill in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/agent-loading
observations:
  - value: {"mechanism": "agent reads the full SKILL.md", "loads": "when the skill looks relevant"}
    since: null
    until: null
    observed: "2026-11-04"
    source: antigravity-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Is the body read through a dedicated tool or a plain file read?"
    observed: "2026-11-04"
    source: antigravity-skills
sources:
  - id: antigravity-skills
    resource: "https://antigravity.google/docs/skills"
    title: "Antigravity docs: Agent skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Antigravity CLI](/harnesses/antigravity.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: mechanism: agent reads the full SKILL.md; loads: when the skill looks relevant. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^antigravity-skills]

  > If a skill looks relevant to your task, the agent reads the full `SKILL.md` content.

## Open questions

- Is the body read through a dedicated tool or a plain file read?[^antigravity-skills]

[^antigravity-skills]: Antigravity docs: Agent skills

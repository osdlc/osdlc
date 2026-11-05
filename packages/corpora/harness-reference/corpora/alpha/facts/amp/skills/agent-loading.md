---
type: Harness Fact
title: "Amp: How the agent loads a skill"
description: "How the agent loads a skill in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/agent-loading
observations:
  - value: {"body_loaded": "only when the skill is invoked"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Skill Format"
    evidence: docs
open:
  - question: "What mechanism loads a skill body (a tool or a file read), and does the model invoke it itself or only the user?"
    observed: "2026-11-04"
    source: amp-skills
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Amp](/harnesses/amp.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: body loaded: only when the skill is invoked.[^amp-skills]

  > Amp loads the rest of `SKILL.md` only when the skill is invoked.

## Open questions

- What mechanism loads a skill body (a tool or a file read), and does the model invoke it itself or only the user?[^amp-skills]

[^amp-skills]: Amp docs: Skills

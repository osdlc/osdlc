---
type: Harness Fact
title: "pi: How the agent loads a skill"
description: "How the agent loads a skill in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/agent-loading
observations:
  - value: { mechanism: the model reads SKILL.md with the read tool when the task matches, base_dir: "given to the model, so relative scripts/ paths resolve" }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/src/core/skills.ts:365, agent-session.ts:2113 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    evidence: source
  - value: {"trigger": "task matches the description", "mechanism": "model reads SKILL.md", "explicit": "/skill:name"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-skills
    locator: "Understand how skills load"
    evidence: docs
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/corpora/alpha/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
  - id: pi-skills
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/skills.md"
    title: "Pi docs: Skills (main at d57c2d2)"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[pi](/harnesses/pi.md). How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-10-01: mechanism: the model reads SKILL.md with the read tool when the task matches; base
  dir: given to the model, so relative scripts/ paths resolve.[^pi-repo][^skill-naming]
- 2026-11-04: trigger: task matches the description; mechanism: model reads SKILL.md; explicit: /skill:name.[^pi-skills]

  > When a task matches, the model reads `SKILL.md` and follows its instructions.

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
[^pi-skills]: Pi docs: Skills (main at d57c2d2)

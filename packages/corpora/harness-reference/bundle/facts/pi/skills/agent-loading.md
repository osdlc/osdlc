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
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[pi](/harnesses/pi.md). The mechanism the model uses to load a skill body.

## Observations

- 2026-10-01: mechanism: the model reads SKILL.md with the read tool when the task matches; base
  dir: given to the model, so relative scripts/ paths resolve.[^pi-repo][^skill-naming]

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

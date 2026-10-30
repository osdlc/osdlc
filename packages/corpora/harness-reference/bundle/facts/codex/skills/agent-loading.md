---
type: Harness Fact
title: "Codex CLI: How the agent loads a skill"
description: "How the agent loads a skill in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/agent-loading
observations:
  - value: { mechanism: reads the advertised skill file }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    evidence: source
    note: "Structured `UserInput::Skill { name, path }` mentions resolve by path first."
sources:
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in
[Codex CLI](/harnesses/codex.md). The mechanism the model uses to load a skill body.

## Observations

- 2026-10-01: mechanism: reads the advertised skill file. Structured
  `UserInput::Skill { name, path }` mentions resolve by path first.[^codex-repo][^skill-naming]

[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

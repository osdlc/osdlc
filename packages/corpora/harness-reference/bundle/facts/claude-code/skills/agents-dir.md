---
type: Harness Fact
title: "Claude Code: Reads .agents/skills"
description: "Reads .agents/skills in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/agents-dir
observations:
  - value: { supported: false }
    since: null
    until: null
    observed: "2026-10-01"
    source: skill-naming
    note: "Codex, Cursor and pi read `.agents/skills`; Claude Code does not."
sources:
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Reads .agents/skills](/subjects/skills/agents-dir.md) in
[Claude Code](/harnesses/claude-code.md). Whether the neutral `.agents/skills/` directory (project
or user) is read.

## Observations

- 2026-10-01: supported: `false`. Codex, Cursor and pi read `.agents/skills`; Claude Code does
  not.[^skill-naming]

[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

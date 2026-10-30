---
type: Harness Fact
title: "Grok Build: Instruction files read"
description: "Instruction files read in Grok Build, as observed over time."
tags: [instructions]
harness: grok-build
subject: instructions/files
observations:
  - value: { files: [AGENTS.md, CLAUDE.md], note: reads the whole Claude Code surface zero-config }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Instruction files read](/subjects/instructions/files.md) in
[Grok Build](/harnesses/grok-build.md). Every always-loaded instruction file the harness reads,
project and user level.

## Observations

- 2026-08-08: files: `AGENTS.md`, `CLAUDE.md`; note: reads the whole Claude Code surface
  zero-config.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

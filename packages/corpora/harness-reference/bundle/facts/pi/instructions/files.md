---
type: Harness Fact
title: "pi: Instruction files read"
description: "Instruction files read in pi, as observed over time."
tags: [instructions]
harness: pi
subject: instructions/files
observations:
  - value: { files: [AGENTS.md, CLAUDE.md] }
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
[pi](/harnesses/pi.md). Every always-loaded instruction file the harness reads, project and user
level.

## Observations

- 2026-08-08: files: `AGENTS.md`, `CLAUDE.md`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

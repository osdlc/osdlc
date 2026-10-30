---
type: Harness Fact
title: "Kiro: Instruction files read"
description: "Instruction files read in Kiro, as observed over time."
tags: [instructions]
harness: kiro
subject: instructions/files
observations:
  - value: { files: [".kiro/steering/*.md", AGENTS.md] }
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
[Kiro](/harnesses/kiro.md). Every always-loaded instruction file the harness reads, project and user
level.

## Observations

- 2026-08-08: files: `.kiro/steering/*.md`, `AGENTS.md`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

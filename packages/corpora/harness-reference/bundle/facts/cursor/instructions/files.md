---
type: Harness Fact
title: "Cursor: Instruction files read"
description: "Instruction files read in Cursor, as observed over time."
tags: [instructions]
harness: cursor
subject: instructions/files
observations:
  - value: { files: [".cursor/rules/*.mdc", AGENTS.md] }
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
[Cursor](/harnesses/cursor.md). Every always-loaded instruction file the harness reads, project and
user level.

## Observations

- 2026-08-08: files: `.cursor/rules/*.mdc`, `AGENTS.md`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

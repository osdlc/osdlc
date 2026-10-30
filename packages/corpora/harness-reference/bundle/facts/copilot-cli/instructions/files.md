---
type: Harness Fact
title: "Copilot CLI: Instruction files read"
description: "Instruction files read in Copilot CLI, as observed over time."
tags: [instructions]
harness: copilot-cli
subject: instructions/files
observations:
  - value: { files: [".github/copilot-instructions.md", AGENTS.md, CLAUDE.md, GEMINI.md] }
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
[Copilot CLI](/harnesses/copilot-cli.md). Every always-loaded instruction file the harness reads,
project and user level.

## Observations

- 2026-08-08: files: `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

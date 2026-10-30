---
type: Harness Fact
title: "DeepSeek Harness (dsh): Instruction files read"
description: "Instruction files read in DeepSeek Harness (dsh), as observed over time."
tags: [instructions]
harness: dsh
subject: instructions/files
observations:
  - value: { files: [AGENTS.md, CLAUDE.md, AGENTS.local.md, CLAUDE.local.md, "$DSH_HOME/AGENTS.md"], walk: git root down to the cwd, budget: "64 KiB", not_read: DEEPSEEK.md }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness packages/context/agent-instructions/README.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Instruction files read](/subjects/instructions/files.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Every always-loaded instruction file the harness reads,
project and user level.

## Observations

- 2026-10-08: files: `AGENTS.md`, `CLAUDE.md`, `AGENTS.local.md`, `CLAUDE.local.md`,
  `$DSH_HOME/AGENTS.md`; walk: git root down to the cwd; budget: 64 KiB; not read:
  DEEPSEEK.md.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

---
type: Harness Fact
title: "Kiro: Skill discovery walk"
description: "Skill discovery walk in Kiro, as observed over time."
tags: [skills]
harness: kiro
subject: skills/discovery-walk
observations:
  - value: {"workspace_dir": ".kiro/skills", "global_dir": "~/.kiro/skills"}
    since: null
    until: null
    observed: "2026-11-04"
    source: kiro-skills
    evidence: docs
    note: "Directory list taken from a fetch summary of the page. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Are parent directories, nested monorepo directories, .agents/skills, or symlinked folders scanned?"
    observed: "2026-11-04"
    source: kiro-skills
sources:
  - id: kiro-skills
    resource: "https://kiro.dev/docs/skills/"
    title: "Kiro docs: Agent Skills"
---

What the sources say about [Skill discovery walk](/subjects/skills/discovery-walk.md) in [Kiro](/harnesses/kiro.md).
How skill folders are found: parent directories of the working directory, nested directories in a monorepo, and symlinked folders.

## Observations

- 2026-11-04: workspace dir: .kiro/skills; global dir: ~/.kiro/skills. Directory list taken from a fetch summary of the page. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^kiro-skills]

  > Only `.kiro/skills/` (workspace) and `~/.kiro/skills/` (global) are listed.

## Open questions

- Are parent directories, nested monorepo directories, .agents/skills, or symlinked folders scanned?[^kiro-skills]

[^kiro-skills]: Kiro docs: Agent Skills

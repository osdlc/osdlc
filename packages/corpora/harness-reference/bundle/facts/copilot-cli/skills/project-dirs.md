---
type: Harness Fact
title: "Copilot CLI: Project skill directories"
description: "Project skill directories in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/project-dirs
observations:
  - value: { dirs: [".github/skills/", ".claude/skills/", ".agents/skills/"] }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Project skill directories](/subjects/skills/project-dirs.md) in
[Copilot CLI](/harnesses/copilot-cli.md). Directories in the project the harness loads skills from.

## Observations

- 2026-08-08: dirs: `.github/skills/`, `.claude/skills/`, `.agents/skills/`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

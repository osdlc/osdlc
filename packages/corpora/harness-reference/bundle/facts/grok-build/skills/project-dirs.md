---
type: Harness Fact
title: "Grok Build: Project skill directories"
description: "Project skill directories in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/project-dirs
observations:
  - value: { dirs: [".grok/skills/", ".agents/skills/", ".claude/skills/"] }
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
[Grok Build](/harnesses/grok-build.md). Directories in the project the harness loads skills from.

## Observations

- 2026-08-08: dirs: `.grok/skills/`, `.agents/skills/`, `.claude/skills/`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

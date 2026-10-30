---
type: Harness Fact
title: "OpenCode: Project skill directories"
description: "Project skill directories in OpenCode, as observed over time."
tags: [skills]
harness: opencode
subject: skills/project-dirs
observations:
  - value: { dirs: [".opencode/", ".claude/", ".agents/"] }
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
[OpenCode](/harnesses/opencode.md). Directories in the project the harness loads skills from.

## Observations

- 2026-08-08: dirs: `.opencode/`, `.claude/`, `.agents/`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

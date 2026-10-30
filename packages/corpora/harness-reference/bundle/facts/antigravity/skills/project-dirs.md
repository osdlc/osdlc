---
type: Harness Fact
title: "Antigravity CLI: Project skill directories"
description: "Project skill directories in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/project-dirs
observations:
  - value: { dirs: [".agents/skills/"] }
    since: null
    until: null
    observed: "2026-10-09"
    source: harness-comparison
    note: "From Antigravity's migration docs, as recorded in the comparison's 2026-10-09 update."
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Project skill directories](/subjects/skills/project-dirs.md) in
[Antigravity CLI](/harnesses/antigravity.md). Directories in the project the harness loads skills
from.

## Observations

- 2026-10-09: dirs: `.agents/skills/`. From Antigravity's migration docs, as recorded in the
  comparison's 2026-10-09 update.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

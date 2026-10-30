---
type: Harness Fact
title: "Antigravity CLI: Reads .agents/skills"
description: "Reads .agents/skills in Antigravity CLI, as observed over time."
tags: [skills]
harness: antigravity
subject: skills/agents-dir
observations:
  - value: { supported: true }
    since: null
    until: null
    observed: "2026-10-09"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Reads .agents/skills](/subjects/skills/agents-dir.md) in
[Antigravity CLI](/harnesses/antigravity.md). Whether the neutral `.agents/skills/` directory
(project or user) is read.

## Observations

- 2026-10-09: supported: `true`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

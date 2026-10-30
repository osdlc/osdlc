---
type: Harness Fact
title: "Grok Build: Reads .agents/skills"
description: "Reads .agents/skills in Grok Build, as observed over time."
tags: [skills]
harness: grok-build
subject: skills/agents-dir
observations:
  - value: { supported: true }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Reads .agents/skills](/subjects/skills/agents-dir.md) in
[Grok Build](/harnesses/grok-build.md). Whether the neutral `.agents/skills/` directory (project or
user) is read.

## Observations

- 2026-08-08: supported: `true`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

---
type: Harness Fact
title: "Copilot CLI: Reads .claude/skills"
description: "Reads .claude/skills in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/claude-dir
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

What the sources say about [Reads .claude/skills](/subjects/skills/claude-dir.md) in
[Copilot CLI](/harnesses/copilot-cli.md). Whether Claude Code's `.claude/skills/` directory is read.

## Observations

- 2026-08-08: supported: `true`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

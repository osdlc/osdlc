---
type: Harness Fact
title: "Claude Code: allowed-tools"
description: "allowed-tools in Claude Code, as observed over time."
tags: [skill-frontmatter]
harness: claude-code
subject: skill-frontmatter/allowed-tools
observations:
  - value: { supported: true }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
    note: "Named as part of Claude's frontmatter superset, beside the invocation controls."
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [allowed-tools](/subjects/skill-frontmatter/allowed-tools.md) in
[Claude Code](/harnesses/claude-code.md). The `allowed-tools` field that lists tools a skill pre-approves to run.

## Observations

- 2026-08-08: supported: `true`. Named as part of Claude's frontmatter superset, beside the
  invocation controls.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

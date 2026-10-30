---
type: Harness Fact
title: "Cursor: Subagent definition"
description: "Subagent definition in Cursor, as observed over time."
tags: [subagents]
harness: cursor
subject: subagents/definition
observations:
  - value: { location: ".cursor/agents/*.md", format: markdown with frontmatter, also_reads: foreign agent dirs }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Subagent definition](/subjects/subagents/definition.md) in
[Cursor](/harnesses/cursor.md). Where subagent definitions live and in what file format.

## Observations

- 2026-08-08: location: .cursor/agents/*.md; format: markdown with frontmatter; also reads: foreign
  agent dirs.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

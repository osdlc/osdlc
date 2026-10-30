---
type: Harness Fact
title: "Qwen Code: Subagent definition"
description: "Subagent definition in Qwen Code, as observed over time."
tags: [subagents]
harness: qwen-code
subject: subagents/definition
observations:
  - value: { location: ".qwen/agents/*.md", format: markdown with frontmatter, claude_compatible: true, note: accepts Claude agent frontmatter verbatim }
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
[Qwen Code](/harnesses/qwen-code.md). Where subagent definitions live and in what file format.

## Observations

- 2026-08-08: location: .qwen/agents/*.md; format: markdown with frontmatter; claude compatible:
  `true`; note: accepts Claude agent frontmatter verbatim.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

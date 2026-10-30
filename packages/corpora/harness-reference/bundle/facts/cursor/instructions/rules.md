---
type: Harness Fact
title: "Cursor: Rules and steering files"
description: "Rules and steering files in Cursor, as observed over time."
tags: [instructions]
harness: cursor
subject: instructions/rules
observations:
  - value: { supported: true, dir: ".cursor/rules/*.mdc", attach_by: "frontmatter alwaysApply, globs, description" }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Rules and steering files](/subjects/instructions/rules.md) in
[Cursor](/harnesses/cursor.md). Scoped rule files beside the main instruction file, and what decides
when they attach.

## Observations

- 2026-08-08: supported: `true`; dir: .cursor/rules/*.mdc; attach by: frontmatter alwaysApply,
  globs, description.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

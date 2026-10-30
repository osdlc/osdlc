---
type: Harness Fact
title: "Claude Code: Version seen"
description: "Version seen in Claude Code, as observed over time."
tags: [meta]
harness: claude-code
subject: meta/version-seen
observations:
  - value: { version: "2.1.226", context: latest release }
    since: "2.1.226"
    until: null
    observed: "2026-08-08"
    source: harness-comparison
  - value: { version: "2.1.283", context: installed build }
    since: "2.1.283"
    until: null
    observed: "2026-09-25"
    source: notes-claude
    evidence: help-text
  - value: { version: "2.1.286", context: installed build }
    since: "2.1.286"
    until: null
    observed: "2026-10-01"
    source: skill-naming
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: notes-claude
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-claude.md"
    title: "Claude Code: harness notes for a dispatcher"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in
[Claude Code](/harnesses/claude-code.md). A harness version a source names, with the date and
context (latest release, or the build installed when checked).

## Observations

- 2026-08-08 (from 2.1.226): version: 2.1.226; context: latest release.[^harness-comparison]
- 2026-09-25 (from 2.1.283): version: 2.1.283; context: installed build.[^notes-claude]
- 2026-10-01 (from 2.1.286): version: 2.1.286; context: installed build.[^skill-naming]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^notes-claude]: Claude Code: harness notes for a dispatcher
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

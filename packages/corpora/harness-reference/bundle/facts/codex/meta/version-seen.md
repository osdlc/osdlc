---
type: Harness Fact
title: "Codex CLI: Version seen"
description: "Version seen in Codex CLI, as observed over time."
tags: [meta]
harness: codex
subject: meta/version-seen
observations:
  - value: { version: "0.147.0", context: latest release }
    since: "0.147.0"
    until: null
    observed: "2026-08-08"
    source: harness-comparison
  - value: { version: "0.155.1", context: installed build }
    since: "0.155.1"
    until: null
    observed: "2026-09-25"
    source: notes-codex
    evidence: help-text
  - value: { version: "0.159.2", context: installed build }
    since: "0.159.2"
    until: null
    observed: "2026-10-01"
    source: skill-naming
    note: "The skill facts from this date were read from source at a commit, not from this build."
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: notes-codex
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-codex.md"
    title: "Codex: harness notes for a dispatcher"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in
[Codex CLI](/harnesses/codex.md). A harness version a source names, with the date and context
(latest release, or the build installed when checked).

## Observations

- 2026-08-08 (from 0.147.0): version: 0.147.0; context: latest release.[^harness-comparison]
- 2026-09-25 (from 0.155.1): version: 0.155.1; context: installed build.[^notes-codex]
- 2026-10-01 (from 0.159.2): version: 0.159.2; context: installed build. The skill facts from this
  date were read from source at a commit, not from this build.[^skill-naming]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^notes-codex]: Codex: harness notes for a dispatcher
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

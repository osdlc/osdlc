---
type: Harness Fact
title: "Gemini CLI: Version seen"
description: "Version seen in Gemini CLI, as observed over time."
tags: [meta]
harness: gemini-cli
subject: meta/version-seen
observations:
  - value: { version: "0.54.4", context: latest release }
    since: "0.54.4"
    until: null
    observed: "2026-08-08"
    source: harness-comparison
  - value: { version: "0.46.0", context: installed build (Homebrew) }
    since: "0.46.0"
    until: null
    observed: "2026-10-09"
    source: notes-gemini
    evidence: help-text
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: notes-gemini
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-gemini.md"
    title: "gemini: harness notes for a dispatcher"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in
[Gemini CLI](/harnesses/gemini-cli.md). A harness version a source names, with the date and context
(latest release, or the build installed when checked).

## Observations

- 2026-08-08 (from 0.54.4): version: 0.54.4; context: latest release.[^harness-comparison]
- 2026-10-09 (from 0.46.0): version: 0.46.0; context: installed build (Homebrew).[^notes-gemini]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^notes-gemini]: gemini: harness notes for a dispatcher

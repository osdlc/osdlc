---
type: Harness Fact
title: "pi: Version seen"
description: "Version seen in pi, as observed over time."
tags: [meta]
harness: pi
subject: meta/version-seen
observations:
  - value: { version: "0.84.1", context: latest release }
    since: "0.84.1"
    until: null
    observed: "2026-08-08"
    source: harness-comparison
    note: Pre-1.0.
  - value: { version: "0.84.3", context: installed build }
    since: "0.84.3"
    until: null
    observed: "2026-09-25"
    source: notes-pi
    evidence: help-text
  - value: { version: "0.99.1", context: installed build }
    since: "0.99.1"
    until: null
    observed: "2026-10-01"
    source: skill-naming
    evidence: run
  - value: { version: "1.1.0", context: installed build }
    since: "1.1.0"
    until: null
    observed: "2026-10-09"
    source: notes-pi
    evidence: run
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: notes-pi
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-pi.md"
    title: "pi: harness notes for a dispatcher"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in [pi](/harnesses/pi.md).
A harness version a source names, with the date and context (latest release, or the build installed
when checked).

## Observations

- 2026-08-08 (from 0.84.1): version: 0.84.1; context: latest release. Pre-1.0.[^harness-comparison]
- 2026-09-25 (from 0.84.3): version: 0.84.3; context: installed build.[^notes-pi]
- 2026-10-01 (from 0.99.1): version: 0.99.1; context: installed build.[^skill-naming]
- 2026-10-09 (from 1.1.0): version: 1.1.0; context: installed build.[^notes-pi]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^notes-pi]: pi: harness notes for a dispatcher
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

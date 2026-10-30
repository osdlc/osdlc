---
type: Harness Fact
title: "Goose: Version seen"
description: "Version seen in Goose, as observed over time."
tags: [meta]
harness: goose
subject: meta/version-seen
observations:
  - value: { version: "1.45.0", context: latest release }
    since: "1.45.0"
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in
[Goose](/harnesses/goose.md). A harness version a source names, with the date and context (latest
release, or the build installed when checked).

## Observations

- 2026-08-08 (from 1.45.0): version: 1.45.0; context: latest release.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

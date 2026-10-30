---
type: Harness Fact
title: "Grok Build: Version seen"
description: "Version seen in Grok Build, as observed over time."
tags: [meta]
harness: grok-build
subject: meta/version-seen
observations:
  - value: { version: "1.0.0", context: released 2026-08-07 }
    since: "1.0.0"
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in
[Grok Build](/harnesses/grok-build.md). A harness version a source names, with the date and context
(latest release, or the build installed when checked).

## Observations

- 2026-08-08 (from 1.0.0): version: 1.0.0; context: released 2026-08-07.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

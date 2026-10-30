---
type: Harness Fact
title: "Copilot CLI: Version seen"
description: "Version seen in Copilot CLI, as observed over time."
tags: [meta]
harness: copilot-cli
subject: meta/version-seen
observations:
  - value: { version: "1.0.78", context: latest release }
    since: "1.0.78"
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in
[Copilot CLI](/harnesses/copilot-cli.md). A harness version a source names, with the date and
context (latest release, or the build installed when checked).

## Observations

- 2026-08-08 (from 1.0.78): version: 1.0.78; context: latest release.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

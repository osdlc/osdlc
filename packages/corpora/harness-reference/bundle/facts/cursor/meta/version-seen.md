---
type: Harness Fact
title: "Cursor: Version seen"
description: "Version seen in Cursor, as observed over time."
tags: [meta]
harness: cursor
subject: meta/version-seen
observations:
  - value: { version: "3.12.x", context: IDE release line }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
    note: "The source names the release line, not a patch release, so since stays open."
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in
[Cursor](/harnesses/cursor.md). A harness version a source names, with the date and context (latest
release, or the build installed when checked).

## Observations

- 2026-08-08: version: 3.12.x; context: IDE release line. The source names the release line, not a
  patch release, so since stays open.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

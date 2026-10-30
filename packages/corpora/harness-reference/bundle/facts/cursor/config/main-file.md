---
type: Harness Fact
title: "Cursor: Main config file"
description: "Main config file in Cursor, as observed over time."
tags: [config]
harness: cursor
subject: config/main-file
observations:
  - value: { file: ".cursor/cli.json and others", format: JSON }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Main config file](/subjects/config/main-file.md) in
[Cursor](/harnesses/cursor.md). The harness's main settings file and its format.

## Observations

- 2026-08-08: file: .cursor/cli.json and others; format: JSON.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

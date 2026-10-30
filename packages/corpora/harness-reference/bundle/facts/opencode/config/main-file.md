---
type: Harness Fact
title: "OpenCode: Main config file"
description: "Main config file in OpenCode, as observed over time."
tags: [config]
harness: opencode
subject: config/main-file
observations:
  - value: { file: opencode.json, format: JSON, published_schema: true }
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
[OpenCode](/harnesses/opencode.md). The harness's main settings file and its format.

## Observations

- 2026-08-08: file: opencode.json; format: JSON; published schema: `true`.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

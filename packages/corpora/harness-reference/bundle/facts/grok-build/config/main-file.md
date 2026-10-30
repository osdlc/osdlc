---
type: Harness Fact
title: "Grok Build: Main config file"
description: "Main config file in Grok Build, as observed over time."
tags: [config]
harness: grok-build
subject: config/main-file
observations:
  - value: { file: ".grok/config.toml", format: TOML }
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
[Grok Build](/harnesses/grok-build.md). The harness's main settings file and its format.

## Observations

- 2026-08-08: file: .grok/config.toml; format: TOML.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

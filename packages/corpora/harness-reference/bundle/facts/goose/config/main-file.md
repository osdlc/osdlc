---
type: Harness Fact
title: "Goose: Main config file"
description: "Main config file in Goose, as observed over time."
tags: [config]
harness: goose
subject: config/main-file
observations:
  - value: { file: "~/.config/goose/config.yaml", format: YAML, scope: global only }
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
[Goose](/harnesses/goose.md). The harness's main settings file and its format.

## Observations

- 2026-08-08: file: ~/.config/goose/config.yaml; format: YAML; scope: global
  only.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

---
type: Harness Fact
title: "Amp: Main config file"
description: "Main config file in Amp, as observed over time."
tags: [config]
harness: amp
subject: config/main-file
observations:
  - value: { file: ".amp/settings.json", format: JSON, note: most of the config plane is account-side }
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
[Amp](/harnesses/amp.md). The harness's main settings file and its format.

## Observations

- 2026-08-08: file: .amp/settings.json; format: JSON; note: most of the config plane is
  account-side.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

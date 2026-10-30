---
type: Harness Fact
title: "DeepSeek Harness (dsh): Main config file"
description: "Main config file in DeepSeek Harness (dsh), as observed over time."
tags: [config]
harness: dsh
subject: config/main-file
observations:
  - value: { file: "cordis.patch.yml layers: bundle patches, $DSH_HOME/profiles/<name>/, $DSH_HOME/, then --patch files", format: YAML, per_project: false, merge: "a later layer replaces a row's whole config" }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness apps/cli/README.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Main config file](/subjects/config/main-file.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The harness's main settings file and its format.

## Observations

- 2026-10-08: file: cordis.patch.yml layers: bundle patches, $DSH_HOME/profiles/<name>/, $DSH_HOME/,
  then --patch files; format: YAML; per project: `false`; merge: a later layer replaces a row's
  whole config.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

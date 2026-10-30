---
type: Harness Fact
title: "DeepSeek Harness (dsh): Plugin manifest"
description: "Plugin manifest in DeepSeek Harness (dsh), as observed over time."
tags: [plugins]
harness: dsh
subject: plugins/manifest
observations:
  - value: { file: package.json, key: dsh.bundle.patch pointing at a cordis.patch.yml }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Plugin manifest](/subjects/plugins/manifest.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The manifest file that makes a directory a plugin or
package.

## Observations

- 2026-10-08: file: package.json; key: dsh.bundle.patch pointing at a cordis.patch.yml.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

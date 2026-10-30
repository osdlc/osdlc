---
type: Harness Fact
title: "DeepSeek Harness (dsh): allowed-tools"
description: "allowed-tools in DeepSeek Harness (dsh), as observed over time."
tags: [skill-frontmatter]
harness: dsh
subject: skill-frontmatter/allowed-tools
observations:
  - value: { supported: false }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    checked_version: "0.2.1-alpha.1"
    evidence: inferred
    note: "Not in the list of fields dsh honours, so probably ignored."
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [allowed-tools](/subjects/skill-frontmatter/allowed-tools.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). The `allowed-tools` field that lists tools a skill pre-approves to run.

## Observations

- 2026-10-08: supported: `false`. Not in the list of fields dsh honours, so probably
  ignored.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

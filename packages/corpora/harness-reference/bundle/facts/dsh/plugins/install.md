---
type: Harness Fact
title: "DeepSeek Harness (dsh): Plugin install"
description: "Plugin install in DeepSeek Harness (dsh), as observed over time."
tags: [plugins]
harness: dsh
subject: plugins/install
observations:
  - value: { commands: ["dsh plugin --profile <n> add <pkg>"], note: passes through to pnpm }
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

What the sources say about [Plugin install](/subjects/plugins/install.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). How a plugin or package is installed.

## Observations

- 2026-10-08: commands: `dsh plugin --profile <n> add <pkg>`; note: passes through to pnpm.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

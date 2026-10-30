---
type: Harness Fact
title: "DeepSeek Harness (dsh): Command files"
description: "Command files in DeepSeek Harness (dsh), as observed over time."
tags: [commands]
harness: dsh
subject: commands/files
observations:
  - value: { supported: false, note: slash commands come from TypeScript plugins }
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

What the sources say about [Command files](/subjects/commands/files.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Whether custom commands are defined as files, and what
replaced them.

## Observations

- 2026-10-08: supported: `false`; note: slash commands come from TypeScript plugins.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

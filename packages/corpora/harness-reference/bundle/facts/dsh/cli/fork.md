---
type: Harness Fact
title: "DeepSeek Harness (dsh): Fork a session"
description: "Fork a session in DeepSeek Harness (dsh), as observed over time."
tags: [cli]
harness: dsh
subject: cli/fork
observations:
  - value: { supported: false, note: "forking exists only internally, for subagents" }
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

What the sources say about [Fork a session](/subjects/cli/fork.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Whether a saved session can be cloned into a new one.

## Observations

- 2026-10-08: supported: `false`; note: forking exists only internally, for subagents.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

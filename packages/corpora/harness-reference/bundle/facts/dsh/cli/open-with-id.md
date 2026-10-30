---
type: Harness Fact
title: "DeepSeek Harness (dsh): Open with a chosen session id"
description: "Open with a chosen session id in DeepSeek Harness (dsh), as observed over time."
tags: [cli]
harness: dsh
subject: cli/open-with-id
observations:
  - value: { supported: false, note: "each run mints session-<uuid>, reported in the opening session event" }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness packages/bundle/headless/README.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Open with a chosen session id](/subjects/cli/open-with-id.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Whether a new session can be opened under a
caller-chosen id or name.

## Observations

- 2026-10-08: supported: `false`; note: each run mints session-<uuid>, reported in the opening
  session event.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

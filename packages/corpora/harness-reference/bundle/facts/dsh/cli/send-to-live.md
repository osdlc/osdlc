---
type: Harness Fact
title: "DeepSeek Harness (dsh): Send to a live session"
description: "Send to a live session in DeepSeek Harness (dsh), as observed over time."
tags: [cli]
harness: dsh
subject: cli/send-to-live
observations:
  - value: { supported: partial, headless: "no; one task per run", acp: "dsh --profile acp: session/prompt on a held-open process, one prompt at a time", sdk: "JSON-RPC with initialize, session/prompt, shutdown" }
    since: null
    until: null
    observed: "2026-10-08"
    source: notes-dsh
    locator: deepseek-ai/deepseek-harness packages/acp/acp/README.md at 5badb150
    checked_version: "0.2.1-alpha.1"
    evidence: source
sources:
  - id: notes-dsh
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-deepseek.md"
    title: "DeepSeek Harness (dsh): harness notes for a dispatcher"
---

What the sources say about [Send to a live session](/subjects/cli/send-to-live.md) in
[DeepSeek Harness (dsh)](/harnesses/dsh.md). Whether a message can be delivered into a session that
is already running.

## Observations

- 2026-10-08: supported: partial; headless: no; one task per run; acp: dsh --profile acp:
  session/prompt on a held-open process, one prompt at a time; sdk: JSON-RPC with initialize,
  session/prompt, shutdown.[^notes-dsh]

[^notes-dsh]: DeepSeek Harness (dsh): harness notes for a dispatcher

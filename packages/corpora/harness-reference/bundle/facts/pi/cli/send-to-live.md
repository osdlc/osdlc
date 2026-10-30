---
type: Harness Fact
title: "pi: Send to a live session"
description: "Send to a live session in pi, as observed over time."
tags: [cli]
harness: pi
subject: cli/send-to-live
observations:
  - value: { supported: partial, mechanism: "--mode rpc: prompt, steer and follow_up JSON lines on stdin", limit: "only a process the caller spawned in RPC mode; no attach to a running TUI" }
    since: null
    until: null
    observed: "2026-09-25"
    source: notes-pi
    checked_version: "0.84.3"
    evidence: docs
sources:
  - id: notes-pi
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-pi.md"
    title: "pi: harness notes for a dispatcher"
---

What the sources say about [Send to a live session](/subjects/cli/send-to-live.md) in
[pi](/harnesses/pi.md). Whether a message can be delivered into a session that is already running.

## Observations

- 2026-09-25: supported: partial; mechanism: --mode rpc: prompt, steer and follow_up JSON lines on
  stdin; limit: only a process the caller spawned in RPC mode; no attach to a running TUI.[^notes-pi]

[^notes-pi]: pi: harness notes for a dispatcher

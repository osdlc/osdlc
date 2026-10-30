---
type: Harness Fact
title: "Codex CLI: Send to a live session"
description: "Send to a live session in Codex CLI, as observed over time."
tags: [cli]
harness: codex
subject: cli/send-to-live
observations:
  - value: { supported: partial, command: "codex queue --thread <uuid|name> --message <text>" }
    since: null
    until: null
    observed: "2026-09-25"
    source: notes-codex
    checked_version: "0.155.1"
    evidence: help-text
    note: "Sessions live behind a shared local app-server daemon (`--remote <ADDR>`)."
open:
  - question: "Whether `codex queue` reaches a session open in a live TUI, or only a saved or idle one."
    observed: "2026-09-25"
    source: notes-codex
sources:
  - id: notes-codex
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-codex.md"
    title: "Codex: harness notes for a dispatcher"
---

What the sources say about [Send to a live session](/subjects/cli/send-to-live.md) in
[Codex CLI](/harnesses/codex.md). Whether a message can be delivered into a session that is already
running.

## Observations

- 2026-09-25: supported: partial; command: codex queue --thread <uuid|name> --message <text>.
  Sessions live behind a shared local app-server daemon (`--remote <ADDR>`).[^notes-codex]

## Open questions

- Whether `codex queue` reaches a session open in a live TUI, or only a saved or idle one.[^notes-codex]

[^notes-codex]: Codex: harness notes for a dispatcher

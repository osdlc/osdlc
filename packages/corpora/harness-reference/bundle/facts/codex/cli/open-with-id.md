---
type: Harness Fact
title: "Codex CLI: Open with a chosen session id"
description: "Open with a chosen session id in Codex CLI, as observed over time."
tags: [cli]
harness: codex
subject: cli/open-with-id
observations:
  - value: { supported: false, note: "the session id is assigned automatically; no open flag sets a name" }
    since: null
    until: null
    observed: "2026-09-25"
    source: notes-codex
    checked_version: "0.155.1"
    evidence: help-text
sources:
  - id: notes-codex
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-codex.md"
    title: "Codex: harness notes for a dispatcher"
---

What the sources say about [Open with a chosen session id](/subjects/cli/open-with-id.md) in
[Codex CLI](/harnesses/codex.md). Whether a new session can be opened under a caller-chosen id or
name.

## Observations

- 2026-09-25: supported: `false`; note: the session id is assigned automatically; no open flag sets
  a name.[^notes-codex]

[^notes-codex]: Codex: harness notes for a dispatcher

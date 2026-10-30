---
type: Harness Fact
title: "pi: Open with a chosen session id"
description: "Open with a chosen session id in pi, as observed over time."
tags: [cli]
harness: pi
subject: cli/open-with-id
observations:
  - value: { supported: true, flags: "--session-id <id> --name <name>", note: creates the session if it does not exist }
    since: null
    until: null
    observed: "2026-09-25"
    source: notes-pi
    checked_version: "0.84.3"
    evidence: help-text
sources:
  - id: notes-pi
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-pi.md"
    title: "pi: harness notes for a dispatcher"
---

What the sources say about [Open with a chosen session id](/subjects/cli/open-with-id.md) in
[pi](/harnesses/pi.md). Whether a new session can be opened under a caller-chosen id or name.

## Observations

- 2026-09-25: supported: `true`; flags: --session-id <id> --name <name>; note: creates the session
  if it does not exist.[^notes-pi]

[^notes-pi]: pi: harness notes for a dispatcher

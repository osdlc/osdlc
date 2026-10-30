---
type: Harness Fact
title: "pi: Fork a session"
description: "Fork a session in pi, as observed over time."
tags: [cli]
harness: pi
subject: cli/fork
observations:
  - value: { supported: true, flags: "--fork <path|id>" }
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

What the sources say about [Fork a session](/subjects/cli/fork.md) in [pi](/harnesses/pi.md).
Whether a saved session can be cloned into a new one.

## Observations

- 2026-09-25: supported: `true`; flags: --fork <path|id>.[^notes-pi]

[^notes-pi]: pi: harness notes for a dispatcher

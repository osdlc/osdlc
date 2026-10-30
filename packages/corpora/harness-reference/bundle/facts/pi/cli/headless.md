---
type: Harness Fact
title: "pi: Headless run"
description: "Headless run in pi, as observed over time."
tags: [cli]
harness: pi
subject: cli/headless
observations:
  - value: { flag: "-p/--print", note: text output by default }
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

What the sources say about [Headless run](/subjects/cli/headless.md) in [pi](/harnesses/pi.md). The
flag or subcommand for a one-shot, non-interactive run.

## Observations

- 2026-09-25: flag: -p/--print; note: text output by default.[^notes-pi]

[^notes-pi]: pi: harness notes for a dispatcher

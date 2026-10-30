---
type: Harness Fact
title: "pi: Resume a session"
description: "Resume a session in pi, as observed over time."
tags: [cli]
harness: pi
subject: cli/resume
observations:
  - value: { supported: true, flags: "--session <path|id> [prompt]", latest: "-c/--continue", picker: "-r/--resume" }
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

What the sources say about [Resume a session](/subjects/cli/resume.md) in [pi](/harnesses/pi.md).
How a saved session is resumed, and whether a new prompt can be passed.

## Observations

- 2026-09-25: supported: `true`; flags: --session <path|id> [prompt]; latest: -c/--continue; picker:
  -r/--resume.[^notes-pi]

[^notes-pi]: pi: harness notes for a dispatcher

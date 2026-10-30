---
type: Harness Fact
title: "Gemini CLI: Headless run"
description: "Headless run in Gemini CLI, as observed over time."
tags: [cli]
harness: gemini-cli
subject: cli/headless
observations:
  - value: { flag: "-p, --prompt <string>", note: appended to stdin }
    since: null
    until: null
    observed: "2026-10-09"
    source: notes-gemini
    checked_version: "0.46.0"
    evidence: help-text
sources:
  - id: notes-gemini
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-gemini.md"
    title: "gemini: harness notes for a dispatcher"
---

What the sources say about [Headless run](/subjects/cli/headless.md) in
[Gemini CLI](/harnesses/gemini-cli.md). The flag or subcommand for a one-shot, non-interactive run.

## Observations

- 2026-10-09: flag: -p, --prompt <string>; note: appended to stdin.[^notes-gemini]

[^notes-gemini]: gemini: harness notes for a dispatcher

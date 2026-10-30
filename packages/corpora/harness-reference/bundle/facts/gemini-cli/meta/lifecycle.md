---
type: Harness Fact
title: "Gemini CLI: Lifecycle"
description: "Lifecycle in Gemini CLI, as observed over time."
tags: [meta]
harness: gemini-cli
subject: meta/lifecycle
observations:
  - value: { status: sunsetting, successor: antigravity, note: consumer tiers stopped being served 2026-06-18 }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
  - value: { status: sunsetting, successor: antigravity, note: "sign-in fails with IneligibleTierError for Gemini Code Assist for individuals, pointing at Antigravity; an API key was not tried" }
    since: null
    until: null
    observed: "2026-10-09"
    source: notes-gemini
    checked_version: "0.46.0"
    evidence: run
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: notes-gemini
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harnesses-gemini.md"
    title: "gemini: harness notes for a dispatcher"
---

What the sources say about [Lifecycle](/subjects/meta/lifecycle.md) in
[Gemini CLI](/harnesses/gemini-cli.md). General availability, preview status, sunset, or a named
successor.

## Observations

- 2026-08-08: status: sunsetting; successor: antigravity; note: consumer tiers stopped being served
  2026-06-18.[^harness-comparison]
- 2026-10-09: status: sunsetting; successor: antigravity; note: sign-in fails with
  IneligibleTierError for Gemini Code Assist for individuals, pointing at Antigravity; an API key
  was not tried.[^notes-gemini]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^notes-gemini]: gemini: harness notes for a dispatcher

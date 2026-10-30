---
type: Harness Fact
title: "Gemini CLI: Hook configuration"
description: "Hook configuration in Gemini CLI, as observed over time."
tags: [hooks]
harness: gemini-cli
subject: hooks/config
observations:
  - value: { location: "settings `hooks`", kind: shell commands in JSON config }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
---

What the sources say about [Hook configuration](/subjects/hooks/config.md) in
[Gemini CLI](/harnesses/gemini-cli.md). Where hooks are configured and whether they are shell
commands or code plugins.

## Observations

- 2026-08-08: location: settings `hooks`; kind: shell commands in JSON config.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

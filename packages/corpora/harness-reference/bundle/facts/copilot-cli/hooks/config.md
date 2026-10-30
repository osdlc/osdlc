---
type: Harness Fact
title: "Copilot CLI: Hook configuration"
description: "Hook configuration in Copilot CLI, as observed over time."
tags: [hooks]
harness: copilot-cli
subject: hooks/config
observations:
  - value: { location: ".github/hooks/*.json", kind: shell commands in JSON config }
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
[Copilot CLI](/harnesses/copilot-cli.md). Where hooks are configured and whether they are shell
commands or code plugins.

## Observations

- 2026-08-08: location: .github/hooks/*.json; kind: shell commands in JSON
  config.[^harness-comparison]

[^harness-comparison]: Harness comparison (researched 2026-08-08)

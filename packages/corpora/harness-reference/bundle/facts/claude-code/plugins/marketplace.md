---
type: Harness Fact
title: "Claude Code: Marketplace"
description: "Marketplace in Claude Code, as observed over time."
tags: [plugins]
harness: claude-code
subject: plugins/marketplace
observations:
  - value: { supported: true, install_id: "name@marketplace" }
    since: null
    until: null
    observed: "2026-10-01"
    source: claude-marketplace-reference
    via: skill-naming
    evidence: docs
    note: "`enabledPlugins` uses the marketplace entry name; components use the manifest name."
sources:
  - id: claude-marketplace-reference
    resource: "https://code.claude.com/docs/en/plugins/marketplace-reference"
    title: "Claude Code docs: marketplace reference"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Marketplace](/subjects/plugins/marketplace.md) in
[Claude Code](/harnesses/claude-code.md). Whether plugins are distributed through a marketplace, and
its format.

## Observations

- 2026-10-01: supported: `true`; install id: name@marketplace. `enabledPlugins` uses the marketplace
  entry name; components use the manifest name.[^claude-marketplace-reference][^skill-naming]

[^claude-marketplace-reference]: Claude Code docs: marketplace reference
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

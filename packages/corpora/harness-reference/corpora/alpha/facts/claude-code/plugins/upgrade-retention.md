---
type: Harness Fact
title: "Claude Code: Old plugin versions"
description: "Old plugin versions in Claude Code, as observed over time."
tags: [plugins]
harness: claude-code
subject: plugins/upgrade-retention
observations:
  - value: {"old_versions_kept": true, "retention": "14 days, then removed by a background cleanup"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugin-loading
    locator: "Cleanup of previous versions"
    evidence: docs
sources:
  - id: claude-code-plugin-loading
    resource: "https://code.claude.com/docs/en/plugins/loading.md"
    title: "Claude Code docs: plugin loading reference"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Claude Code](/harnesses/claude-code.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Observations

- 2026-11-04: old versions kept: yes; retention: 14 days, then removed by a background cleanup.[^claude-code-plugin-loading]

  > Claude Code writes an .orphaned_at marker into the previous version directory. It removes that directory in a background cleanup 14 days later

[^claude-code-plugin-loading]: Claude Code docs: plugin loading reference

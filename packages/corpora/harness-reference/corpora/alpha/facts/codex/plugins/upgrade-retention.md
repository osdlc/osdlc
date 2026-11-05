---
type: Harness Fact
title: "Codex CLI: Old plugin versions"
description: "Old plugin versions in Codex CLI, as observed over time."
tags: [plugins]
harness: codex
subject: plugins/upgrade-retention
observations: []
open:
  - question: "After a plugin upgrade, does Codex keep the previous version directory under plugins/cache?"
    observed: "2026-11-04"
    source: codex-plugins-build
sources:
  - id: codex-plugins-build
    resource: "https://developers.openai.com/codex/plugins/build"
    title: "Codex docs: build plugins"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Codex CLI](/harnesses/codex.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Open questions

- After a plugin upgrade, does Codex keep the previous version directory under plugins/cache?[^codex-plugins-build]

[^codex-plugins-build]: Codex docs: build plugins

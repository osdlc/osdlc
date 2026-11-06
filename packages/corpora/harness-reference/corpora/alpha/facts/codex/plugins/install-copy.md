---
type: Harness Fact
title: "Codex CLI: Plugin install copy"
description: "Plugin install copy in Codex CLI, as observed over time."
tags: [plugins]
harness: codex
subject: plugins/install-copy
observations:
  - value: {"copied": "yes, local plugins are copied into the cache and loaded from the copy"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-plugins-build
    locator: "Where installed plugins are stored"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "When Codex copies a plugin into its cache, do exec bits and symlinks survive?"
    observed: "2026-11-04"
    source: codex-plugins-build
sources:
  - id: codex-plugins-build
    resource: "https://developers.openai.com/codex/plugins/build"
    title: "Codex docs: build plugins"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Codex CLI](/harnesses/codex.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: copied: yes, local plugins are copied into the cache and loaded from the copy. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-plugins-build]

  > ChatGPT loads the installed copy from that cache path rather than directly from the marketplace entry.

## Open questions

- When Codex copies a plugin into its cache, do exec bits and symlinks survive?[^codex-plugins-build]

[^codex-plugins-build]: Codex docs: build plugins

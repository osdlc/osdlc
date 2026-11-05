---
type: Harness Fact
title: "OpenCode: Plugin install copy"
description: "Plugin install copy in OpenCode, as observed over time."
tags: [plugins]
harness: opencode
subject: plugins/install-copy
observations:
  - value: {"local_plugins": "used in place, not copied"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-plugins
    locator: "How plugins are installed"
    evidence: docs
open:
  - question: "For npm plugins, do exec bits and symlinks survive the Bun install?"
    observed: "2026-11-04"
    source: opencode-plugins
sources:
  - id: opencode-plugins
    resource: "https://opencode.ai/docs/plugins"
    title: "OpenCode docs: Plugins"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [OpenCode](/harnesses/opencode.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: local plugins: used in place, not copied.[^opencode-plugins]

  > **Local plugins** are loaded directly from the plugin directory.

## Open questions

- For npm plugins, do exec bits and symlinks survive the Bun install?[^opencode-plugins]

[^opencode-plugins]: OpenCode docs: Plugins

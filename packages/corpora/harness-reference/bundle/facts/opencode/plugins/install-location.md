---
type: Harness Fact
title: "OpenCode: Plugin install location"
description: "Plugin install location in OpenCode, as observed over time."
tags: [plugins]
harness: opencode
subject: plugins/install-location
observations:
  - value: {"npm_plugins": "installed with Bun at startup; cached in ~/.cache/opencode/node_modules/", "local_plugins": "loaded directly from the plugin directory"}
    since: null
    until: null
    observed: "2026-11-04"
    source: opencode-plugins
    locator: "How plugins are installed"
    evidence: docs
open:
  - question: "Does OpenCode have a plugin or package format that installs skills? The plugins page describes JavaScript or TypeScript plugin modules and never mentions skills."
    observed: "2026-11-04"
    source: opencode-plugins
sources:
  - id: opencode-plugins
    resource: "https://opencode.ai/docs/plugins"
    title: "OpenCode docs: Plugins"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [OpenCode](/harnesses/opencode.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: npm plugins: installed with Bun at startup; cached in ~/.cache/opencode/node_modules/; local plugins: loaded directly from the plugin directory.[^opencode-plugins]

  > **npm plugins** are installed automatically using Bun at startup. Packages and their dependencies are cached in `~/.cache/opencode/node_modules/`.

## Open questions

- Does OpenCode have a plugin or package format that installs skills? The plugins page describes JavaScript or TypeScript plugin modules and never mentions skills.[^opencode-plugins]

[^opencode-plugins]: OpenCode docs: Plugins

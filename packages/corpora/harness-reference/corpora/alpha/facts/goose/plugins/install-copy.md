---
type: Harness Fact
title: "Goose: Plugin install copy"
description: "Plugin install copy in Goose, as observed over time."
tags: [plugins]
harness: goose
subject: plugins/install-copy
observations:
  - value: {"install": "clones the repository and copies it into the plugins directory"}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-plugins
    locator: "Install a Plugin"
    evidence: docs
open:
  - question: "Do exec bits and symlinks survive the copy?"
    observed: "2026-11-04"
    source: goose-plugins
sources:
  - id: goose-plugins
    resource: "https://goose-docs.ai/docs/guides/context-engineering/plugins"
    title: "goose docs: Plugins"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Goose](/harnesses/goose.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: install: clones the repository and copies it into the plugins directory.[^goose-plugins]

  > The install command clones the repository, detects the plugin format, copies it into the plugins directory, and reports the imported components.

## Open questions

- Do exec bits and symlinks survive the copy?[^goose-plugins]

[^goose-plugins]: goose docs: Plugins

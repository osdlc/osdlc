---
type: Harness Fact
title: "Goose: Old plugin versions"
description: "Old plugin versions in Goose, as observed over time."
tags: [plugins]
harness: goose
subject: plugins/upgrade-retention
observations:
  - value: {"update": "replaces the installed copy", "old_version_kept": false}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-plugins
    locator: "Update a Plugin Manually"
    evidence: docs
sources:
  - id: goose-plugins
    resource: "https://goose-docs.ai/docs/guides/context-engineering/plugins"
    title: "goose docs: Plugins"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Goose](/harnesses/goose.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Observations

- 2026-11-04: update: replaces the installed copy; old version kept: no.[^goose-plugins]

  > The update command fetches the plugin from its original git source, replaces the installed copy, and preserves whether auto-update was enabled for that plugin.

[^goose-plugins]: goose docs: Plugins

---
type: Harness Fact
title: "Goose: Plugin install location"
description: "Plugin install location in Goose, as observed over time."
tags: [plugins]
harness: goose
subject: plugins/install-location
observations:
  - value: {"user": "~/.agents/plugins/<plugin-name>", "project": ".agents/plugins/<plugin-name>"}
    since: null
    until: null
    observed: "2026-11-04"
    source: goose-plugins
    locator: "Plugin Locations"
    evidence: docs
sources:
  - id: goose-plugins
    resource: "https://goose-docs.ai/docs/guides/context-engineering/plugins"
    title: "goose docs: Plugins"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Goose](/harnesses/goose.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: user: ~/.agents/plugins/<plugin-name>; project: .agents/plugins/<plugin-name>.[^goose-plugins]

  > | User plugin | `~/.agents/plugins/<plugin-name>/` | Includes plugins installed with `goose plugin install` and plugins manually copied into your user plugins directory. |

[^goose-plugins]: goose docs: Plugins

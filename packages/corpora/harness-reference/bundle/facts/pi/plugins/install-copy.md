---
type: Harness Fact
title: "pi: Plugin install copy"
description: "Plugin install copy in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/install-copy
observations:
  - value: {"local_package": "not copied; loaded in place"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-packages
    locator: "Choose a source, Local row"
    evidence: docs
open:
  - question: "For npm and git installs, do exec bits and symlinks survive?"
    observed: "2026-11-04"
    source: pi-packages
sources:
  - id: pi-packages
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/packages.md"
    title: "Pi docs: Pi Packages (main at d57c2d2)"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [pi](/harnesses/pi.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: local package: not copied; loaded in place.[^pi-packages]

  > Loaded from the resolved path without copying

## Open questions

- For npm and git installs, do exec bits and symlinks survive?[^pi-packages]

[^pi-packages]: Pi docs: Pi Packages (main at d57c2d2)

---
type: Harness Fact
title: "pi: Plugin install location"
description: "Plugin install location in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/install-location
observations:
  - value: {"declaration_file": "~/.pi/agent/settings.json (personal) or .pi/settings.json (--local)"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-packages
    locator: "Install and manage packages"
    evidence: docs
  - value: {"local": "loaded from the resolved path without copying", "npm": "installed under the Pi npm directory", "git": "cloned and reconciled to the selected ref"}
    since: null
    until: null
    observed: "2026-11-04"
    source: pi-packages
    locator: "Choose a source, Local row"
    evidence: docs
open:
  - question: "What are the exact on-disk directories for npm and git package installs?"
    observed: "2026-11-04"
    source: pi-packages
sources:
  - id: pi-packages
    resource: "https://github.com/earendil-works/pi/blob/d57c2d21916eaad1158031526ac6ec860eae5f14/packages/coding-agent/docs/packages.md"
    title: "Pi docs: Pi Packages (main at d57c2d2)"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [pi](/harnesses/pi.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: declaration file: ~/.pi/agent/settings.json (personal) or .pi/settings.json (--local).[^pi-packages]

  > Personal installs are written to `~/.pi/agent/settings.json`.
- 2026-11-04: local: loaded from the resolved path without copying; npm: installed under the Pi npm directory; git: cloned and reconciled to the selected ref.[^pi-packages]

  > Loaded from the resolved path without copying

## Open questions

- What are the exact on-disk directories for npm and git package installs?[^pi-packages]

[^pi-packages]: Pi docs: Pi Packages (main at d57c2d2)

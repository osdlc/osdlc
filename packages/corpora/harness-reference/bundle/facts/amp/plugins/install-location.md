---
type: Harness Fact
title: "Amp: Plugin install location"
description: "Plugin install location in Amp, as observed over time."
tags: [plugins]
harness: amp
subject: plugins/install-location
observations:
  - value: {"machine_skills": "~/.config/agents/skills/ via amp skill add --global"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Creating and Installing Skills"
    evidence: docs
  - value: {"project_plugins": ".amp/plugins/", "system_plugins": "~/.config/amp/plugins/ (or $XDG_CONFIG_HOME/amp/plugins/)"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-plugins
    locator: "Plugin Locations and Precedence"
    evidence: docs
  - value: {"hosted_import": "copied into the personal git repository"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-global
    locator: "Import for Personal Use"
    evidence: docs
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
  - id: amp-plugins
    resource: "https://ampcode.com/docs/markdown/customize/plugins"
    title: "Amp docs: Plugins"
  - id: amp-global
    resource: "https://ampcode.com/docs/markdown/customize/global-plugins-and-skills"
    title: "Amp docs: Global Plugins & Skills"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Amp](/harnesses/amp.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: machine skills: ~/.config/agents/skills/ via amp skill add --global.[^amp-skills]

  > Pass `--global` to install it only on the current machine under `~/.config/agents/skills/`.
- 2026-11-04: project plugins: .amp/plugins/; system plugins: ~/.config/amp/plugins/ (or $XDG_CONFIG_HOME/amp/plugins/).[^amp-plugins]

  > If `XDG_CONFIG_HOME` is set, put files or directories in `$XDG_CONFIG_HOME/amp/plugins/`. Otherwise, use `~/.config/amp/plugins/` on macOS and Linux
- 2026-11-04: hosted import: copied into the personal git repository.[^amp-global]

  > Amp copies the item into your personal repository and records where it came from so it can be updated later.

[^amp-skills]: Amp docs: Skills
[^amp-plugins]: Amp docs: Plugins
[^amp-global]: Amp docs: Global Plugins & Skills

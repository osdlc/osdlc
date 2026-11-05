---
type: Harness Fact
title: "Copilot CLI: Plugin install location"
description: "Plugin install location in Copilot CLI, as observed over time."
tags: [plugins]
harness: copilot-cli
subject: plugins/install-location
observations:
  - value: {"marketplace": "~/.copilot/installed-plugins/MARKETPLACE/PLUGIN-NAME", "direct": "~/.copilot/installed-plugins/_direct/SOURCE-ID/"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-plugin-reference
    locator: "Plugin install location"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"layout": "marketplace installs under installed-plugins/{marketplace-name}/{plugin-name}/; direct under installed-plugins/_direct/"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-config-dir-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"local_marketplace_plugins": "path-sourced plugins in a local directory marketplace load live from their real directory"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-plugin-reference
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: copilot-cli-plugin-reference
    resource: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference"
    title: "Copilot docs: CLI plugin reference"
  - id: copilot-cli-config-dir-reference
    resource: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference"
    title: "Copilot docs: CLI config directory reference"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Copilot CLI](/harnesses/copilot-cli.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: marketplace: ~/.copilot/installed-plugins/MARKETPLACE/PLUGIN-NAME; direct: ~/.copilot/installed-plugins/_direct/SOURCE-ID/. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-plugin-reference]

  > ~/.copilot/installed-plugins/MARKETPLACE/PLUGIN-NAME
- 2026-11-04: layout: marketplace installs under installed-plugins/{marketplace-name}/{plugin-name}/; direct under installed-plugins/_direct/. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-config-dir-reference]

  > Plugins installed from a marketplace are stored under installed-plugins/{marketplace-name}/{plugin-name}/.
- 2026-11-04: local marketplace plugins: path-sourced plugins in a local directory marketplace load live from their real directory. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-plugin-reference]

  > Path-sourced plugins in a local (directory-source) marketplace load live from their real directory.

[^copilot-cli-plugin-reference]: Copilot docs: CLI plugin reference
[^copilot-cli-config-dir-reference]: Copilot docs: CLI config directory reference

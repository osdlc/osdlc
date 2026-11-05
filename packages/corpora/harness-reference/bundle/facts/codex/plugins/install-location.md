---
type: Harness Fact
title: "Codex CLI: Plugin install location"
description: "Plugin install location in Codex CLI, as observed over time."
tags: [plugins]
harness: codex
subject: plugins/install-location
observations:
  - value: {"path": "~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/", "local_plugin_version": "local"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-plugins-build
    locator: "Where installed plugins are stored"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"uninstall": "removes the plugin bundle from the environment"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-plugins
    locator: "Uninstall"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: codex-plugins-build
    resource: "https://developers.openai.com/codex/plugins/build"
    title: "Codex docs: build plugins"
  - id: codex-plugins
    resource: "https://learn.chatgpt.com/docs/plugins"
    title: "Codex docs: plugins (redirect target of developers.openai.com/codex/plugins)"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Codex CLI](/harnesses/codex.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: path: ~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/; local plugin version: local. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-plugins-build]

  > ChatGPT installs plugins into ~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/.
- 2026-11-04: uninstall: removes the plugin bundle from the environment. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-plugins]

  > Uninstalling a plugin removes the plugin bundle from that ChatGPT or Codex environment.

[^codex-plugins-build]: Codex docs: build plugins
[^codex-plugins]: Codex docs: plugins (redirect target of developers.openai.com/codex/plugins)

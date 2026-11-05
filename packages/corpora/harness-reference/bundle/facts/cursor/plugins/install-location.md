---
type: Harness Fact
title: "Cursor: Plugin install location"
description: "Plugin install location in Cursor, as observed over time."
tags: [plugins]
harness: cursor
subject: plugins/install-location
observations:
  - value: {"local_plugin_folder": "~/.cursor/plugins/local", "local_method": "copy plugin files into the folder"}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-plugins
    locator: "Test plugins locally"
    evidence: docs
open:
  - question: "Where do marketplace-installed plugin files go on disk (path, versioned cache or not)?"
    observed: "2026-11-04"
    source: cursor-plugins
sources:
  - id: cursor-plugins
    resource: "https://cursor.com/docs/plugins"
    title: "Cursor docs: Plugins"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Cursor](/harnesses/cursor.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: local plugin folder: ~/.cursor/plugins/local; local method: copy plugin files into the folder.[^cursor-plugins]

  > Copy your plugin files into that folder. Include either a root `plugin.json` for an Agent Plugin or `.cursor-plugin/plugin.json` for a Cursor Plugin.

## Open questions

- Where do marketplace-installed plugin files go on disk (path, versioned cache or not)?[^cursor-plugins]

[^cursor-plugins]: Cursor docs: Plugins

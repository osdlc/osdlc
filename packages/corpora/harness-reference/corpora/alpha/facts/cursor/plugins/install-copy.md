---
type: Harness Fact
title: "Cursor: Plugin install copy"
description: "Plugin install copy in Cursor, as observed over time."
tags: [plugins]
harness: cursor
subject: plugins/install-copy
observations:
  - value: {"symlinks": "load only when the target resolves inside ~/.cursor/plugins/local"}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-plugins
    locator: "Test plugins locally"
    evidence: docs
open:
  - question: "Does a marketplace install copy the plugin folder whole, and do exec bits survive?"
    observed: "2026-11-04"
    source: cursor-plugins
sources:
  - id: cursor-plugins
    resource: "https://cursor.com/docs/plugins"
    title: "Cursor docs: Plugins"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Cursor](/harnesses/cursor.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: symlinks: load only when the target resolves inside ~/.cursor/plugins/local.[^cursor-plugins]

  > Symlinks in `~/.cursor/plugins/local` load only when the target resolves to a directory inside that folder. Cursor skips a symlink that points to a plugin repository elsewhere on disk.

## Open questions

- Does a marketplace install copy the plugin folder whole, and do exec bits survive?[^cursor-plugins]

[^cursor-plugins]: Cursor docs: Plugins

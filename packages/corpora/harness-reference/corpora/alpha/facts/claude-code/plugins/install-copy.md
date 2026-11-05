---
type: Harness Fact
title: "Claude Code: Plugin install copy"
description: "Plugin install copy in Claude Code, as observed over time."
tags: [plugins]
harness: claude-code
subject: plugins/install-copy
observations:
  - value: {"copied_whole": "yes for marketplace plugins; files outside the plugin directory are not copied"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugin-loading
    locator: "In-place and copied plugins"
    evidence: docs
  - value: {"symlinks_leaving_plugin": "rejected as component paths, except links between plugins within one marketplace"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugin-loading
    locator: "Paths that escape the plugin directory"
    evidence: docs
open:
  - question: "When the plugin folder is copied into the cache, do exec bits and symlinks that stay inside the plugin survive the copy?"
    observed: "2026-11-04"
    source: claude-code-plugin-loading
sources:
  - id: claude-code-plugin-loading
    resource: "https://code.claude.com/docs/en/plugins/loading.md"
    title: "Claude Code docs: plugin loading reference"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Claude Code](/harnesses/claude-code.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: copied whole: yes for marketplace plugins; files outside the plugin directory are not copied.[^claude-code-plugin-loading]

  > Every other marketplace plugin: Claude Code copies the plugin into cache/<marketplace>/<plugin>/<version>/ at install and loads that copy. Files outside the plugin directory aren't copied
- 2026-11-04: symlinks leaving plugin: rejected as component paths, except links between plugins within one marketplace.[^claude-code-plugin-loading]

  > A symlink that leads outside the plugin, other than links between plugins within one marketplace

## Open questions

- When the plugin folder is copied into the cache, do exec bits and symlinks that stay inside the plugin survive the copy?[^claude-code-plugin-loading]

[^claude-code-plugin-loading]: Claude Code docs: plugin loading reference

---
type: Harness Fact
title: "Claude Code: Plugin install location"
description: "Plugin install location in Claude Code, as observed over time."
tags: [plugins]
harness: claude-code
subject: plugins/install-location
observations:
  - value: {"marketplace_plugins": "~/.claude/plugins/cache/<marketplace>/<plugin>/<version>", "root_override": "CLAUDE_CODE_PLUGIN_CACHE_DIR"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugin-loading
    locator: "Find plugins on disk"
    evidence: docs
  - value: {"local_plugin": "--plugin-dir and skills-directory plugins load in place, never copied"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugin-loading
    locator: "In-place and copied plugins"
    evidence: docs
  - value: {"local_marketplace_relative_path": "loads in place from the marketplace folder"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-plugin-loading
    locator: "In-place and copied plugins"
    evidence: docs
sources:
  - id: claude-code-plugin-loading
    resource: "https://code.claude.com/docs/en/plugins/loading.md"
    title: "Claude Code docs: plugin loading reference"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Claude Code](/harnesses/claude-code.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: marketplace plugins: ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>; root override: CLAUDE_CODE_PLUGIN_CACHE_DIR.[^claude-code-plugin-loading]

  > cache/<marketplace>/<plugin>/<version>/ | One directory per installed version of a marketplace plugin.
- 2026-11-04: local plugin: --plugin-dir and skills-directory plugins load in place, never copied.[^claude-code-plugin-loading]

  > --plugin-dir and skills-directory plugins: the directory loads in place and is never copied.
- 2026-11-04: local marketplace relative path: loads in place from the marketplace folder.[^claude-code-plugin-loading]

  > Relative-path plugins in a marketplace you added from a local path: the plugin loads in place from its path inside the marketplace folder.

[^claude-code-plugin-loading]: Claude Code docs: plugin loading reference

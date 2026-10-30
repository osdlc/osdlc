---
type: Harness Fact
title: "Claude Code: Plugin manifest"
description: "Plugin manifest in Claude Code, as observed over time."
tags: [plugins]
harness: claude-code
subject: plugins/manifest
observations:
  - value: { file: ".claude-plugin/plugin.json", skills_layout: "skills/<name>/SKILL.md", optional: true }
    since: null
    until: null
    observed: "2026-10-01"
    source: claude-plugins-reference
    via: skill-naming
    evidence: docs
    note: "Without plugin.json the plugin name comes from the marketplace entry or the `--plugin-dir` directory."
sources:
  - id: claude-plugins-reference
    resource: "https://code.claude.com/docs/en/plugins-reference"
    title: "Claude Code docs: plugins reference"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Plugin manifest](/subjects/plugins/manifest.md) in
[Claude Code](/harnesses/claude-code.md). The manifest file that makes a directory a plugin or
package.

## Observations

- 2026-10-01: file: .claude-plugin/plugin.json; skills layout: skills/<name>/SKILL.md; optional:
  `true`. Without plugin.json the plugin name comes from the marketplace entry or the `--plugin-dir`
  directory.[^claude-plugins-reference][^skill-naming]

[^claude-plugins-reference]: Claude Code docs: plugins reference
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

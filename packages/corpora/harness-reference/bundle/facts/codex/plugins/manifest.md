---
type: Harness Fact
title: "Codex CLI: Plugin manifest"
description: "Plugin manifest in Codex CLI, as observed over time."
tags: [plugins]
harness: codex
subject: plugins/manifest
observations:
  - value: { documented: false }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
    note: Plugin manifest not yet documented.
  - value: { files: [plugin.json (Agent Plugins root), ".codex-plugin/plugin.json (legacy)"], legacy_discovery_also: [".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"], skills: "manifest-declared paths win, else `skills/`" }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    locator: "codex-rs/core-plugins/src/manifest.rs:37-40, exec-server-protocol/src/protocol.rs:51-55, core-plugins/src/loader.rs:1081-1100 at 57ac6f5"
    evidence: source
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Plugin manifest](/subjects/plugins/manifest.md) in
[Codex CLI](/harnesses/codex.md). The manifest file that makes a directory a plugin or package.

## Observations

- 2026-08-08: documented: `false`. Plugin manifest not yet documented.[^harness-comparison]
- 2026-10-01: files: `plugin.json (Agent Plugins root)`, `.codex-plugin/plugin.json (legacy)`;
  legacy discovery also: `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`; skills:
  manifest-declared paths win, else `skills/`.[^codex-repo][^skill-naming]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

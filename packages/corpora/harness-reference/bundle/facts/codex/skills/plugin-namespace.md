---
type: Harness Fact
title: "Codex CLI: Plugin skill runtime name"
description: "Plugin skill runtime name in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/plugin-namespace
observations:
  - value: { runtime_name: "acme-tools:review", namespace_from: "nearest manifest `name`" }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    locator: "codex-rs/ext/skills/src/loader/environment.rs:259 at 57ac6f5"
    evidence: source
    note: "The model is told \"Skills from this plugin are prefixed with `{skill_namespace}:`\" (core/src/plugins/render.rs:44)."
sources:
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Plugin skill runtime name](/subjects/skills/plugin-namespace.md) in
[Codex CLI](/harnesses/codex.md). The name a skill gets when it ships in a plugin, for plugin
`acme-tools` and skill `review`.

## Observations

- 2026-10-01: runtime name: acme-tools:review; namespace from: nearest manifest `name`. The model is
  told "Skills from this plugin are prefixed with `{skill_namespace}:`"
  (core/src/plugins/render.rs:44).[^codex-repo][^skill-naming]

[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

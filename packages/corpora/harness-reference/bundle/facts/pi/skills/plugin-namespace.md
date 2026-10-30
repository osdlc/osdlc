---
type: Harness Fact
title: "pi: Plugin skill runtime name"
description: "Plugin skill runtime name in pi, as observed over time."
tags: [skills]
harness: pi
subject: skills/plugin-namespace
observations:
  - value: { runtime_name: review, namespace: "none; the package name is never prepended" }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/src/core/skills.ts:432 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    evidence: source
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Plugin skill runtime name](/subjects/skills/plugin-namespace.md) in
[pi](/harnesses/pi.md). The name a skill gets when it ships in a plugin, for plugin `acme-tools` and
skill `review`.

## Observations

- 2026-10-01: runtime name: review; namespace: none; the package name is never
  prepended.[^pi-repo][^skill-naming]

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

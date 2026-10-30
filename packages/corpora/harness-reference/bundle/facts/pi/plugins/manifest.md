---
type: Harness Fact
title: "pi: Plugin manifest"
description: "Plugin manifest in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/manifest
observations:
  - value: { file: package.json (optional), key: "pi.skills, globs accepted", fallback: a skills/ directory makes the folder a package, required_fields: none }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/src/core/pi-manifest.ts, package-manager.ts:2235-2282 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    evidence: source
sources:
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Plugin manifest](/subjects/plugins/manifest.md) in
[pi](/harnesses/pi.md). The manifest file that makes a directory a plugin or package.

## Observations

- 2026-10-01: file: package.json (optional); key: pi.skills, globs accepted; fallback: a skills/
  directory makes the folder a package; required fields: none.[^pi-repo][^skill-naming]

[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

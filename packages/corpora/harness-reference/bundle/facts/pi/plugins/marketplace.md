---
type: Harness Fact
title: "pi: Marketplace"
description: "Marketplace in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/marketplace
observations:
  - value: { supported: false }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
    note: pi has a package mechanism instead.
  - value: { supported: false, git_subpath: false, note: "a git package's root is the repository root" }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: packages/coding-agent/docs/packages.md at 88ff80b986e34d4fbd1fa94a4df65c60ae964516
    evidence: source
sources:
  - id: harness-comparison
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/harness-comparison.md"
    title: "Harness comparison (researched 2026-08-08)"
  - id: pi-repo
    resource: "https://github.com/earendil-works/pi"
    title: earendil-works/pi source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Marketplace](/subjects/plugins/marketplace.md) in
[pi](/harnesses/pi.md). Whether plugins are distributed through a marketplace, and its format.

## Observations

- 2026-08-08: supported: `false`. pi has a package mechanism instead.[^harness-comparison]
- 2026-10-01: supported: `false`; git subpath: `false`; note: a git package's root is the repository
  root.[^pi-repo][^skill-naming]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

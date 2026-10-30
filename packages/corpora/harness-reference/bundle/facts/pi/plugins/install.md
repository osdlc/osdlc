---
type: Harness Fact
title: "pi: Plugin install"
description: "Plugin install in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/install
observations:
  - value: { commands: [pi install], sources: npm or git packages }
    since: null
    until: null
    observed: "2026-08-08"
    source: harness-comparison
  - value: { commands: [pi install ./dir, "pi install git:github.com/o/r@ref", "pi install npm:@scope/pkg"], recorded_in: "packages in ~/.pi/agent/settings.json, or .pi/settings.json with -l" }
    since: null
    until: null
    observed: "2026-10-01"
    source: pi-repo
    via: skill-naming
    locator: "packages/coding-agent/docs/packages.md:12-14 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516"
    checked_version: "0.99.1"
    evidence: run
    note: "A local install was run and appeared in `pi list`; skill loading was not run."
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

What the sources say about [Plugin install](/subjects/plugins/install.md) in [pi](/harnesses/pi.md).
How a plugin or package is installed.

## Observations

- 2026-08-08: commands: `pi install`; sources: npm or git packages.[^harness-comparison]
- 2026-10-01: commands: `pi install ./dir`, `pi install git:github.com/o/r@ref`,
  `pi install npm:@scope/pkg`; recorded in: packages in ~/.pi/agent/settings.json, or
  .pi/settings.json with -l. A local install was run and appeared in `pi list`; skill loading was
  not run.[^pi-repo][^skill-naming]

[^harness-comparison]: Harness comparison (researched 2026-08-08)
[^pi-repo]: earendil-works/pi source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

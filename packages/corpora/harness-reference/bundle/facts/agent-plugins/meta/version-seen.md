---
type: Harness Fact
title: "Agent Plugins: Version seen"
description: "Version seen in Agent Plugins, as observed over time."
tags: [meta]
harness: agent-plugins
subject: meta/version-seen
observations:
  - value: { version: "1.0.0", context: published 2026-08-06 }
    since: "1.0.0"
    until: null
    observed: "2026-10-01"
    source: agent-plugins-site
    via: skill-naming
    evidence: docs
    note: "Only page summaries were read, not the spec text."
sources:
  - id: agent-plugins-site
    resource: "https://agent-plugins.org/"
    title: Agent Plugins
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
---

What the sources say about [Version seen](/subjects/meta/version-seen.md) in
[Agent Plugins](/harnesses/agent-plugins.md). A harness version a source names, with the date and
context (latest release, or the build installed when checked).

## Observations

- 2026-10-01 (from 1.0.0): version: 1.0.0; context: published 2026-08-06. Only page summaries were
  read, not the spec text.[^agent-plugins-site][^skill-naming]

[^agent-plugins-site]: Agent Plugins
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)

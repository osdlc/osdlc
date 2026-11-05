---
type: Harness Fact
title: "Agent Plugins: Old plugin versions"
description: "Old plugin versions in Agent Plugins, as observed over time."
tags: [plugins]
harness: agent-plugins
subject: plugins/upgrade-retention
observations:
  - value: {"version_use": "clients may use version for update checks and cache staleness", "plugin_data": "must be preserved across updates"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agent-plugins-specification
    locator: "10.2"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does the spec say whether old plugin versions stay on disk after an upgrade? Update mechanics are client-owned and not described."
    observed: "2026-11-04"
    source: agent-plugins-specification
sources:
  - id: agent-plugins-specification
    resource: "https://agent-plugins.org/specification"
    title: "Agent Plugins specification"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Agent Plugins](/harnesses/agent-plugins.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Observations

- 2026-11-04: version use: clients may use version for update checks and cache staleness; plugin data: must be preserved across updates. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^agent-plugins-specification]

  > Clients MAY use version to determine whether updates are available and whether caches are stale.

## Open questions

- Does the spec say whether old plugin versions stay on disk after an upgrade? Update mechanics are client-owned and not described.[^agent-plugins-specification]

[^agent-plugins-specification]: Agent Plugins specification

---
type: Harness Fact
title: "Cursor: Old plugin versions"
description: "Old plugin versions in Cursor, as observed over time."
tags: [plugins]
harness: cursor
subject: plugins/upgrade-retention
observations:
  - value: {"running_cloud_agent": "keeps the versions it started with", "new_agent": "picks up the update"}
    since: null
    until: null
    observed: "2026-11-04"
    source: cursor-plugins
    locator: "Updating marketplace plugins"
    evidence: docs
    note: "Concerns Cloud Agents, not local disk."
open:
  - question: "After a local or IDE plugin upgrade, do old plugin versions stay on disk?"
    observed: "2026-11-04"
    source: cursor-plugins
sources:
  - id: cursor-plugins
    resource: "https://cursor.com/docs/plugins"
    title: "Cursor docs: Plugins"
---

What the sources say about [Old plugin versions](/subjects/plugins/upgrade-retention.md) in [Cursor](/harnesses/cursor.md).
Whether earlier plugin versions stay on disk after an upgrade.

## Observations

- 2026-11-04: running cloud agent: keeps the versions it started with; new agent: picks up the update. Concerns Cloud Agents, not local disk.[^cursor-plugins]

  > A running Cloud Agent, including each agent in a [Project](https://cursor.com/docs/agent/projects.md), keeps the plugin versions it started with. Start a new agent to pick up an update.

## Open questions

- After a local or IDE plugin upgrade, do old plugin versions stay on disk?[^cursor-plugins]

[^cursor-plugins]: Cursor docs: Plugins

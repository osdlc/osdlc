---
type: Harness Fact
title: "Agent Plugins: Plugin install copy"
description: "Plugin install copy in Agent Plugins, as observed over time."
tags: [plugins]
harness: agent-plugins
subject: plugins/install-copy
observations:
  - value: {"symlinks": "may resolve to targets inside the plugin root; package paths resolving outside must be rejected"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agent-plugins-specification
    locator: "4.1"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does the spec say whether a client copies the plugin folder on install, and whether exec bits survive? The fetched text says neither."
    observed: "2026-11-04"
    source: agent-plugins-specification
sources:
  - id: agent-plugins-specification
    resource: "https://agent-plugins.org/specification"
    title: "Agent Plugins specification"
---

What the sources say about [Plugin install copy](/subjects/plugins/install-copy.md) in [Agent Plugins](/harnesses/agent-plugins.md).
Whether install copies the plugin folder whole, and whether exec bits and symlinks survive.

## Observations

- 2026-11-04: symlinks: may resolve to targets inside the plugin root; package paths resolving outside must be rejected. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^agent-plugins-specification]

  > Symlinks, junctions, reparse points, and equivalent filesystem mechanisms MAY resolve to targets within the plugin root, but clients MUST reject package paths that resolve outside it.

## Open questions

- Does the spec say whether a client copies the plugin folder on install, and whether exec bits survive? The fetched text says neither.[^agent-plugins-specification]

[^agent-plugins-specification]: Agent Plugins specification

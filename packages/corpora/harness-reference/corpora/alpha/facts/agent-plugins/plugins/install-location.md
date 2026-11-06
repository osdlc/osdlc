---
type: Harness Fact
title: "Agent Plugins: Plugin install location"
description: "Plugin install location in Agent Plugins, as observed over time."
tags: [plugins]
harness: agent-plugins
subject: plugins/install-location
observations:
  - value: {"prescribed": false, "detail": "portable contract does not prescribe installation sources, registries or marketplaces"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agent-plugins-client-guide
    locator: "Scope"
    evidence: docs
    note: "Quote is a fragment of the page's scope statement. Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"layout": "directory with a required plugin.json manifest and optional components in fixed locations"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agent-plugins-overview
    locator: "Overview"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
sources:
  - id: agent-plugins-client-guide
    resource: "https://agent-plugins.org/client-implementers/implement-an-agent-plugins-client"
    title: "Agent Plugins: implement a client"
  - id: agent-plugins-overview
    resource: "https://agent-plugins.org/"
    title: "Agent Plugins overview"
---

What the sources say about [Plugin install location](/subjects/plugins/install-location.md) in [Agent Plugins](/harnesses/agent-plugins.md).
Where an installed plugin's files go, and whether a local plugin is copied or used in place.

## Observations

- 2026-11-04: prescribed: no; detail: portable contract does not prescribe installation sources, registries or marketplaces. Quote is a fragment of the page's scope statement. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^agent-plugins-client-guide]

  > installation sources, registries, or marketplaces
- 2026-11-04: layout: directory with a required plugin.json manifest and optional components in fixed locations. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^agent-plugins-overview]

  > An Agent Plugin is a directory with a required manifest and optional components in fixed locations.

[^agent-plugins-client-guide]: Agent Plugins: implement a client
[^agent-plugins-overview]: Agent Plugins overview

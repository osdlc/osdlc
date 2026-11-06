---
type: Harness Fact
title: "Agent Plugins: Marketplace fields"
description: "Marketplace fields in Agent Plugins, as observed over time."
tags: [plugins]
harness: agent-plugins
subject: plugins/marketplace-fields
observations:
  - value:
      applicable: false
    since: null
    until: null
    observed: "2026-11-05"
    source: agent-plugins-client-guide
    locator: "Portable versus client-owned behavior"
    evidence: docs
    note: "The standard does not prescribe installation sources, registries or marketplaces; they are left to each client."
sources:
  - id: agent-plugins-client-guide
    resource: "https://agent-plugins.org/client-implementers/implement-an-agent-plugins-client.md"
    title: "Agent Plugins: Implement an Agent Plugins client"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Agent Plugins](/harnesses/agent-plugins.md).

## Observations

- 2026-11-05: applicable: `false`. The standard defines no marketplace catalog.[^agent-plugins-client-guide]

  > Agent Plugins defines package structure, validation, discovery, MCP configuration, plugin variables, and failure isolation. It does not prescribe:
  >
  > * installation sources, registries, or marketplaces

[^agent-plugins-client-guide]: Agent Plugins: Implement an Agent Plugins client

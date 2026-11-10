---
kind: source
reportedIn:
  - "[Agent Plugins Specification 1.0.0](../../documents/github.com/Agent%20Plugins%20Specification%201.0.0.md)"
harness: "[Agent Plugins](../../harnesses/Agent%20Plugins.md)"
version: 1.0.0
version_basis: exact
observed: 2026-11-09
locator: 4.1 Containment
excerpt:
  exact: Symlinks, junctions, reparse points, and equivalent filesystem mechanisms MAY resolve to targets within the plugin root, but clients MUST reject package paths that resolve outside it.
  prefix: "ilesystem-resolved plugin root. "
  suffix: " 4. A configuration field define"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T00:00:00Z
---

> Symlinks, junctions, reparse points, and equivalent filesystem mechanisms MAY resolve to targets within the plugin root, but clients MUST reject package paths that resolve outside it.

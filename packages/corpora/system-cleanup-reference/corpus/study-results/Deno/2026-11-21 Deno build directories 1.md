---
kind: docs
store: '[Deno](../../stores/Deno.md)'
observed: '2026-11-21'
locator: node_modules and the cache
reportedIn:
- '[Deno Packages](../../documents/Deno/Deno%20Packages.md)'
excerpt:
  exact: By default Deno stores dependencies in a global cache and creates a local `node_modules` directory
    only when your project has a `package.json`.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Deno Packages (https://raw.githubusercontent.com/denoland/docs/main/runtime/packages/index.md) says, under node_modules and the cache:

> By default Deno stores dependencies in a global cache and creates a local `node_modules` directory only when your project has a `package.json`.

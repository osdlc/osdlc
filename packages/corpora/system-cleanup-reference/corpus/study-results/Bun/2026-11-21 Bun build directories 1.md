---
kind: docs
store: '[Bun](../../stores/Bun.md)'
observed: '2026-11-21'
locator: Saving disk space
reportedIn:
- '[Bun Global cache](../../documents/Bun/Bun%20Global%20cache.md)'
excerpt:
  exact: On Linux and Windows, Bun uses hardlinks to "copy" a module into a project's `node_modules` directory,
    so the contents of the package only exist in a single location on disk.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Bun Global cache (https://raw.githubusercontent.com/oven-sh/bun/main/docs/pm/global-cache.mdx) says, under Saving disk space:

> On Linux and Windows, Bun uses hardlinks to "copy" a module into a project's `node_modules` directory, so the contents of the package only exist in a single location on disk.

---
kind: source
store: '[npm](../../stores/npm.md)'
observed: '2026-11-21'
locator: cache / logs-dir definitions
reportedIn:
- '[workspaces config lib definitions definitions.js](../../documents/npm/workspaces%20config%20lib%20definitions%20definitions.js.md)'
excerpt:
  exact: flatOptions.npxCache = join(obj.cache, '_npx')
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

workspaces config lib definitions definitions.js (https://raw.githubusercontent.com/npm/cli/latest/workspaces/config/lib/definitions/definitions.js) says, under cache / logs-dir definitions:

> flatOptions.npxCache = join(obj.cache, '_npx')

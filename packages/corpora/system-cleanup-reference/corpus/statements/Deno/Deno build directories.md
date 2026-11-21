---
proposition:
  subject: '[Deno](../../stores/Deno.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: node_modules
      marker: deno.json
      holds: packages
      rebuild: re-download
    - path: vendor
      marker: deno.json
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Deno build directories 1](../../study-results/Deno/2026-11-21%20Deno%20build%20directories%201.md)'
  - '[2026-11-21 Deno build directories 2](../../study-results/Deno/2026-11-21%20Deno%20build%20directories%202.md)'
  - '[2026-11-21 Deno build directories 3](../../study-results/Deno/2026-11-21%20Deno%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: 'node_modules appears with a package.json or nodeModulesDir; vendor appears with "vendor":
    true in deno.json; both are refilled from the cache or network. With nodeModulesDir manual, node_modules
    is rebuilt by running deno install.'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Deno](../../stores/Deno.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- A vendor directory the user has patched by hand would lose those edits; the docs mention patching vendored
  modules.
---

node_modules appears with a package.json or nodeModulesDir; vendor appears with "vendor": true in deno.json; both are refilled from the cache or network. With nodeModulesDir manual, node_modules is rebuilt by running deno install.

---
proposition:
  subject: '[pnpm](../../stores/pnpm.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: node_modules
      marker: package.json
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pnpm build directories 1](../../study-results/pnpm/2026-11-21%20pnpm%20build%20directories%201.md)'
  - '[2026-11-21 pnpm build directories 2](../../study-results/pnpm/2026-11-21%20pnpm%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: modulesDir defaults to node_modules and the virtual store (node_modules/.pnpm) sits inside
    it, so deleting node_modules covers both; the marker is the standard package.json.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pnpm](../../stores/pnpm.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The package.json marker is not quoted from a pnpm page.
---

modulesDir defaults to node_modules and the virtual store (node_modules/.pnpm) sits inside it, so deleting node_modules covers both; the marker is the standard package.json.

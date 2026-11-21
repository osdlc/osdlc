---
proposition:
  subject: '[Yarn](../../stores/Yarn.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: .yarn/cache
      marker: package.json
      holds: packages
      rebuild: re-download
    - path: .yarn/unplugged
      marker: package.json
      holds: packages
      rebuild: rebuild
    - path: .pnp.cjs
      marker: package.json
      holds: build-output
      rebuild: rebuild
    - path: .yarn/install-state.gz
      marker: package.json
      holds: cache
      rebuild: rebuild
    - path: node_modules
      marker: package.json
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Yarn build directories 1](../../study-results/Yarn/2026-11-21%20Yarn%20build%20directories%201.md)'
  - '[2026-11-21 Yarn build directories 2](../../study-results/Yarn/2026-11-21%20Yarn%20build%20directories%202.md)'
  - '[2026-11-21 Yarn build directories 3](../../study-results/Yarn/2026-11-21%20Yarn%20build%20directories%203.md)'
  - '[2026-11-21 Yarn build directories 4](../../study-results/Yarn/2026-11-21%20Yarn%20build%20directories%204.md)'
  - '[2026-11-21 Yarn build directories 5](../../study-results/Yarn/2026-11-21%20Yarn%20build%20directories%205.md)'
  - '[2026-11-21 Yarn build directories 6](../../study-results/Yarn/2026-11-21%20Yarn%20build%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: .yarn/cache is used only when enableGlobalCache is false (or for Zero-Installs, where it
    is committed and must not be deleted); .pnp.cjs and install-state.gz are files, not directories; node_modules
    exists with nodeLinker node-modules (and in Yarn Classic).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Yarn](../../stores/Yarn.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The yarnrc quotes give default paths only in code (./.yarn/cache, ./.yarn/unplugged, ./.yarn/install-state.gz).
---

.yarn/cache is used only when enableGlobalCache is false (or for Zero-Installs, where it is committed and must not be deleted); .pnp.cjs and install-state.gz are files, not directories; node_modules exists with nodeLinker node-modules (and in Yarn Classic).

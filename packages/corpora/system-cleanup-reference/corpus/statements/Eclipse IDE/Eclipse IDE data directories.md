---
proposition:
  subject: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.p2/pool
      holds: packages
      rebuild: re-download
    - platform: all
      path: <workspace>/.metadata
      holds: state
      rebuild: lost
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Eclipse IDE data directories 1](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20data%20directories%201.md)'
  - '[2026-11-21 Eclipse IDE data directories 2](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20data%20directories%202.md)'
  - '[2026-11-21 Eclipse IDE data directories 3](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20data%20directories%203.md)'
  - '[2026-11-21 Eclipse IDE data directories 4](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Oomph's source sets the shared agent at ~/.p2 with a pool subfolder, and its help says
    the pool gathers garbage; the platform guide calls the workspace .metadata directory a black box of
    platform internal information.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Installs made without Oomph keep p2 data inside the installation directory; no source quoted here gives
  that path.
- The default workspace location is not settled by these sources.
---

Oomph's source sets the shared agent at ~/.p2 with a pool subfolder, and its help says the pool gathers garbage; the platform guide calls the workspace .metadata directory a black box of platform internal information.

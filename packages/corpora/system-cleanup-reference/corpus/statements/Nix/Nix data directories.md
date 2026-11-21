---
proposition:
  subject: '[Nix](../../stores/Nix.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: /nix/store
      holds: packages
      rebuild: re-download
    - platform: linux
      path: $XDG_CACHE_HOME/nix
      holds: cache
      rebuild: re-download
    - platform: macos
      path: $XDG_CACHE_HOME/nix
      holds: cache
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Nix data directories 1](../../study-results/Nix/2026-11-21%20Nix%20data%20directories%201.md)'
  - '[2026-11-21 Nix data directories 2](../../study-results/Nix/2026-11-21%20Nix%20data%20directories%202.md)'
  - '[2026-11-21 Nix data directories 3](../../study-results/Nix/2026-11-21%20Nix%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The store is /nix/store on Unix; the per-user cache is $XDG_CACHE_HOME/nix. Store paths
    still reachable from a profile generation are live and must not be deleted by hand.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Nix](../../stores/Nix.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Store paths kept alive by old generations cost a re-download or rebuild only if those generations are
  deleted first; the manual's rollback warning covers that.
---

The store is /nix/store on Unix; the per-user cache is $XDG_CACHE_HOME/nix. Store paths still reachable from a profile generation are live and must not be deleted by hand.

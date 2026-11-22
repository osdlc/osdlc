---
proposition:
  subject: '[Cargo](../../stores/Cargo.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.cargo/registry/cache
      holds: packages
      rebuild: re-download
    - platform: all
      path: ~/.cargo/registry/src
      holds: packages
      rebuild: rebuild
    - platform: all
      path: ~/.cargo/registry/index
      holds: cache
      rebuild: re-download
    - platform: all
      path: ~/.cargo/git/db
      holds: packages
      rebuild: re-download
    - platform: all
      path: ~/.cargo/git/checkouts
      holds: packages
      rebuild: rebuild
    - platform: windows
      path: '%USERPROFILE%\.cargo'
      holds: cache
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cargo data directories 1](../../study-results/Cargo/2026-11-21%20Cargo%20data%20directories%201.md)'
  - '[2026-11-21 Cargo data directories 2](../../study-results/Cargo/2026-11-21%20Cargo%20data%20directories%202.md)'
  - '[2026-11-21 Cargo data directories 3](../../study-results/Cargo/2026-11-21%20Cargo%20data%20directories%203.md)'
  - '[2026-11-21 Cargo data directories 4](../../study-results/Cargo/2026-11-21%20Cargo%20data%20directories%204.md)'
  - '[2026-11-21 Cargo data directories 5](../../study-results/Cargo/2026-11-21%20Cargo%20data%20directories%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Cargo Book places registry/cache, registry/src, registry/index, git/db and git/checkouts
    under the Cargo home ($HOME/.cargo by default, %USERPROFILE%\.cargo on Windows) and says any part
    can be removed and restored by re-extracting, re-checking-out or re-downloading.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cargo](../../stores/Cargo.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The Windows subdirectory layout is assumed to mirror the Unix one; the sources only give the Windows
  root.
- ~/.cargo/bin holds installed binaries and is not a cache, so it is left out.
---

The Cargo Book places registry/cache, registry/src, registry/index, git/db and git/checkouts under the Cargo home ($HOME/.cargo by default, %USERPROFILE%\.cargo on Windows) and says any part can be removed and restored by re-extracting, re-checking-out or re-downloading.

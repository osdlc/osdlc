---
proposition:
  subject: '[rustup](../../stores/rustup.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.rustup/toolchains
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.rustup/downloads
      holds: downloads
      rebuild: re-download
    - platform: windows
      path: '%USERPROFILE%/.rustup'
      holds: toolchains
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 rustup data directories 1](../../study-results/rustup/2026-11-21%20rustup%20data%20directories%201.md)'
  - '[2026-11-21 rustup data directories 2](../../study-results/rustup/2026-11-21%20rustup%20data%20directories%202.md)'
  - '[2026-11-21 rustup data directories 3](../../study-results/rustup/2026-11-21%20rustup%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The environment-variables page gives the RUSTUP_HOME default on Unix and Windows; config.rs
    names its toolchains and downloads subdirectories.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[rustup](../../stores/rustup.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Cargo's own caches under ~/.cargo (CARGO_HOME) are a separate store and not covered here.
---

The environment-variables page gives the RUSTUP_HOME default on Unix and Windows; config.rs names its toolchains and downloads subdirectories.

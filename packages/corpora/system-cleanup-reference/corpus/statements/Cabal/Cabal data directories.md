---
proposition:
  subject: '[Cabal](../../stores/Cabal.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/cabal
      holds: cache
      rebuild: re-download
    - platform: macos
      path: ~/.cache/cabal
      holds: cache
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%/cabal'
      holds: cache
      rebuild: re-download
    - platform: linux
      path: ~/.local/state/cabal
      holds: build-output
      rebuild: rebuild
    - platform: macos
      path: ~/.local/state/cabal
      holds: build-output
      rebuild: rebuild
    - platform: all
      path: ~/.cabal/packages
      holds: cache
      rebuild: re-download
    - platform: all
      path: ~/.cabal/store
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cabal data directories 1](../../study-results/Cabal/2026-11-21%20Cabal%20data%20directories%201.md)'
  - '[2026-11-21 Cabal data directories 2](../../study-results/Cabal/2026-11-21%20Cabal%20data%20directories%202.md)'
  - '[2026-11-21 Cabal data directories 3](../../study-results/Cabal/2026-11-21%20Cabal%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The configuration docs give the XDG cache and state directories with their Unix and Windows
    defaults and say the cache can be deleted; the cabal path example shows the legacy ~/.cabal layout
    used when ~/.cabal exists.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cabal](../../stores/Cabal.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- On Windows the docs give %LOCALAPPDATA%/cabal for both cache and state, so the store's Windows subpath
  is not settled.
- Deleting the store (state directory) can break executables installed with cabal install, which link
  against it.
---

The configuration docs give the XDG cache and state directories with their Unix and Windows defaults and say the cache can be deleted; the cabal path example shows the legacy ~/.cabal layout used when ~/.cabal exists.

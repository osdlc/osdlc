---
proposition:
  subject: '[Go](../../stores/Go.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/go-build
      holds: build-output
      rebuild: rebuild
    - platform: macos
      path: ~/Library/Caches/go-build
      holds: build-output
      rebuild: rebuild
    - platform: windows
      path: '%LocalAppData%\go-build'
      holds: build-output
      rebuild: rebuild
    - platform: linux
      path: ~/go/pkg/mod
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/go/pkg/mod
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%USERPROFILE%\go\pkg\mod'
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Go data directories 1](../../study-results/Go/2026-11-21%20Go%20data%20directories%201.md)'
  - '[2026-11-21 Go data directories 2](../../study-results/Go/2026-11-21%20Go%20data%20directories%202.md)'
  - '[2026-11-21 Go data directories 3](../../study-results/Go/2026-11-21%20Go%20data%20directories%203.md)'
  - '[2026-11-21 Go data directories 4](../../study-results/Go/2026-11-21%20Go%20data%20directories%204.md)'
  - '[2026-11-21 Go data directories 5](../../study-results/Go/2026-11-21%20Go%20data%20directories%205.md)'
  - '[2026-11-21 Go data directories 6](../../study-results/Go/2026-11-21%20Go%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The build cache path combines cmd/go's 'go-build in the standard user cache directory'
    with os.UserCacheDir's per-OS roots; the module cache is $GOPATH/pkg/mod with GOPATH defaulting to
    ~/go.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Go](../../stores/Go.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- On Linux the build cache follows $XDG_CACHE_HOME/go-build when XDG_CACHE_HOME is set.
---

The build cache path combines cmd/go's 'go-build in the standard user cache directory' with os.UserCacheDir's per-OS roots; the module cache is $GOPATH/pkg/mod with GOPATH defaulting to ~/go.

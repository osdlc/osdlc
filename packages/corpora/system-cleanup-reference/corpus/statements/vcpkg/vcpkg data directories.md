---
proposition:
  subject: '[vcpkg](../../stores/vcpkg.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/vcpkg/archives
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/.cache/vcpkg/archives
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%LOCALAPPDATA%\vcpkg\archives'
      holds: cache
      rebuild: rebuild
    - platform: all
      path: $VCPKG_ROOT/downloads
      holds: downloads
      rebuild: re-download
    - platform: all
      path: $VCPKG_ROOT/buildtrees
      holds: build-output
      rebuild: rebuild
    - platform: all
      path: $VCPKG_ROOT/packages
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 vcpkg data directories 1](../../study-results/vcpkg/2026-11-21%20vcpkg%20data%20directories%201.md)'
  - '[2026-11-21 vcpkg data directories 2](../../study-results/vcpkg/2026-11-21%20vcpkg%20data%20directories%202.md)'
  - '[2026-11-21 vcpkg data directories 3](../../study-results/vcpkg/2026-11-21%20vcpkg%20data%20directories%203.md)'
  - '[2026-11-21 vcpkg data directories 4](../../study-results/vcpkg/2026-11-21%20vcpkg%20data%20directories%204.md)'
  - '[2026-11-21 vcpkg data directories 5](../../study-results/vcpkg/2026-11-21%20vcpkg%20data%20directories%205.md)'
  - '[2026-11-21 vcpkg data directories 6](../../study-results/vcpkg/2026-11-21%20vcpkg%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The binary caching page lists the default archive locations per OS; the common-options
    page puts downloads, buildtrees and packages under the vcpkg root folder.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[vcpkg](../../stores/vcpkg.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The macOS archive path follows from the docs' Non-Windows list, which macOS falls under; the page does
  not name macOS explicitly. $XDG_CACHE_HOME/vcpkg/archives comes before ~/.cache when set.
---

The binary caching page lists the default archive locations per OS; the common-options page puts downloads, buildtrees and packages under the vcpkg root folder.

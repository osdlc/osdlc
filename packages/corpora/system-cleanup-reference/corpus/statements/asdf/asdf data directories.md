---
proposition:
  subject: '[asdf](../../stores/asdf.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.asdf/installs
      holds: toolchains
      rebuild: re-download
    - platform: all
      path: ~/.asdf/downloads
      holds: downloads
      rebuild: re-download
    - platform: all
      path: ~/.asdf/plugins
      holds: packages
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 asdf data directories 1](../../study-results/asdf/2026-11-21%20asdf%20data%20directories%201.md)'
  - '[2026-11-21 asdf data directories 2](../../study-results/asdf/2026-11-21%20asdf%20data%20directories%202.md)'
  - '[2026-11-21 asdf data directories 3](../../study-results/asdf/2026-11-21%20asdf%20data%20directories%203.md)'
  - '[2026-11-21 asdf data directories 4](../../study-results/asdf/2026-11-21%20asdf%20data%20directories%204.md)'
  - '[2026-11-21 asdf data directories 5](../../study-results/asdf/2026-11-21%20asdf%20data%20directories%205.md)'
  - '[2026-11-21 asdf data directories 6](../../study-results/asdf/2026-11-21%20asdf%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The configuration docs give ~/.asdf as the data dir default; the data package source names
    its installs, downloads and plugins subdirectories.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[asdf](../../stores/asdf.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- downloads/ is normally emptied after a successful install unless always_keep_download = yes; asdf does
  not support Windows natively and no Windows path is given.
---

The configuration docs give ~/.asdf as the data dir default; the data package source names its installs, downloads and plugins subdirectories.

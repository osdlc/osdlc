---
proposition:
  subject: '[Hex](../../stores/Hex.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.hex
      holds: cache
      rebuild: re-download
    - platform: all
      path: ~/.hex/packages
      holds: cache
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Hex data directories 1](../../study-results/Hex/2026-11-21%20Hex%20data%20directories%201.md)'
  - '[2026-11-21 Hex data directories 2](../../study-results/Hex/2026-11-21%20Hex%20data%20directories%202.md)'
  - '[2026-11-21 Hex data directories 3](../../study-results/Hex/2026-11-21%20Hex%20data%20directories%203.md)'
  - '[2026-11-21 Hex data directories 4](../../study-results/Hex/2026-11-21%20Hex%20data%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The hex.config docs give ~/.hex as the cache and config home, and Hex.SCM stores tarballs
    under the cache home in a packages/<repo> subdirectory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Hex](../../stores/Hex.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- ~/.hex also holds hex.config settings such as auth keys, so delete only ~/.hex/packages, not the whole
  directory.
- With MIX_XDG set the cache moves to the Linux-style XDG user cache directory (~/.cache/hex by Erlang's
  filename:basedir); no doc page states the path literally.
---

The hex.config docs give ~/.hex as the cache and config home, and Hex.SCM stores tarballs under the cache home in a packages/<repo> subdirectory.

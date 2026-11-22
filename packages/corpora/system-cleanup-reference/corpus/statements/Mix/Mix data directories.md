---
proposition:
  subject: '[Mix](../../stores/Mix.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: ~/.mix
      holds: state
      rebuild: re-download
    - platform: all
      path: ~/.mix/archives
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Mix data directories 1](../../study-results/Mix/2026-11-21%20Mix%20data%20directories%201.md)'
  - '[2026-11-21 Mix data directories 2](../../study-results/Mix/2026-11-21%20Mix%20data%20directories%202.md)'
  - '[2026-11-21 Mix data directories 3](../../study-results/Mix/2026-11-21%20Mix%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Mix module docs give ~/.mix as the home and ~/.mix/archives as the archive directory;
    the Mix.install cache has its own directory whose default the docs read do not state.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Mix](../../stores/Mix.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The default location of the Mix.install cache (MIX_INSTALL_DIR) is not stated in the docs read.
- The XDG locations used when MIX_XDG is set are not spelled out in the docs read.
---

The Mix module docs give ~/.mix as the home and ~/.mix/archives as the archive directory; the Mix.install cache has its own directory whose default the docs read do not state.

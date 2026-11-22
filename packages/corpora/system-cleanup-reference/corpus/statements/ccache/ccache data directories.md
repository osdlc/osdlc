---
proposition:
  subject: '[ccache](../../stores/ccache.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/ccache
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/Library/Caches/ccache
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%LOCALAPPDATA%\ccache'
      holds: cache
      rebuild: rebuild
    - platform: all
      path: ~/.ccache
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 ccache data directories 1](../../study-results/ccache/2026-11-21%20ccache%20data%20directories%201.md)'
  - '[2026-11-21 ccache data directories 2](../../study-results/ccache/2026-11-21%20ccache%20data%20directories%202.md)'
  - '[2026-11-21 ccache data directories 3](../../study-results/ccache/2026-11-21%20ccache%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: 'The manual''s cache_dir entry gives the defaults: a legacy ~/.ccache (or %USERPROFILE%\.ccache)
    if it exists, else $XDG_CACHE_HOME/ccache, else the per-platform cache path.'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[ccache](../../stores/ccache.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- On Windows the legacy directory is %USERPROFILE%\.ccache, which the ~/.ccache entry stands for; older
  versions also used %APPDATA%\ccache.
---

The manual's cache_dir entry gives the defaults: a legacy ~/.ccache (or %USERPROFILE%\.ccache) if it exists, else $XDG_CACHE_HOME/ccache, else the per-platform cache path.

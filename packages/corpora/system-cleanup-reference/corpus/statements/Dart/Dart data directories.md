---
proposition:
  subject: '[Dart](../../stores/Dart.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/.pub-cache
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/.pub-cache
      holds: packages
      rebuild: re-download
    - platform: windows
      path: '%LOCALAPPDATA%\Pub\Cache'
      holds: packages
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Dart data directories 1](../../study-results/Dart/2026-11-21%20Dart%20data%20directories%201.md)'
  - '[2026-11-21 Dart data directories 2](../../study-results/Dart/2026-11-21%20Dart%20data%20directories%202.md)'
  - '[2026-11-21 Dart data directories 3](../../study-results/Dart/2026-11-21%20Dart%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The pub environment-variables page and pub's source agree on $HOME/.pub-cache and %LOCALAPPDATA%\Pub\Cache
    (pub's cache_layout.md writes .pub_cache, which the source contradicts).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Dart](../../stores/Dart.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The pub environment-variables page and pub's source agree on $HOME/.pub-cache and %LOCALAPPDATA%\Pub\Cache (pub's cache_layout.md writes .pub_cache, which the source contradicts).

---
proposition:
  subject: '[Flutter](../../stores/Flutter.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: $FLUTTER_ROOT/bin/cache
      holds: toolchains
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flutter data directories 1](../../study-results/Flutter/2026-11-21%20Flutter%20data%20directories%201.md)'
  - '[2026-11-21 Flutter data directories 2](../../study-results/Flutter/2026-11-21%20Flutter%20data%20directories%202.md)'
  - '[2026-11-21 Flutter data directories 3](../../study-results/Flutter/2026-11-21%20Flutter%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The flutter tool's cache source puts its artifact cache at bin/cache under FLUTTER_ROOT,
    and flutter precache repopulates it; packages go to the Dart pub cache (see the Dart store).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flutter](../../stores/Flutter.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Older Flutter SDKs (before 3.8.0) kept packages in $FLUTTER_ROOT/.pub_cache; no source says whether
  upgrading removes that directory.
---

The flutter tool's cache source puts its artifact cache at bin/cache under FLUTTER_ROOT, and flutter precache repopulates it; packages go to the Dart pub cache (see the Dart store).

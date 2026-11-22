---
proposition:
  subject: '[Flutter](../../stores/Flutter.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: build
      marker: pubspec.yaml
      holds: build-output
      rebuild: rebuild
    - path: .dart_tool
      marker: pubspec.yaml
      holds: cache
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flutter build directories 1](../../study-results/Flutter/2026-11-21%20Flutter%20build%20directories%201.md)'
  - '[2026-11-21 Flutter build directories 2](../../study-results/Flutter/2026-11-21%20Flutter%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: flutter clean deletes exactly these two directories; Flutter projects are Dart packages
    marked by pubspec.yaml.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flutter](../../stores/Flutter.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- flutter clean also removes per-platform ephemeral directories (such as ios/Flutter/ephemeral); no doc
  page gives their exact paths.
---

flutter clean deletes exactly these two directories; Flutter projects are Dart packages marked by pubspec.yaml.

---
proposition:
  subject: '[Dart](../../stores/Dart.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: .dart_tool
      marker: pubspec.yaml
      holds: cache
      rebuild: rebuild
    - path: build
      marker: pubspec.yaml
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Dart build directories 1](../../study-results/Dart/2026-11-21%20Dart%20build%20directories%201.md)'
  - '[2026-11-21 Dart build directories 2](../../study-results/Dart/2026-11-21%20Dart%20build%20directories%202.md)'
  - '[2026-11-21 Dart build directories 3](../../study-results/Dart/2026-11-21%20Dart%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: dart.dev says .dart_tool may be deleted at any time and lists .dart_tool and build among
    directories pub creates; a package is a directory with pubspec.yaml at its root.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Dart](../../stores/Dart.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

dart.dev says .dart_tool may be deleted at any time and lists .dart_tool and build among directories pub creates; a package is a directory with pubspec.yaml at its root.

---
proposition:
  subject: '[Flutter](../../stores/Flutter.md)'
  predicate: liveness/in-use
  object:
    processes: []
    locks:
    - $FLUTTER_ROOT/bin/cache/lockfile
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flutter in use 1](../../study-results/Flutter/2026-11-21%20Flutter%20in%20use%201.md)'
  - '[2026-11-21 Flutter in use 2](../../study-results/Flutter/2026-11-21%20Flutter%20in%20use%202.md)'
  - '[2026-11-21 Flutter in use 3](../../study-results/Flutter/2026-11-21%20Flutter%20in%20use%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The flutter tool takes a POSIX flock on bin/cache/lockfile under the SDK root while it
    uses the artifact cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flutter](../../stores/Flutter.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The flutter tool takes a POSIX flock on bin/cache/lockfile under the SDK root while it uses the artifact cache.

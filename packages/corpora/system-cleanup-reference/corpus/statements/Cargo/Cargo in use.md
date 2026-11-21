---
proposition:
  subject: '[Cargo](../../stores/Cargo.md)'
  predicate: liveness/in-use
  object:
    processes:
    - cargo
    locks:
    - ~/.cargo/.package-cache
    - ~/.cargo/.package-cache-mutate
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Cargo in use 1](../../study-results/Cargo/2026-11-21%20Cargo%20in%20use%201.md)'
  - '[2026-11-21 Cargo in use 2](../../study-results/Cargo/2026-11-21%20Cargo%20in%20use%202.md)'
  - '[2026-11-21 Cargo in use 3](../../study-results/Cargo/2026-11-21%20Cargo%20in%20use%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Cargo's source names two lock files, opened relative to the Cargo home (gctx.home()), that
    coordinate multiple running cargo processes over the package and index caches.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Cargo](../../stores/Cargo.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The lock files exist even when idle; a cleaner must test whether they are held (advisory file lock),
  not merely whether they exist.
---

Cargo's source names two lock files, opened relative to the Cargo home (gctx.home()), that coordinate multiple running cargo processes over the package and index caches.

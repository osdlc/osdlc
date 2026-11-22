---
proposition:
  subject: '[asdf](../../stores/asdf.md)'
  predicate: liveness/in-use
  object:
    processes:
    - asdf
    locks:
    - ~/.asdf/install-locks
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 asdf in use 1](../../study-results/asdf/2026-11-21%20asdf%20in%20use%201.md)'
  - '[2026-11-21 asdf in use 2](../../study-results/asdf/2026-11-21%20asdf%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The data package source defines an install-locks directory in the data dir for install
    marker and lock files.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[asdf](../../stores/asdf.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Docs do not say how to detect that an installed version is in use by a running program.
---

The data package source defines an install-locks directory in the data dir for install marker and lock files.

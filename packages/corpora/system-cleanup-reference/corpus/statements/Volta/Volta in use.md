---
proposition:
  subject: '[Volta](../../stores/Volta.md)'
  predicate: liveness/in-use
  object:
    processes:
    - volta
    locks:
    - ~/.volta/volta.lock
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Volta in use 1](../../study-results/Volta/2026-11-21%20Volta%20in%20use%201.md)'
  - '[2026-11-21 Volta in use 2](../../study-results/Volta/2026-11-21%20Volta%20in%20use%202.md)'
  - '[2026-11-21 Volta in use 3](../../study-results/Volta/2026-11-21%20Volta%20in%20use%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: sync.rs takes a file lock on volta.lock in the VOLTA_HOME root while a process modifies
    the directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Volta](../../stores/Volta.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source says how to tell that an installed Node.js version is in use by a running program.
---

sync.rs takes a file lock on volta.lock in the VOLTA_HOME root while a process modifies the directory.

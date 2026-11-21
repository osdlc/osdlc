---
proposition:
  subject: '[nvm](../../stores/nvm.md)'
  predicate: liveness/in-use
  object:
    processes: []
    locks:
    - ~/.nvm/.cache/locks
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 nvm in use 1](../../study-results/nvm/2026-11-21%20nvm%20in%20use%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The README says nvm install takes a per-version lock directory under $NVM_DIR/.cache/locks;
    nvm is a shell function, so there is no daemon.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[nvm](../../stores/nvm.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source says how to tell that an installed Node.js version is in use by a running program.
---

The README says nvm install takes a per-version lock directory under $NVM_DIR/.cache/locks; nvm is a shell function, so there is no daemon.

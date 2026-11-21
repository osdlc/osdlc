---
proposition:
  subject: '[Visual Studio](../../stores/Visual%20Studio.md)'
  predicate: liveness/in-use
  object:
    processes:
    - devenv.exe
    locks: []
direction: supports
strength: weak
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Visual Studio in use 1](../../study-results/Visual%20Studio/2026-11-21%20Visual%20Studio%20in%20use%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: weak
  description: A Microsoft Q&A answer says to make sure devenv.exe is not running before deleting ComponentModelCache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Visual Studio](../../stores/Visual%20Studio.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform:
  - windows
status: current
open:
- No primary source names a lock file for Visual Studio caches.
---

A Microsoft Q&A answer says to make sure devenv.exe is not running before deleting ComponentModelCache.

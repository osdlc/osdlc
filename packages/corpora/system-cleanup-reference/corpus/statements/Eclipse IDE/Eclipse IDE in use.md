---
proposition:
  subject: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
  predicate: liveness/in-use
  object:
    processes:
    - eclipse
    - eclipse.exe
    locks:
    - <workspace>/.metadata/.lock
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Eclipse IDE in use 1](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20in%20use%201.md)'
  - '[2026-11-21 Eclipse IDE in use 2](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20in%20use%202.md)'
  - '[2026-11-21 Eclipse IDE in use 3](../../study-results/Eclipse%20IDE/2026-11-21%20Eclipse%20IDE%20in%20use%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The user guide shows the workspace lock file left after a crash; the runtime options page
    names the eclipse.exe launcher.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Eclipse IDE](../../stores/Eclipse%20IDE.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source names a lock file for the shared ~/.p2 agent.
---

The user guide shows the workspace lock file left after a crash; the runtime options page names the eclipse.exe launcher.

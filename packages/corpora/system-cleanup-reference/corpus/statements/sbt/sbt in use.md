---
proposition:
  subject: '[sbt](../../stores/sbt.md)'
  predicate: liveness/in-use
  object:
    processes: []
    locks:
    - project/target/active.json
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 sbt in use 1](../../study-results/sbt/2026-11-21%20sbt%20in%20use%201.md)'
  - '[2026-11-21 sbt in use 2](../../study-results/sbt/2026-11-21%20sbt%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The sbt server docs say a running sbt shell creates a port file inside the project; a cleaner
    can treat it as a sign the project is open (it may be left behind if sbt is killed).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[sbt](../../stores/sbt.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source names the process name or a lock file for the global ~/.sbt, ~/.ivy2 or Coursier caches.
---

The sbt server docs say a running sbt shell creates a port file inside the project; a cleaner can treat it as a sign the project is open (it may be left behind if sbt is killed).

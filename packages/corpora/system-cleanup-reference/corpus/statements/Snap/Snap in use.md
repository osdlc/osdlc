---
proposition:
  subject: '[Snap](../../stores/Snap.md)'
  predicate: liveness/in-use
  object:
    processes:
    - snapd
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Snap in use 1](../../study-results/Snap/2026-11-21%20Snap%20in%20use%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: snapd manages every file under /var/lib/snapd; snaps are mounted from their .snap files,
    so a cleaner must go through the snap command rather than delete files.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Snap](../../stores/Snap.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No lock file is documented in the pages read.
---

snapd manages every file under /var/lib/snapd; snaps are mounted from their .snap files, so a cleaner must go through the snap command rather than delete files.

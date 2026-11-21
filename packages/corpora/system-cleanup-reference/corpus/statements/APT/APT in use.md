---
proposition:
  subject: '[APT](../../stores/APT.md)'
  predicate: liveness/in-use
  object:
    processes: []
    locks:
    - /var/cache/apt/archives/lock
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 APT in use 1](../../study-results/APT/2026-11-21%20APT%20in%20use%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: clean says the archives directory holds a lock file that it leaves in place; the exact
    name lock is not spelled out in the quote.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[APT](../../stores/APT.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The dpkg locks (/var/lib/dpkg/lock, lock-frontend) and process names such as apt, apt-get, dpkg and
  unattended-upgrade are not documented in the pages read.
---

clean says the archives directory holds a lock file that it leaves in place; the exact name lock is not spelled out in the quote.

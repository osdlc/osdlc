---
proposition:
  subject: '[Apache Maven](../../stores/Apache%20Maven.md)'
  predicate: liveness/in-use
  object:
    processes: []
    locks:
    - ~/.m2/repository/.locks
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Apache Maven in use 1](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20in%20use%201.md)'
  - '[2026-11-21 Apache Maven in use 2](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Maven Resolver's file-lock named locks live in .locks under the local repository root (default
    value ".locks"); this applies when the file-lock implementation is in use.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Apache Maven](../../stores/Apache%20Maven.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The lock directory exists only when the file-lock named-lock factory is configured; no source names
  the Maven process (java) for a cleaner to check.
---

Maven Resolver's file-lock named locks live in .locks under the local repository root (default value ".locks"); this applies when the file-lock implementation is in use.

---
proposition:
  subject: '[Stack](../../stores/Stack.md)'
  predicate: liveness/in-use
  object:
    processes: []
    locks:
    - ~/.stack/stack.sqlite3.pantry-write-lock
    - ~/.stack/pantry/pantry.sqlite3.pantry-write-lock
    - .stack-work/stack.sqlite3.pantry-write-lock
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Stack in use 1](../../study-results/Stack/2026-11-21%20Stack%20in%20use%201.md)'
  - '[2026-11-21 Stack in use 2](../../study-results/Stack/2026-11-21%20Stack%20in%20use%202.md)'
  - '[2026-11-21 Stack in use 3](../../study-results/Stack/2026-11-21%20Stack%20in%20use%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The Stack root and work-directory topics name the pantry write-lock files beside the SQLite
    databases; the docs spell the pantry one pantry.sqlite2.pantry-write-lock, apparently a typo for pantry.sqlite3.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Stack](../../stores/Stack.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The docs do not say whether the lock files persist when Stack is idle, so their presence alone may not
  mean Stack is running.
---

The Stack root and work-directory topics name the pantry write-lock files beside the SQLite databases; the docs spell the pantry one pantry.sqlite2.pantry-write-lock, apparently a typo for pantry.sqlite3.

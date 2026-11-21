---
proposition:
  subject: '[npm](../../stores/npm.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: npm cache clean --force
      removes: all entries in the _cacache cache folder
    - command: npm cache verify
      removes: unneeded (garbage) data in the cache, after verifying integrity
    - command: npm cache npx rm
      removes: given entries or all entries from the npx cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 npm clean command 1](../../study-results/npm/2026-11-21%20npm%20clean%20command%201.md)'
  - '[2026-11-21 npm clean command 2](../../study-results/npm/2026-11-21%20npm%20clean%20command%202.md)'
  - '[2026-11-21 npm clean command 3](../../study-results/npm/2026-11-21%20npm%20clean%20command%203.md)'
  - '[2026-11-21 npm clean command 4](../../study-results/npm/2026-11-21%20npm%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: npm-cache documents clean (needs --force), verify and npx rm.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[npm](../../stores/npm.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

npm-cache documents clean (needs --force), verify and npx rm.

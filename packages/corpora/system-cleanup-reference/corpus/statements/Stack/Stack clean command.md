---
proposition:
  subject: '[Stack](../../stores/Stack.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: stack clean
      removes: the dist directory in each project package's Stack work directory
    - command: stack clean --full
      removes: the Stack work directories of the project and its packages
    - command: stack purge
      removes: same as stack clean --full
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Stack clean command 1](../../study-results/Stack/2026-11-21%20Stack%20clean%20command%201.md)'
  - '[2026-11-21 Stack clean command 2](../../study-results/Stack/2026-11-21%20Stack%20clean%20command%202.md)'
  - '[2026-11-21 Stack clean command 3](../../study-results/Stack/2026-11-21%20Stack%20clean%20command%203.md)'
  - '[2026-11-21 Stack clean command 4](../../study-results/Stack/2026-11-21%20Stack%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The clean and purge command pages document these; no command prunes the Stack root, where
    the docs say to delete a tool's files by hand.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Stack](../../stores/Stack.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No Stack command removes unused snapshots or GHC versions from the Stack root.
---

The clean and purge command pages document these; no command prunes the Stack root, where the docs say to delete a tool's files by hand.

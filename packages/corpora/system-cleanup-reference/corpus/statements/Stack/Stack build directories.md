---
proposition:
  subject: '[Stack](../../stores/Stack.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: .stack-work
      marker: stack.yaml
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Stack build directories 1](../../study-results/Stack/2026-11-21%20Stack%20build%20directories%201.md)'
  - '[2026-11-21 Stack build directories 2](../../study-results/Stack/2026-11-21%20Stack%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The work-directory topic says stack build creates .stack-work in each project package directory
    and the project directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Stack](../../stores/Stack.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Package subdirectories also get .stack-work next to their .cabal or package.yaml file, not only the
  stack.yaml root.
---

The work-directory topic says stack build creates .stack-work in each project package directory and the project directory.

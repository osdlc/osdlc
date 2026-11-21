---
proposition:
  subject: '[Apache Maven](../../stores/Apache%20Maven.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: mvn dependency:purge-local-repository
      removes: the current project's dependencies from the local repository (optionally re-resolving them)
    - command: mvn clean
      removes: the project's build directory (target)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Apache Maven clean command 1](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20clean%20command%201.md)'
  - '[2026-11-21 Apache Maven clean command 2](../../study-results/Apache%20Maven/2026-11-21%20Apache%20Maven%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Maven offers per-project purging of the local repository and the clean plugin for build
    output; there is no age-based prune of the whole repository.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Apache Maven](../../stores/Apache%20Maven.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No Maven command prunes unused artifacts across the whole local repository.
---

Maven offers per-project purging of the local repository and the clean plugin for build output; there is no age-based prune of the whole repository.

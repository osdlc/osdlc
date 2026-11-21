---
proposition:
  subject: '[DNF](../../stores/DNF.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: dnf clean all
      removes: all temporary repository data (metadata, packages, dbcache)
    - command: dnf clean packages
      removes: cached packages
    - command: dnf clean metadata
      removes: repository metadata, downloaded again on next run
    - command: dnf autoremove
      removes: leaf packages installed as dependencies and no longer required
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 DNF clean command 1](../../study-results/DNF/2026-11-21%20DNF%20clean%20command%201.md)'
  - '[2026-11-21 DNF clean command 2](../../study-results/DNF/2026-11-21%20DNF%20clean%20command%202.md)'
  - '[2026-11-21 DNF clean command 3](../../study-results/DNF/2026-11-21%20DNF%20clean%20command%203.md)'
  - '[2026-11-21 DNF clean command 4](../../study-results/DNF/2026-11-21%20DNF%20clean%20command%204.md)'
  - '[2026-11-21 DNF clean command 5](../../study-results/DNF/2026-11-21%20DNF%20clean%20command%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The DNF5 docs document clean and autoremove; DNF 4 offers the same dnf clean subcommands.
    Both need root for the system cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[DNF](../../stores/DNF.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The DNF5 docs document clean and autoremove; DNF 4 offers the same dnf clean subcommands. Both need root for the system cache.

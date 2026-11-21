---
proposition:
  subject: '[pacman](../../stores/pacman.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: pacman -Sc
      removes: cached packages no longer installed and unused sync databases
    - command: pacman -Scc
      removes: all files from the package cache
    - command: paccache -r
      removes: all cached versions except the most recent three of each package
    - command: paccache -ruk0
      removes: all cached versions of uninstalled packages
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pacman clean command 1](../../study-results/pacman/2026-11-21%20pacman%20clean%20command%201.md)'
  - '[2026-11-21 pacman clean command 2](../../study-results/pacman/2026-11-21%20pacman%20clean%20command%202.md)'
  - '[2026-11-21 pacman clean command 3](../../study-results/pacman/2026-11-21%20pacman%20clean%20command%203.md)'
  - '[2026-11-21 pacman clean command 4](../../study-results/pacman/2026-11-21%20pacman%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: pacman -Sc/-Scc are built in; paccache needs the pacman-contrib package and ships paccache.timer
    for weekly cleaning. All need root.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pacman](../../stores/pacman.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

pacman -Sc/-Scc are built in; paccache needs the pacman-contrib package and ships paccache.timer for weekly cleaning. All need root.

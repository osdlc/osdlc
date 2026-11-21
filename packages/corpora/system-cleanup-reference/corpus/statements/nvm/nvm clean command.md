---
proposition:
  subject: '[nvm](../../stores/nvm.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: nvm uninstall
      removes: one installed Node.js version (nvm uninstall VERSION)
    - command: nvm cache clear
      removes: the nvm cache directory (cached node downloads)
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 nvm clean command 1](../../study-results/nvm/2026-11-21%20nvm%20clean%20command%201.md)'
  - '[2026-11-21 nvm clean command 2](../../study-results/nvm/2026-11-21%20nvm%20clean%20command%202.md)'
  - '[2026-11-21 nvm clean command 3](../../study-results/nvm/2026-11-21%20nvm%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: nvm's help text in nvm.sh lists nvm uninstall and nvm cache clear, and the README says
    cache clear deletes cached downloads.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[nvm](../../stores/nvm.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- nvm has no command to prune unused Node.js versions.
---

nvm's help text in nvm.sh lists nvm uninstall and nvm cache clear, and the README says cache clear deletes cached downloads.

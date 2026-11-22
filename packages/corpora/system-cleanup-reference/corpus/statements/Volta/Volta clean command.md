---
proposition:
  subject: '[Volta](../../stores/Volta.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: volta uninstall
      removes: a global package installed with volta install; node, npm and yarn versions cannot be uninstalled
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Volta clean command 1](../../study-results/Volta/2026-11-21%20Volta%20clean%20command%201.md)'
  - '[2026-11-21 Volta clean command 2](../../study-results/Volta/2026-11-21%20Volta%20clean%20command%202.md)'
  - '[2026-11-21 Volta clean command 3](../../study-results/Volta/2026-11-21%20Volta%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The uninstall reference limits volta uninstall to global packages, and the source returns
    an unimplemented error for node, npm and yarn.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Volta](../../stores/Volta.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- Volta has no command to remove Node.js, npm or Yarn versions or to clear its cache; the docs only describe
  deleting ~/.volta to uninstall Volta entirely.
---

The uninstall reference limits volta uninstall to global packages, and the source returns an unimplemented error for node, npm and yarn.

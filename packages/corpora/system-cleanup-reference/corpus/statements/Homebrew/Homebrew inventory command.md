---
proposition:
  subject: '[Homebrew](../../stores/Homebrew.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: brew --cache
      shows: the path of the download cache
    - command: brew cleanup --dry-run
      shows: what cleanup would remove
    - command: brew autoremove --dry-run
      shows: formulae autoremove would uninstall
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Homebrew inventory command 1](../../study-results/Homebrew/2026-11-21%20Homebrew%20inventory%20command%201.md)'
  - '[2026-11-21 Homebrew inventory command 2](../../study-results/Homebrew/2026-11-21%20Homebrew%20inventory%20command%202.md)'
  - '[2026-11-21 Homebrew inventory command 3](../../study-results/Homebrew/2026-11-21%20Homebrew%20inventory%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The manpage documents --cache and the dry-run flags; none of them reports sizes, so a cleaner
    must measure the directories itself.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Homebrew](../../stores/Homebrew.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The manpage documents --cache and the dry-run flags; none of them reports sizes, so a cleaner must measure the directories itself.

---
proposition:
  subject: '[Flatpak](../../stores/Flatpak.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: flatpak uninstall --unused
      removes: unused refs, such as runtimes and extensions no installed app needs
    - command: flatpak uninstall --delete-data
      removes: app data in ~/.var/app not owned by an installed app
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Flatpak clean command 1](../../study-results/Flatpak/2026-11-21%20Flatpak%20clean%20command%201.md)'
  - '[2026-11-21 Flatpak clean command 2](../../study-results/Flatpak/2026-11-21%20Flatpak%20clean%20command%202.md)'
  - '[2026-11-21 Flatpak clean command 3](../../study-results/Flatpak/2026-11-21%20Flatpak%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Both commands are in the uninstall reference; --unused frees runtimes, --delete-data without
    a ref deletes orphaned user data (not recoverable).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Flatpak](../../stores/Flatpak.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Both commands are in the uninstall reference; --unused frees runtimes, --delete-data without a ref deletes orphaned user data (not recoverable).

---
proposition:
  subject: '[Android Studio](../../stores/Android%20Studio.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: Delete Unused Android Studio Directories dialog (shown on the first run of a new major
        version)
      removes: caches, settings, indices and logs of Android Studio versions that are no longer installed
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Android Studio clean command 1](../../study-results/Android%20Studio/2026-11-21%20Android%20Studio%20clean%20command%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The update page describes a built-in dialog, not a command-line command, that finds and
    deletes directories of uninstalled versions.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Android Studio](../../stores/Android%20Studio.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No Android developer page documents a command-line way to clear the current version's caches.
---

The update page describes a built-in dialog, not a command-line command, that finds and deletes directories of uninstalled versions.

---
proposition:
  subject: '[Sublime Text](../../stores/Sublime%20Text.md)'
  predicate: liveness/in-use
  object:
    processes:
    - sublime_text
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Sublime Text in use 1](../../study-results/Sublime%20Text/2026-11-21%20Sublime%20Text%20in%20use%201.md)'
  - '[2026-11-21 Sublime Text in use 2](../../study-results/Sublime%20Text/2026-11-21%20Sublime%20Text%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The command-line page names the sublime_text executable; the revert page says to exit Sublime
    Text before moving its data.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Sublime Text](../../stores/Sublime%20Text.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source names a lock file or the process names on Windows and macOS.
---

The command-line page names the sublime_text executable; the revert page says to exit Sublime Text before moving its data.

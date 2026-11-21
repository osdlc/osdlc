---
proposition:
  subject: '[Homebrew](../../stores/Homebrew.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: brew cleanup
      removes: stale lock files, downloads older than 120 days and old versions of installed formulae
    - command: brew cleanup --prune=all
      removes: all cache files regardless of age
    - command: brew cleanup -s
      removes: cached downloads even for the latest versions (still not for installed formulae or casks)
    - command: brew autoremove
      removes: formulae installed only as dependencies that are no longer needed
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Homebrew clean command 1](../../study-results/Homebrew/2026-11-21%20Homebrew%20clean%20command%201.md)'
  - '[2026-11-21 Homebrew clean command 2](../../study-results/Homebrew/2026-11-21%20Homebrew%20clean%20command%202.md)'
  - '[2026-11-21 Homebrew clean command 3](../../study-results/Homebrew/2026-11-21%20Homebrew%20clean%20command%203.md)'
  - '[2026-11-21 Homebrew clean command 4](../../study-results/Homebrew/2026-11-21%20Homebrew%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: All four commands are documented in the brew manpage.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Homebrew](../../stores/Homebrew.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

All four commands are documented in the brew manpage.

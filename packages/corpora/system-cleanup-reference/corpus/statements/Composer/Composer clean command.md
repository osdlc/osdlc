---
proposition:
  subject: '[Composer](../../stores/Composer.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: composer clear-cache
      removes: all content of Composer's cache directories
    - command: composer clear-cache --gc
      removes: only what garbage collection would (expired and over-size cache entries)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Composer clean command 1](../../study-results/Composer/2026-11-21%20Composer%20clean%20command%201.md)'
  - '[2026-11-21 Composer clean command 2](../../study-results/Composer/2026-11-21%20Composer%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The CLI reference documents clear-cache (aliases clearcache, cc) and its --gc option.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Composer](../../stores/Composer.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The CLI reference documents clear-cache (aliases clearcache, cc) and its --gc option.

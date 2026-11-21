---
proposition:
  subject: '[Bundler](../../stores/Bundler.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: bundle clean
      removes: gems in the bundle's install path that the current Gemfile.lock no longer references
    - command: bundle clean --dry-run
      removes: nothing; prints what would be removed
    - command: bundle clean --force
      removes: unused gems even when installed to the system gem home, which removes all system gems except
        the current application's
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bundler clean command 1](../../study-results/Bundler/2026-11-21%20Bundler%20clean%20command%201.md)'
  - '[2026-11-21 Bundler clean command 2](../../study-results/Bundler/2026-11-21%20Bundler%20clean%20command%202.md)'
  - '[2026-11-21 Bundler clean command 3](../../study-results/Bundler/2026-11-21%20Bundler%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The bundle clean reference and the caching guide document the command and its flags.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bundler](../../stores/Bundler.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The bundle clean reference and the caching guide document the command and its flags.

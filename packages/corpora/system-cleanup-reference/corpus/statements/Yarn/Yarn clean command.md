---
proposition:
  subject: '[Yarn](../../stores/Yarn.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: yarn cache clean
      removes: the project's local cache archives (Berry)
    - command: yarn cache clean --mirror
      removes: the global cache files (Berry)
    - command: yarn cache clean --all
      removes: both the global cache and the current project's local cache (Berry)
    - command: yarn cache clean
      removes: the whole global cache, or named packages (Classic)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Yarn clean command 1](../../study-results/Yarn/2026-11-21%20Yarn%20clean%20command%201.md)'
  - '[2026-11-21 Yarn clean command 2](../../study-results/Yarn/2026-11-21%20Yarn%20clean%20command%202.md)'
  - '[2026-11-21 Yarn clean command 3](../../study-results/Yarn/2026-11-21%20Yarn%20clean%20command%203.md)'
  - '[2026-11-21 Yarn clean command 4](../../study-results/Yarn/2026-11-21%20Yarn%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Berry's yarn cache clean page and Classic's yarn cache page document these commands.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Yarn](../../stores/Yarn.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Berry's yarn cache clean page and Classic's yarn cache page document these commands.

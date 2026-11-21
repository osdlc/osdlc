---
proposition:
  subject: '[mise](../../stores/mise.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: mise prune
      removes: installed tool versions that no tracked config file or tool stub selects, and tracked config
        records for files that no longer exist
    - command: mise prune --dry-run
      removes: nothing; previews what mise prune would delete
    - command: mise uninstall --all
      removes: every installed version of the named tools, or of every tool when none is named
    - command: mise cache clear
      removes: the whole cache directory, the cached environment and task artifacts; installed tools stay
    - command: mise cache prune
      removes: cache files not accessed within cache_prune_age
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 mise clean command 1](../../study-results/mise/2026-11-21%20mise%20clean%20command%201.md)'
  - '[2026-11-21 mise clean command 2](../../study-results/mise/2026-11-21%20mise%20clean%20command%202.md)'
  - '[2026-11-21 mise clean command 3](../../study-results/mise/2026-11-21%20mise%20clean%20command%203.md)'
  - '[2026-11-21 mise clean command 4](../../study-results/mise/2026-11-21%20mise%20clean%20command%204.md)'
  - '[2026-11-21 mise clean command 5](../../study-results/mise/2026-11-21%20mise%20clean%20command%205.md)'
  - '[2026-11-21 mise clean command 6](../../study-results/mise/2026-11-21%20mise%20clean%20command%206.md)'
  - '[2026-11-21 mise clean command 7](../../study-results/mise/2026-11-21%20mise%20clean%20command%207.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The generated CLI reference pages for mise prune, mise uninstall, mise cache clear and
    mise cache prune describe what each deletes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[mise](../../stores/mise.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The generated CLI reference pages for mise prune, mise uninstall, mise cache clear and mise cache prune describe what each deletes.

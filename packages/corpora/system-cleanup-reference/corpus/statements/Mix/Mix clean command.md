---
proposition:
  subject: '[Mix](../../stores/Mix.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: mix clean
      removes: build artifacts of the current project in all environments
    - command: mix clean --deps
      removes: build artifacts of the project and its dependencies' sources and build files
    - command: mix deps.clean --unused
      removes: dependencies no longer mentioned in mix.exs
    - command: mix deps.clean --all
      removes: all dependency sources and build artifacts
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Mix clean command 1](../../study-results/Mix/2026-11-21%20Mix%20clean%20command%201.md)'
  - '[2026-11-21 Mix clean command 2](../../study-results/Mix/2026-11-21%20Mix%20clean%20command%202.md)'
  - '[2026-11-21 Mix clean command 3](../../study-results/Mix/2026-11-21%20Mix%20clean%20command%203.md)'
  - '[2026-11-21 Mix clean command 4](../../study-results/Mix/2026-11-21%20Mix%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The mix clean and mix deps.clean task docs describe these commands.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Mix](../../stores/Mix.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No Mix command found prunes ~/.mix or the Mix.install cache.
---

The mix clean and mix deps.clean task docs describe these commands.

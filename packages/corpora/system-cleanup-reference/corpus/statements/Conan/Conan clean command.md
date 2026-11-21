---
proposition:
  subject: '[Conan](../../stores/Conan.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: conan cache clean "*"
      removes: temporary, source, build and download folders for all references
    - command: conan remove "*" -c
      removes: every recipe and package binary in the local cache
    - command: conan remove "*" --lru=4w -c
      removes: recipes and binaries not used in the given time
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Conan clean command 1](../../study-results/Conan/2026-11-21%20Conan%20clean%20command%201.md)'
  - '[2026-11-21 Conan clean command 2](../../study-results/Conan/2026-11-21%20Conan%20clean%20command%202.md)'
  - '[2026-11-21 Conan clean command 3](../../study-results/Conan/2026-11-21%20Conan%20clean%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The cache and remove command references describe these.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Conan](../../stores/Conan.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The cache and remove command references describe these.

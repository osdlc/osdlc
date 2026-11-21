---
proposition:
  subject: '[Bazel](../../stores/Bazel.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: bazel info output_base
      shows: the output base path of the current workspace (no sizes)
    - command: bazel info install_base
      shows: the install directory of this Bazel version
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bazel inventory command 1](../../study-results/Bazel/2026-11-21%20Bazel%20inventory%20command%201.md)'
  - '[2026-11-21 Bazel inventory command 2](../../study-results/Bazel/2026-11-21%20Bazel%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The user manual lists bazel info keys for the install base and output base.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bazel](../../stores/Bazel.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The user manual lists bazel info keys for the install base and output base.

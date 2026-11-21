---
proposition:
  subject: '[rustup](../../stores/rustup.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: rustup toolchain list
      shows: installed toolchains
    - command: rustup show
      shows: which toolchain is used in the current directory
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 rustup inventory command 1](../../study-results/rustup/2026-11-21%20rustup%20inventory%20command%201.md)'
  - '[2026-11-21 rustup inventory command 2](../../study-results/rustup/2026-11-21%20rustup%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The CLI source documents toolchain list; the examples page documents rustup show. Neither
    reports sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[rustup](../../stores/rustup.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The CLI source documents toolchain list; the examples page documents rustup show. Neither reports sizes.

---
proposition:
  subject: '[Nix](../../stores/Nix.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: nix-env --list-generations
      shows: generations of the active profile with creation dates
    - command: nix-store --gc --print-dead
      shows: store paths garbage collection would delete
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Nix inventory command 1](../../study-results/Nix/2026-11-21%20Nix%20inventory%20command%201.md)'
  - '[2026-11-21 Nix inventory command 2](../../study-results/Nix/2026-11-21%20Nix%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: list-generations and --print-dead are documented; a --dry-run flag appears only in the
    nix-collect-garbage synopsis, so it is left out.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Nix](../../stores/Nix.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

list-generations and --print-dead are documented; a --dry-run flag appears only in the nix-collect-garbage synopsis, so it is left out.

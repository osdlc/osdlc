---
proposition:
  subject: '[Nix](../../stores/Nix.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: nix-collect-garbage
      removes: all unreachable store objects
    - command: nix-collect-garbage -d
      removes: all old profile generations, then unreachable store objects
    - command: nix-collect-garbage --delete-older-than 30d
      removes: profile generations older than the period, then unreachable store objects
    - command: nix-store --gc
      removes: store paths not reachable from a GC root
    - command: nix store optimise
      removes: duplicate files, replaced by hard links
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Nix clean command 1](../../study-results/Nix/2026-11-21%20Nix%20clean%20command%201.md)'
  - '[2026-11-21 Nix clean command 2](../../study-results/Nix/2026-11-21%20Nix%20clean%20command%202.md)'
  - '[2026-11-21 Nix clean command 3](../../study-results/Nix/2026-11-21%20Nix%20clean%20command%203.md)'
  - '[2026-11-21 Nix clean command 4](../../study-results/Nix/2026-11-21%20Nix%20clean%20command%204.md)'
  - '[2026-11-21 Nix clean command 5](../../study-results/Nix/2026-11-21%20Nix%20clean%20command%205.md)'
  - '[2026-11-21 Nix clean command 6](../../study-results/Nix/2026-11-21%20Nix%20clean%20command%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: All commands are in the Nix 2.36 reference manual; -d and --delete-older-than remove rollback
    targets and, run as root, act on other users' profiles too.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Nix](../../stores/Nix.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

All commands are in the Nix 2.36 reference manual; -d and --delete-older-than remove rollback targets and, run as root, act on other users' profiles too.

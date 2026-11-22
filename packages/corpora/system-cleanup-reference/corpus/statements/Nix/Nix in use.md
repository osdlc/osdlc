---
proposition:
  subject: '[Nix](../../stores/Nix.md)'
  predicate: liveness/in-use
  object:
    processes:
    - nix-daemon
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Nix in use 1](../../study-results/Nix/2026-11-21%20Nix%20in%20use%201.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: On multi-user installs nix-daemon owns the store; a cleaner should leave /nix/store to
    nix-collect-garbage rather than delete paths itself.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Nix](../../stores/Nix.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The GC lock file path is not documented in the pages read.
---

On multi-user installs nix-daemon owns the store; a cleaner should leave /nix/store to nix-collect-garbage rather than delete paths itself.

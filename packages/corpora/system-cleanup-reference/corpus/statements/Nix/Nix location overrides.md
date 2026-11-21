---
proposition:
  subject: '[Nix](../../stores/Nix.md)'
  predicate: location/override
  object:
    vars:
    - NIX_STORE_DIR
    - NIX_CACHE_HOME
    - XDG_CACHE_HOME
    settings:
    - auto-optimise-store
    - use-xdg-base-directories
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Nix location overrides 1](../../study-results/Nix/2026-11-21%20Nix%20location%20overrides%201.md)'
  - '[2026-11-21 Nix location overrides 2](../../study-results/Nix/2026-11-21%20Nix%20location%20overrides%202.md)'
  - '[2026-11-21 Nix location overrides 3](../../study-results/Nix/2026-11-21%20Nix%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: NIX_STORE_DIR moves the store (the manual recommends bind mounts instead); NIX_CACHE_HOME
    moves the user cache.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Nix](../../stores/Nix.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

NIX_STORE_DIR moves the store (the manual recommends bind mounts instead); NIX_CACHE_HOME moves the user cache.

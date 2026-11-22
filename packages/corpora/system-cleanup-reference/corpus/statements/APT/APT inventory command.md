---
proposition:
  subject: '[APT](../../stores/APT.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: apt-get -s autoremove
      shows: which packages autoremove would remove, without changing the system
    - command: apt-cache stats
      shows: statistics about the package cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 APT inventory command 1](../../study-results/APT/2026-11-21%20APT%20inventory%20command%201.md)'
  - '[2026-11-21 APT inventory command 2](../../study-results/APT/2026-11-21%20APT%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: Simulation mode previews autoremove; apt-cache stats reports counts, not disk usage of
    /var/cache/apt/archives, which a cleaner must measure itself.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[APT](../../stores/APT.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

Simulation mode previews autoremove; apt-cache stats reports counts, not disk usage of /var/cache/apt/archives, which a cleaner must measure itself.

---
proposition:
  subject: '[ccache](../../stores/ccache.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: ccache -s
      shows: configuration summary and statistics counters, including cache size
    - command: ccache --show-compression
      shows: total data size on disk and compression savings
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 ccache inventory command 1](../../study-results/ccache/2026-11-21%20ccache%20inventory%20command%201.md)'
  - '[2026-11-21 ccache inventory command 2](../../study-results/ccache/2026-11-21%20ccache%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The manual describes --show-stats and --show-compression, whose disk-block figure matches
    the cache size in --show-stats.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[ccache](../../stores/ccache.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The manual describes --show-stats and --show-compression, whose disk-block figure matches the cache size in --show-stats.

---
proposition:
  subject: '[uv](../../stores/uv.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: uv cache size
      shows: total size of the cache directory
    - command: uv cache dir
      shows: the cache directory path
    - command: uv python list --only-installed
      shows: installed Python versions
    - command: uv python dir
      shows: the Python installation directory
    - command: uv tool list
      shows: installed tools
    - command: uv tool dir
      shows: the tool installation directory
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 uv inventory command 1](../../study-results/uv/2026-11-21%20uv%20inventory%20command%201.md)'
  - '[2026-11-21 uv inventory command 2](../../study-results/uv/2026-11-21%20uv%20inventory%20command%202.md)'
  - '[2026-11-21 uv inventory command 3](../../study-results/uv/2026-11-21%20uv%20inventory%20command%203.md)'
  - '[2026-11-21 uv inventory command 4](../../study-results/uv/2026-11-21%20uv%20inventory%20command%204.md)'
  - '[2026-11-21 uv inventory command 5](../../study-results/uv/2026-11-21%20uv%20inventory%20command%205.md)'
  - '[2026-11-21 uv inventory command 6](../../study-results/uv/2026-11-21%20uv%20inventory%20command%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The CLI reference documents uv cache size; the storage page names the dir commands; the
    Python versions page shows list --only-installed.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[uv](../../stores/uv.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The CLI reference documents uv cache size; the storage page names the dir commands; the Python versions page shows list --only-installed.

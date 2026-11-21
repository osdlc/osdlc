---
proposition:
  subject: '[uv](../../stores/uv.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: uv cache prune
      removes: unused cache entries and centralized project environments
    - command: uv cache clean
      removes: all cache entries
    - command: uv cache clean <package>
      removes: cache entries for one package
    - command: uv cache prune --ci
      removes: pre-built wheels and unzipped source distributions, keeping wheels built from source
    - command: uv python uninstall <version>
      removes: a managed Python version
    - command: uv tool uninstall <name>
      removes: an installed tool
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 uv clean command 1](../../study-results/uv/2026-11-21%20uv%20clean%20command%201.md)'
  - '[2026-11-21 uv clean command 2](../../study-results/uv/2026-11-21%20uv%20clean%20command%202.md)'
  - '[2026-11-21 uv clean command 3](../../study-results/uv/2026-11-21%20uv%20clean%20command%203.md)'
  - '[2026-11-21 uv clean command 4](../../study-results/uv/2026-11-21%20uv%20clean%20command%204.md)'
  - '[2026-11-21 uv clean command 5](../../study-results/uv/2026-11-21%20uv%20clean%20command%205.md)'
  - '[2026-11-21 uv clean command 6](../../study-results/uv/2026-11-21%20uv%20clean%20command%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The caching page documents clean and prune and says prune is safe to run periodically;
    the CLI reference documents python and tool uninstall.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[uv](../../stores/uv.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The caching page documents clean and prune and says prune is safe to run periodically; the CLI reference documents python and tool uninstall.

---
proposition:
  subject: '[conda](../../stores/conda.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: conda info --envs
      shows: all known environments and their paths
    - command: conda info --size
      shows: conda-managed disk usage per environment
    - command: conda info --base
      shows: the base environment path
    - command: conda clean --all --dry-run
      shows: what clean would remove
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 conda inventory command 1](../../study-results/conda/2026-11-21%20conda%20inventory%20command%201.md)'
  - '[2026-11-21 conda inventory command 2](../../study-results/conda/2026-11-21%20conda%20inventory%20command%202.md)'
  - '[2026-11-21 conda inventory command 3](../../study-results/conda/2026-11-21%20conda%20inventory%20command%203.md)'
  - '[2026-11-21 conda inventory command 4](../../study-results/conda/2026-11-21%20conda%20inventory%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The conda info reference documents --envs, --size and --base; conda clean documents --dry-run.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[conda](../../stores/conda.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The conda info reference documents --envs, --size and --base; conda clean documents --dry-run.

---
proposition:
  subject: '[conda](../../stores/conda.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: conda clean --all
      removes: index cache, unused cached packages, tarballs, tempfiles and log files
    - command: conda clean --packages
      removes: unused packages from writable package caches
    - command: conda clean --tarballs
      removes: cached package tarballs
    - command: conda remove --name <env> --all
      removes: an environment
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 conda clean command 1](../../study-results/conda/2026-11-21%20conda%20clean%20command%201.md)'
  - '[2026-11-21 conda clean command 2](../../study-results/conda/2026-11-21%20conda%20clean%20command%202.md)'
  - '[2026-11-21 conda clean command 3](../../study-results/conda/2026-11-21%20conda%20clean%20command%203.md)'
  - '[2026-11-21 conda clean command 4](../../study-results/conda/2026-11-21%20conda%20clean%20command%204.md)'
  - '[2026-11-21 conda clean command 5](../../study-results/conda/2026-11-21%20conda%20clean%20command%205.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The conda clean reference lists its removal targets and warns that --force-pkgs-dirs breaks
    environments; the environments guide documents removing an environment.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[conda](../../stores/conda.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- conda clean --packages only checks environments that conda info --envs lists, per the docs' warning.
---

The conda clean reference lists its removal targets and warns that --force-pkgs-dirs breaks environments; the environments guide documents removing an environment.

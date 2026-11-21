---
proposition:
  subject: '[pyenv](../../stores/pyenv.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: pyenv uninstall <version>
      removes: an installed Python version
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pyenv clean command 1](../../study-results/pyenv/2026-11-21%20pyenv%20clean%20command%201.md)'
  - '[2026-11-21 pyenv clean command 2](../../study-results/pyenv/2026-11-21%20pyenv%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The README recommends pyenv uninstall for old versions, noting plugins may run extra steps
    on uninstall that a plain rm -rf skips.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pyenv](../../stores/pyenv.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No pyenv command clears ~/.pyenv/cache or ~/.pyenv/sources.
---

The README recommends pyenv uninstall for old versions, noting plugins may run extra steps on uninstall that a plain rm -rf skips.

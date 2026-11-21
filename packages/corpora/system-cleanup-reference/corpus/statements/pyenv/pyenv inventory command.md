---
proposition:
  subject: '[pyenv](../../stores/pyenv.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: pyenv versions
      shows: installed Python versions and the active one
    - command: pyenv root
      shows: the pyenv root directory
    - command: pyenv prefix <version>
      shows: the directory of a version
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 pyenv inventory command 1](../../study-results/pyenv/2026-11-21%20pyenv%20inventory%20command%201.md)'
  - '[2026-11-21 pyenv inventory command 2](../../study-results/pyenv/2026-11-21%20pyenv%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: COMMANDS.md documents pyenv versions; the README names pyenv prefix and pyenv root.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[pyenv](../../stores/pyenv.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No pyenv command reports sizes.
---

COMMANDS.md documents pyenv versions; the README names pyenv prefix and pyenv root.

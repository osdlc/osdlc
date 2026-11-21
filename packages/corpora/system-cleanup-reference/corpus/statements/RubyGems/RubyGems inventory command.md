---
proposition:
  subject: '[RubyGems](../../stores/RubyGems.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: gem env
      shows: installation directory, user installation directory and gem paths
    - command: gem env gemdir
      shows: the gem home path
    - command: gem list
      shows: installed gems and their versions
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 RubyGems inventory command 1](../../study-results/RubyGems/2026-11-21%20RubyGems%20inventory%20command%201.md)'
  - '[2026-11-21 RubyGems inventory command 2](../../study-results/RubyGems/2026-11-21%20RubyGems%20inventory%20command%202.md)'
  - '[2026-11-21 RubyGems inventory command 3](../../study-results/RubyGems/2026-11-21%20RubyGems%20inventory%20command%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The guides name gem env and gem env gemdir for locating directories and the reference documents
    gem list.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[RubyGems](../../stores/RubyGems.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The guides name gem env and gem env gemdir for locating directories and the reference documents gem list.

---
proposition:
  subject: '[asdf](../../stores/asdf.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: asdf uninstall
      removes: one installed version of a tool (asdf uninstall NAME VERSION)
    - command: asdf plugin remove
      removes: a plugin and all installed versions of the tool it manages
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 asdf clean command 1](../../study-results/asdf/2026-11-21%20asdf%20clean%20command%201.md)'
  - '[2026-11-21 asdf clean command 2](../../study-results/asdf/2026-11-21%20asdf%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The versions page documents asdf uninstall and the configuration page says removing a plugin
    removes all its installed versions; there is no prune or cache-clear command.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[asdf](../../stores/asdf.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- asdf offers no command to prune unused versions or clear the downloads directory.
---

The versions page documents asdf uninstall and the configuration page says removing a plugin removes all its installed versions; there is no prune or cache-clear command.

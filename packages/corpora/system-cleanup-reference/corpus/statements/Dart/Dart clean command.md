---
proposition:
  subject: '[Dart](../../stores/Dart.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: dart pub cache clean
      removes: the entire system pub cache
    - command: dart pub cache gc
      removes: cached packages no known project uses
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Dart clean command 1](../../study-results/Dart/2026-11-21%20Dart%20clean%20command%201.md)'
  - '[2026-11-21 Dart clean command 2](../../study-results/Dart/2026-11-21%20Dart%20clean%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The pub cache docs describe dart pub cache clean; pub's source describes the gc subcommand.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Dart](../../stores/Dart.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- dart pub cache gc is in pub's source but not on the dart.dev command page; the Dart SDK version that
  first shipped it is not stated.
---

The pub cache docs describe dart pub cache clean; pub's source describes the gc subcommand.

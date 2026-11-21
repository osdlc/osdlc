---
proposition:
  subject: '[NuGet](../../stores/NuGet.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: dotnet nuget locals all --list
      shows: the path of each local folder (no sizes)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NuGet inventory command 1](../../study-results/NuGet/2026-11-21%20NuGet%20inventory%20command%201.md)'
  - '[2026-11-21 NuGet inventory command 2](../../study-results/NuGet/2026-11-21%20NuGet%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The docs show a list command that prints folder locations; neither page mentions sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NuGet](../../stores/NuGet.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The docs show a list command that prints folder locations; neither page mentions sizes.

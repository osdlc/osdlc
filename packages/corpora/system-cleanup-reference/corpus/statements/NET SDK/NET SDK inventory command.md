---
proposition:
  subject: '[NET SDK](../../stores/NET%20SDK.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: dotnet workload list
      shows: installed workloads
    - command: dotnet sdk check
      shows: installed SDK and runtime versions and whether they are up to date or out of support
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NET SDK inventory command 1](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20inventory%20command%201.md)'
  - '[2026-11-21 NET SDK inventory command 2](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The dotnet workload list and dotnet sdk check references describe what they print; neither
    reports sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NET SDK](../../stores/NET%20SDK.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The dotnet workload list and dotnet sdk check references describe what they print; neither reports sizes.

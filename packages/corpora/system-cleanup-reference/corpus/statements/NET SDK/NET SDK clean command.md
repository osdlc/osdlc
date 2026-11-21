---
proposition:
  subject: '[NET SDK](../../stores/NET%20SDK.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: dotnet clean
      removes: a project's build outputs in obj and bin
    - command: dotnet workload clean
      removes: workload components left behind by updates and uninstalls
    - command: dotnet workload clean --all
      removes: all workload components from all SDK versions
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NET SDK clean command 1](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20clean%20command%201.md)'
  - '[2026-11-21 NET SDK clean command 2](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20clean%20command%202.md)'
  - '[2026-11-21 NET SDK clean command 3](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20clean%20command%203.md)'
  - '[2026-11-21 NET SDK clean command 4](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The dotnet clean and dotnet workload clean references describe what each removes; no dotnet
    command uninstalls old SDKs.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NET SDK](../../stores/NET%20SDK.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No dotnet CLI command removes old SDK or runtime versions; the separate dotnet-core-uninstall tool was
  not researched.
---

The dotnet clean and dotnet workload clean references describe what each removes; no dotnet command uninstalls old SDKs.

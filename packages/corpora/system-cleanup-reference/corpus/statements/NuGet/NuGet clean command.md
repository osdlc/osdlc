---
proposition:
  subject: '[NuGet](../../stores/NuGet.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: dotnet nuget locals all --clear
      removes: the http cache, global packages folder, temp folder and plugins cache
    - command: dotnet nuget locals global-packages --clear
      removes: every package in the global packages folder
    - command: dotnet nuget locals http-cache --clear
      removes: the HTTP request cache
    - command: dotnet nuget locals temp --clear
      removes: the temp folder
    - command: dotnet nuget locals plugins-cache --clear
      removes: the plugins cache
    - command: nuget locals all -clear
      removes: all local folders (nuget.exe)
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NuGet clean command 1](../../study-results/NuGet/2026-11-21%20NuGet%20clean%20command%201.md)'
  - '[2026-11-21 NuGet clean command 2](../../study-results/NuGet/2026-11-21%20NuGet%20clean%20command%202.md)'
  - '[2026-11-21 NuGet clean command 3](../../study-results/NuGet/2026-11-21%20NuGet%20clean%20command%203.md)'
  - '[2026-11-21 NuGet clean command 4](../../study-results/NuGet/2026-11-21%20NuGet%20clean%20command%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The dotnet nuget locals reference and the NuGet folders page give the clear commands; the
    same page says NuGet has no command that removes only unused packages.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NuGet](../../stores/NuGet.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The dotnet nuget locals reference and the NuGet folders page give the clear commands; the same page says NuGet has no command that removes only unused packages.

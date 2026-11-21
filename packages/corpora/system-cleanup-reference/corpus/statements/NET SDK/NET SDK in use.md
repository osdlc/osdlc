---
proposition:
  subject: '[NET SDK](../../stores/NET%20SDK.md)'
  predicate: liveness/in-use
  object:
    processes:
    - MSBuild build server
    - Razor build server
    - VBCSCompiler
    locks: []
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NET SDK in use 1](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20in%20use%201.md)'
  - '[2026-11-21 NET SDK in use 2](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20in%20use%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The dotnet build-server reference names the servers a build leaves running and the command
    that stops them; it gives no executable names beyond VBCSCompiler's option name, and no lock files.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NET SDK](../../stores/NET%20SDK.md)'
subject: '[In use](../../subjects/liveness/In%20use.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source gives the exact process names of the MSBuild and Razor build servers or any lock file.
---

The dotnet build-server reference names the servers a build leaves running and the command that stops them; it gives no executable names beyond VBCSCompiler's option name, and no lock files.

---
proposition:
  subject: '[NET SDK](../../stores/NET%20SDK.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: bin
      marker: '*.csproj'
      holds: build-output
      rebuild: rebuild
    - path: obj
      marker: '*.csproj'
      holds: build-output
      rebuild: rebuild
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 NET SDK build directories 1](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20build%20directories%201.md)'
  - '[2026-11-21 NET SDK build directories 2](../../study-results/NET%20SDK/2026-11-21%20NET%20SDK%20build%20directories%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: dotnet clean and the project SDK overview name the bin and obj folders of a project; the
    marker is the C#, F# or Visual Basic project file (*.csproj, *.fsproj, *.vbproj).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[NET SDK](../../stores/NET%20SDK.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

dotnet clean and the project SDK overview name the bin and obj folders of a project; the marker is the C#, F# or Visual Basic project file (*.csproj, *.fsproj, *.vbproj).

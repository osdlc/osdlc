---
kind: docs
store: '[NET SDK](../../stores/NET%20SDK.md)'
observed: '2026-11-21'
locator: Default includes and excludes
reportedIn:
- '[NET project SDK overview](../../documents/Microsoft/NET%20project%20SDK%20overview.md)'
excerpt:
  exact: The ./bin and ./obj folders, which are represented by the $(BaseOutputPath) and $(BaseIntermediateOutputPath)
    MSBuild properties, are excluded from the globs by default.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

NET project SDK overview (https://learn.microsoft.com/en-us/dotnet/core/project-sdk/overview) says, under Default includes and excludes:

> The ./bin and ./obj folders, which are represented by the $(BaseOutputPath) and $(BaseIntermediateOutputPath) MSBuild properties, are excluded from the globs by default.

---
kind: docs
store: '[Go](../../stores/Go.md)'
observed: '2026-11-21'
locator: Remove object files and cached files
reportedIn:
- '[go command - cmd go](../../documents/The%20Go%20Authors/go%20command%20-%20cmd%20go.md)'
excerpt:
  exact: The -fuzzcache flag causes clean to remove files stored in the Go build cache for fuzz testing.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

go command - cmd go (https://pkg.go.dev/cmd/go) says, under Remove object files and cached files:

> The -fuzzcache flag causes clean to remove files stored in the Go build cache for fuzz testing.

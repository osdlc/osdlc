---
proposition:
  subject: '[Go](../../stores/Go.md)'
  predicate: clean/command
  object:
    supported: true
    commands:
    - command: go clean -cache
      removes: the entire go build cache
    - command: go clean -modcache
      removes: the entire module download cache, including unpacked sources
    - command: go clean -testcache
      removes: expires all cached test results
    - command: go clean -fuzzcache
      removes: cached fuzzing inputs in the build cache
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Go clean command 1](../../study-results/Go/2026-11-21%20Go%20clean%20command%201.md)'
  - '[2026-11-21 Go clean command 2](../../study-results/Go/2026-11-21%20Go%20clean%20command%202.md)'
  - '[2026-11-21 Go clean command 3](../../study-results/Go/2026-11-21%20Go%20clean%20command%203.md)'
  - '[2026-11-21 Go clean command 4](../../study-results/Go/2026-11-21%20Go%20clean%20command%204.md)'
  - '[2026-11-21 Go clean command 5](../../study-results/Go/2026-11-21%20Go%20clean%20command%205.md)'
  - '[2026-11-21 Go clean command 6](../../study-results/Go/2026-11-21%20Go%20clean%20command%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: go clean has documented flags for each cache; the module cache is read-only so plain rm
    -rf fails, while the build cache is also trimmed automatically.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Go](../../stores/Go.md)'
subject: '[Clean command](../../subjects/clean/Clean%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

go clean has documented flags for each cache; the module cache is read-only so plain rm -rf fails, while the build cache is also trimmed automatically.

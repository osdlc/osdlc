---
proposition:
  subject: '[Go](../../stores/Go.md)'
  predicate: inventory/command
  object:
    supported: true
    commands:
    - command: go env GOCACHE
      shows: the current build cache directory
    - command: go env GOCACHE GOMODCACHE
      shows: the build cache and module cache directories, one per line
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Go inventory command 1](../../study-results/Go/2026-11-21%20Go%20inventory%20command%201.md)'
  - '[2026-11-21 Go inventory command 2](../../study-results/Go/2026-11-21%20Go%20inventory%20command%202.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: go env reports where the caches are; the docs give no command that lists cache contents
    or sizes.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Go](../../stores/Go.md)'
subject: '[Inventory command](../../subjects/inventory/Inventory%20command.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No go subcommand that reports cache sizes is documented.
---

go env reports where the caches are; the docs give no command that lists cache contents or sizes.

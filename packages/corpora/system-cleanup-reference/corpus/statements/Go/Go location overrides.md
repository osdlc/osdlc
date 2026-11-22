---
proposition:
  subject: '[Go](../../stores/Go.md)'
  predicate: location/override
  object:
    vars:
    - GOCACHE
    - GOMODCACHE
    - GOPATH
    settings:
    - go env -w
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Go location overrides 1](../../study-results/Go/2026-11-21%20Go%20location%20overrides%201.md)'
  - '[2026-11-21 Go location overrides 2](../../study-results/Go/2026-11-21%20Go%20location%20overrides%202.md)'
  - '[2026-11-21 Go location overrides 3](../../study-results/Go/2026-11-21%20Go%20location%20overrides%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: GOCACHE moves the build cache, GOMODCACHE moves the module cache, GOPATH moves both the
    module cache and installed binaries.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Go](../../stores/Go.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The quotes do not show that `go env -w` persists these variables; it is listed as the go command's settings
  mechanism without a quote here.
---

GOCACHE moves the build cache, GOMODCACHE moves the module cache, GOPATH moves both the module cache and installed binaries.

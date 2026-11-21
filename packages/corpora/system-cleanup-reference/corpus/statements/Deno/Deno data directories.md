---
proposition:
  subject: '[Deno](../../stores/Deno.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: macos
      path: ~/Library/Caches/deno
      holds: cache
      rebuild: re-download
    - platform: linux
      path: $XDG_CACHE_HOME/deno
      holds: cache
      rebuild: re-download
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Deno data directories 1](../../study-results/Deno/2026-11-21%20Deno%20data%20directories%201.md)'
  - '[2026-11-21 Deno data directories 2](../../study-results/Deno/2026-11-21%20Deno%20data%20directories%202.md)'
  - '[2026-11-21 Deno data directories 3](../../study-results/Deno/2026-11-21%20Deno%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: Deno resolves DENO_DIR to $XDG_CACHE_HOME/deno, else the OS cache dir plus deno; the deno
    info example shows the macOS result.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Deno](../../stores/Deno.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- No source spells out the Linux default without XDG_CACHE_HOME (expected ~/.cache/deno) or the Windows
  default.
---

Deno resolves DENO_DIR to $XDG_CACHE_HOME/deno, else the OS cache dir plus deno; the deno info example shows the macOS result.

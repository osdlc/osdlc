---
proposition:
  subject: '[Zig](../../stores/Zig.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: .zig-cache
      marker: build.zig
      holds: cache
      rebuild: rebuild
    - path: zig-out
      marker: build.zig
      holds: build-output
      rebuild: rebuild
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Zig build directories 1](../../study-results/Zig/2026-11-21%20Zig%20build%20directories%201.md)'
  - '[2026-11-21 Zig build directories 2](../../study-results/Zig/2026-11-21%20Zig%20build%20directories%202.md)'
  - '[2026-11-21 Zig build directories 3](../../study-results/Zig/2026-11-21%20Zig%20build%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The build-system guide names both generated directories and says .zig-cache can be deleted
    at any time; the source places .zig-cache next to build.zig.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Zig](../../stores/Zig.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- zig-out is an installation prefix; the guide does not say it is safe to delete, though zig build regenerates
  it.
---

The build-system guide names both generated directories and says .zig-cache can be deleted at any time; the source places .zig-cache next to build.zig.

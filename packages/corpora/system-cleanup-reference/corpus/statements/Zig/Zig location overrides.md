---
proposition:
  subject: '[Zig](../../stores/Zig.md)'
  predicate: location/override
  object:
    vars:
    - ZIG_GLOBAL_CACHE_DIR
    - ZIG_LOCAL_CACHE_DIR
    - XDG_CACHE_HOME
    settings:
    - --global-cache-dir
    - --cache-dir
    - --prefix
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Zig location overrides 1](../../study-results/Zig/2026-11-21%20Zig%20location%20overrides%201.md)'
  - '[2026-11-21 Zig location overrides 2](../../study-results/Zig/2026-11-21%20Zig%20location%20overrides%202.md)'
  - '[2026-11-21 Zig location overrides 3](../../study-results/Zig/2026-11-21%20Zig%20location%20overrides%203.md)'
  - '[2026-11-21 Zig location overrides 4](../../study-results/Zig/2026-11-21%20Zig%20location%20overrides%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The source reads these variables and main.zig's help text documents the cache-dir flags;
    the build-system guide documents --prefix for zig-out.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Zig](../../stores/Zig.md)'
subject: '[Location overrides](../../subjects/location/Location%20overrides.md)'
scope:
  since: null
  until: null
  platform: []
status: current
---

The source reads these variables and main.zig's help text documents the cache-dir flags; the build-system guide documents --prefix for zig-out.

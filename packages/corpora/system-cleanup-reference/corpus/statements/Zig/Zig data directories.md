---
proposition:
  subject: '[Zig](../../stores/Zig.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/.cache/zig
      holds: cache
      rebuild: rebuild
    - platform: macos
      path: ~/.cache/zig
      holds: cache
      rebuild: rebuild
    - platform: windows
      path: '%LOCALAPPDATA%\zig'
      holds: cache
      rebuild: rebuild
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Zig data directories 1](../../study-results/Zig/2026-11-21%20Zig%20data%20directories%201.md)'
  - '[2026-11-21 Zig data directories 2](../../study-results/Zig/2026-11-21%20Zig%20data%20directories%202.md)'
  - '[2026-11-21 Zig data directories 3](../../study-results/Zig/2026-11-21%20Zig%20data%20directories%203.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: resolveGlobalCacheDir in the standard library uses ZIG_GLOBAL_CACHE_DIR, then on Windows
    LOCALAPPDATA\zig, else $XDG_CACHE_HOME/zig, else $HOME/.cache/zig.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Zig](../../stores/Zig.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The global cache also holds fetched package sources, which must be re-downloaded rather than rebuilt;
  no source documents its subfolder layout.
---

resolveGlobalCacheDir in the standard library uses ZIG_GLOBAL_CACHE_DIR, then on Windows LOCALAPPDATA\zig, else $XDG_CACHE_HOME/zig, else $HOME/.cache/zig.

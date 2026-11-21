---
kind: source
store: '[Zig](../../stores/Zig.md)'
observed: '2026-11-21'
locator: resolveSuitableLocalCacheDir
reportedIn:
- '[lib std zig.zig](../../documents/Zig%20Software%20Foundation/lib%20std%20zig.zig.md)'
excerpt:
  exact: /// Searches upwards from `cwd` for a directory containing a `build.zig` file.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

lib std zig.zig (https://codeberg.org/ziglang/zig/raw/branch/master/lib/std/zig.zig) says, under resolveSuitableLocalCacheDir:

> /// Searches upwards from `cwd` for a directory containing a `build.zig` file.

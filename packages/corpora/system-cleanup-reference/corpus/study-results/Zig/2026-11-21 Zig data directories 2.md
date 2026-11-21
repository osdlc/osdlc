---
kind: source
store: '[Zig](../../stores/Zig.md)'
observed: '2026-11-21'
locator: resolveGlobalCacheDir
reportedIn:
- '[lib std zig.zig](../../documents/Zig%20Software%20Foundation/lib%20std%20zig.zig.md)'
excerpt:
  exact: return Dir.path.join(arena, &.{ local_app_data_dir, app_name });
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

lib std zig.zig (https://codeberg.org/ziglang/zig/raw/branch/master/lib/std/zig.zig) says, under resolveGlobalCacheDir:

> return Dir.path.join(arena, &.{ local_app_data_dir, app_name });

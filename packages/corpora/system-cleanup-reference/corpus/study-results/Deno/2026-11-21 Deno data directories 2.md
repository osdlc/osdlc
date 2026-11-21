---
kind: source
store: '[Deno](../../stores/Deno.md)'
observed: '2026-11-21'
locator: resolve_deno_dir
reportedIn:
- '[libs cache_dir deno_dir.rs](../../documents/Deno/libs%20cache_dir%20deno_dir.rs.md)'
excerpt:
  exact: Cow::Owned(xdg_cache_dir.join("deno"))
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

libs cache_dir deno_dir.rs (https://raw.githubusercontent.com/denoland/deno/main/libs/cache_dir/deno_dir.rs) says, under resolve_deno_dir:

> Cow::Owned(xdg_cache_dir.join("deno"))

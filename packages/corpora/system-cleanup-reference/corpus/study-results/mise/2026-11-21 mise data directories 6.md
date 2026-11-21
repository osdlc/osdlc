---
kind: source
store: '[mise](../../stores/mise.md)'
observed: '2026-11-21'
locator: '[download_cache]'
reportedIn:
- '[mise settings.toml](../../documents/mise/mise%20settings.toml.md)'
excerpt:
  exact: mise keeps finished downloads in `$MISE_CACHE_DIR/downloads-cas`, named by their hash
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

mise settings.toml (https://raw.githubusercontent.com/jdx/mise/main/settings.toml) says, under [download_cache]:

> mise keeps finished downloads in `$MISE_CACHE_DIR/downloads-cas`, named by their hash

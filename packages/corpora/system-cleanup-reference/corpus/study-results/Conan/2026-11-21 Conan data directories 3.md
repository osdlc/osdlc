---
kind: source
store: '[Conan](../../stores/Conan.md)'
observed: '2026-11-21'
locator: PkgCache
reportedIn:
- '[Conan cache.py](../../documents/Conan/Conan%20cache.py.md)'
excerpt:
  exact: os.path.join(cache_folder, "p")
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Conan cache.py (https://raw.githubusercontent.com/conan-io/conan/develop2/conan/internal/cache/cache.py) says, under PkgCache:

> os.path.join(cache_folder, "p")

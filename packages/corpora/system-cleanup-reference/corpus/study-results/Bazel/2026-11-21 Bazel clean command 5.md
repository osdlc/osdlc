---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: Garbage collection
reportedIn:
- '[Remote Caching](../../documents/Bazel/Remote%20Caching.md)'
excerpt:
  exact: Starting with Bazel 7.4, you can use --experimental_disk_cache_gc_max_size and --experimental_disk_cache_gc_max_age
    to set a maximum size for the disk cache or for the age of individual cache entries.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Remote Caching (https://bazel.build/remote/caching) says, under Garbage collection:

> Starting with Bazel 7.4, you can use --experimental_disk_cache_gc_max_size and --experimental_disk_cache_gc_max_age to set a maximum size for the disk cache or for the age of individual cache entries.

---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: Repository cache
reportedIn:
- '[Build programs with Bazel](../../documents/Bazel/Build%20programs%20with%20Bazel.md)'
excerpt:
  exact: bazel caches all files downloaded in the repository cache which, by default, is located at ~/.cache/bazel/_bazel_$USER/cache/repos/v1/
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Build programs with Bazel (https://bazel.build/run/build) says, under Repository cache:

> bazel caches all files downloaded in the repository cache which, by default, is located at ~/.cache/bazel/_bazel_$USER/cache/repos/v1/

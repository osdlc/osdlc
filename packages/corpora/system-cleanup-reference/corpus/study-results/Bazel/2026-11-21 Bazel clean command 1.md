---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: bazel clean
reportedIn:
- '[Output Directory Layout](../../documents/Bazel/Output%20Directory%20Layout.md)'
excerpt:
  exact: bazel clean clears the on-disk action cache and then removes the entire execroot directory (which
    contains the symlink forest and all build outputs).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Output Directory Layout (https://bazel.build/remote/output-directories) says, under bazel clean:

> bazel clean clears the on-disk action cache and then removes the entire execroot directory (which contains the symlink forest and all build outputs).

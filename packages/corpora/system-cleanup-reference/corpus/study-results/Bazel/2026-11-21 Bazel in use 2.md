---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: --[no]block_for_lock
reportedIn:
- '[Commands and Options](../../documents/Bazel/Commands%20and%20Options.md)'
excerpt:
  exact: If enabled, Bazel will wait for other Bazel commands holding the server lock to complete before
    progressing.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Commands and Options (https://bazel.build/docs/user-manual) says, under --[no]block_for_lock:

> If enabled, Bazel will wait for other Bazel commands holding the server lock to complete before progressing.

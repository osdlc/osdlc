---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: --max_idle_secs=n
reportedIn:
- '[Commands and Options](../../documents/Bazel/Commands%20and%20Options.md)'
excerpt:
  exact: This option specifies how long, in seconds, the Bazel server process should wait after the last
    client request, before it exits. The default value is 10800 (3 hours).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Commands and Options (https://bazel.build/docs/user-manual) says, under --max_idle_secs=n:

> This option specifies how long, in seconds, the Bazel server process should wait after the last client request, before it exits. The default value is 10800 (3 hours).

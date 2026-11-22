---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: The clean command
reportedIn:
- '[Commands and Options](../../documents/Bazel/Commands%20and%20Options.md)'
excerpt:
  exact: the clean command simply removes the entire output base tree which, in addition to the build
    output, contains all temp files created by Bazel. It also stops the Bazel server after the clean,
    equivalent to the shutdown command.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Commands and Options (https://bazel.build/docs/user-manual) says, under The clean command:

> the clean command simply removes the entire output base tree which, in addition to the build output, contains all temp files created by Bazel. It also stops the Bazel server after the clean, equivalent to the shutdown command.

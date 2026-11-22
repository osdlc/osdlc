---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: Current layout
reportedIn:
- '[Output Directory Layout](../../documents/Bazel/Output%20Directory%20Layout.md)'
excerpt:
  exact: The symlinks for “bazel-<workspace-name>”, “bazel-out”, “bazel-testlogs”, and “bazel-bin” are
    put in the workspace directory; these symlinks point to some directories inside a target-specific
    directory inside the output directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Output Directory Layout (https://bazel.build/remote/output-directories) says, under Current layout:

> The symlinks for “bazel-<workspace-name>”, “bazel-out”, “bazel-testlogs”, and “bazel-bin” are put in the workspace directory; these symlinks point to some directories inside a target-specific directory inside the output directory.

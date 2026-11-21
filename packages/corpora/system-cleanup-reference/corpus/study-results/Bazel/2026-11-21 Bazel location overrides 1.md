---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: Current layout
reportedIn:
- '[Output Directory Layout](../../documents/Bazel/Output%20Directory%20Layout.md)'
excerpt:
  exact: If the environment variable $XDG_CACHE_HOME is set on Linux, macOS, or Windows, the value ${XDG_CACHE_HOME}/bazel
    will override the default.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Output Directory Layout (https://bazel.build/remote/output-directories) says, under Current layout:

> If the environment variable $XDG_CACHE_HOME is set on Linux, macOS, or Windows, the value ${XDG_CACHE_HOME}/bazel will override the default.

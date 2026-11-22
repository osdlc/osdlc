---
kind: docs
store: '[Bazel](../../stores/Bazel.md)'
observed: '2026-11-21'
locator: Current layout
reportedIn:
- '[Output Directory Layout](../../documents/Bazel/Output%20Directory%20Layout.md)'
excerpt:
  exact: The outputRoot directory defaults to ~/.cache/bazel on Linux, ~/Library/Caches/bazel on macOS
    (when using Bazel 9 and newer), and on Windows it defaults to %HOME% if set, else %USERPROFILE% if
    set, else the result of calling SHGetKnownFolderPath() with the FOLDERID_Profile flag set.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Output Directory Layout (https://bazel.build/remote/output-directories) says, under Current layout:

> The outputRoot directory defaults to ~/.cache/bazel on Linux, ~/Library/Caches/bazel on macOS (when using Bazel 9 and newer), and on Windows it defaults to %HOME% if set, else %USERPROFILE% if set, else the result of calling SHGetKnownFolderPath() with the FOLDERID_Profile flag set.

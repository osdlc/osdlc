---
kind: docs
store: '[Kotlin Native](../../stores/Kotlin%20Native.md)'
observed: '2026-11-21'
locator: Preserve downloaded and cached components between builds
reportedIn:
- '[Tips for improving compilation time Kotlin](../../documents/JetBrains/Tips%20for%20improving%20compilation%20time%20Kotlin.md)'
excerpt:
  exact: When compiling projects, Kotlin/Native downloads the required components and caches some results
    of its work to the $USER_HOME/.konan directory.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Tips for improving compilation time Kotlin (https://kotlinlang.org/docs/native-improving-compilation-time.html) says, under Preserve downloaded and cached components between builds:

> When compiling projects, Kotlin/Native downloads the required components and caches some results of its work to the $USER_HOME/.konan directory.

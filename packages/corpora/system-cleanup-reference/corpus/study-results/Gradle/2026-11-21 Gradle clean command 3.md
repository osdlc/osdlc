---
kind: docs
store: '[Gradle](../../stores/Gradle.md)'
observed: '2026-11-21'
locator: Gradle User Home cleanup
version: 9.9.2
version_basis: exact
reportedIn:
- '[Gradle-managed Directories and Caches](../../documents/Gradle/Gradle-managed%20Directories%20and%20Caches.md)'
excerpt:
  exact: Gradle distributions in wrapper/dists/ are checked for whether they are still in use
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Gradle-managed Directories and Caches (https://docs.gradle.org/current/userguide/directory_layout.html) says, under Gradle User Home cleanup:

> Gradle distributions in wrapper/dists/ are checked for whether they are still in use

---
kind: docs
store: '[Gradle](../../stores/Gradle.md)'
observed: '2026-11-21'
locator: Cache locking
version: 9.9.2
version_basis: exact
reportedIn:
- '[Dependency Caching](../../documents/Gradle/Dependency%20Caching.md)'
excerpt:
  exact: The Gradle dependency cache uses file-based locking to ensure that it can safely be used by multiple
    Gradle processes concurrently.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Dependency Caching (https://docs.gradle.org/current/userguide/dependency_caching.html) says, under Cache locking:

> The Gradle dependency cache uses file-based locking to ensure that it can safely be used by multiple Gradle processes concurrently.

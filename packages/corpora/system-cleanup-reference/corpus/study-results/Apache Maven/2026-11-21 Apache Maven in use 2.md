---
kind: docs
store: '[Apache Maven](../../stores/Apache%20Maven.md)'
observed: '2026-11-21'
locator: Named lock implementations
reportedIn:
- '[Named Locks - Maven Resolver](../../documents/Apache%20Maven/Named%20Locks%20-%20Maven%20Resolver.md)'
excerpt:
  exact: The file-lock implementation uses file system advisory file locking, hence, concurrently running
    Maven processes set up to use file-lock implementation can safely share one local repository.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Named Locks - Maven Resolver (https://maven.apache.org/resolver/maven-resolver-named-locks/index.html) says, under Named lock implementations:

> The file-lock implementation uses file system advisory file locking, hence, concurrently running Maven processes set up to use file-lock implementation can safely share one local repository.

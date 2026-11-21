---
kind: docs
store: '[Stack](../../stores/Stack.md)'
observed: '2026-11-21'
locator: setup-exe-cache directory
version: stable
version_basis: exact
reportedIn:
- '[Stack root - Stack](../../documents/Stack%20contributors/Stack%20root%20-%20Stack.md)'
excerpt:
  exact: If the contents of the directory are deleted, and Stack needs the executable, then Stack will
    seek to rebuild it.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Stack root - Stack (https://docs.haskellstack.org/en/stable/topics/stack_root/) says, under setup-exe-cache directory:

> If the contents of the directory are deleted, and Stack needs the executable, then Stack will seek to rebuild it.

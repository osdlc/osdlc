---
kind: docs
store: '[Nix](../../stores/Nix.md)'
observed: '2026-11-21'
locator: Description
version: 2.36.0
version_basis: exact
reportedIn:
- '[nix-store --gc - Nix 2.36.0 Reference Manual](../../documents/Nix/nix-store%20--gc%20-%20Nix%202.36.0%20Reference%20Manual.md)'
excerpt:
  exact: That is, all paths in the Nix store not reachable via file system references from a set of “roots”,
    are deleted.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

nix-store --gc - Nix 2.36.0 Reference Manual (https://nix.dev/manual/nix/latest/command-ref/nix-store/gc) says, under Description:

> That is, all paths in the Nix store not reachable via file system references from a set of “roots”, are deleted.

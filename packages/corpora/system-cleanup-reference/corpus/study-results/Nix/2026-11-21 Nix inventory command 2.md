---
kind: docs
store: '[Nix](../../stores/Nix.md)'
observed: '2026-11-21'
locator: --print-dead
version: 2.36.0
version_basis: exact
reportedIn:
- '[nix-store --gc - Nix 2.36.0 Reference Manual](../../documents/Nix/nix-store%20--gc%20-%20Nix%202.36.0%20Reference%20Manual.md)'
excerpt:
  exact: 'This operation prints out on standard output the set of “dead” store paths, which is just the
    opposite of the set of live paths: any path in the store that is not live (with respect to the roots)
    is dead.'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

nix-store --gc - Nix 2.36.0 Reference Manual (https://nix.dev/manual/nix/latest/command-ref/nix-store/gc) says, under --print-dead:

> This operation prints out on standard output the set of “dead” store paths, which is just the opposite of the set of live paths: any path in the store that is not live (with respect to the roots) is dead.

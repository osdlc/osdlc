---
kind: docs
store: '[Nix](../../stores/Nix.md)'
observed: '2026-11-21'
locator: Description
version: 2.36.0
version_basis: exact
reportedIn:
- '[nix store optimise - Nix 2.36.0 Reference Manual](../../documents/Nix/nix%20store%20optimise%20-%20Nix%202.36.0%20Reference%20Manual.md)'
excerpt:
  exact: 'This command deduplicates the Nix store: it scans the store for regular files with identical
    contents, and replaces them with hard links to a single instance.'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

nix store optimise - Nix 2.36.0 Reference Manual (https://nix.dev/manual/nix/latest/command-ref/new-cli/nix3-store-optimise) says, under Description:

> This command deduplicates the Nix store: it scans the store for regular files with identical contents, and replaces them with hard links to a single instance.

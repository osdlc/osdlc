---
slug: nix
category: os-package-manager
vendor: NixOS Foundation
homepage: https://nixos.org
docs: https://nix.dev/manual/nix/latest/
repository: https://github.com/NixOS/nix
license: LGPL-2.1-only
open_source: true
platforms:
- linux
- macos
cli: nix
system: true
checked: '2026-11-21'
sources:
- '[Common Environment Variables - Nix 2.36.0 Reference Manual](../documents/Nix/Common%20Environment%20Variables%20-%20Nix%202.36.0%20Reference%20Manual.md)'
- '[nix-collect-garbage - Nix 2.36.0 Reference Manual](../documents/Nix/nix-collect-garbage%20-%20Nix%202.36.0%20Reference%20Manual.md)'
- '[nix store optimise - Nix 2.36.0 Reference Manual](../documents/Nix/nix%20store%20optimise%20-%20Nix%202.36.0%20Reference%20Manual.md)'
- '[nix-store --gc - Nix 2.36.0 Reference Manual](../documents/Nix/nix-store%20--gc%20-%20Nix%202.36.0%20Reference%20Manual.md)'
- '[nix-env --list-generations - Nix 2.36.0 Reference Manual](../documents/Nix/nix-env%20--list-generations%20-%20Nix%202.36.0%20Reference%20Manual.md)'
- '[nix-daemon - Nix 2.36.0 Reference Manual](../documents/Nix/nix-daemon%20-%20Nix%202.36.0%20Reference%20Manual.md)'
---

Nix is a functional package manager (and the base of NixOS) that keeps every package in the immutable /nix/store. The store grows with each profile generation and build, and nothing is freed until old generations are deleted and the garbage collector removes unreachable paths. On multi-user installs the store is owned by root and the nix-daemon, so system-wide collection needs root.

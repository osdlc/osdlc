---
id: T-01
type: task
state: open
created: 2026-11-22
---

# T-01: An option to not follow symlinks out of the vault

## Goal

A caller that scans a vault it did not write can stop the scan from reading files outside the
vault root, without checking the vault's links itself.

## Today

`scanVault` follows every symbolic link ([D-07](../decisions/D-07-symlink-policy.md)), and
the only protection is to scan vaults you trust.

## Approach

1. Add an option to `ScanOptions` that skips a link whose real path is outside the root. Decide
   its name and default with the first consumer that asks for it.
2. Test it with a link to a folder and to a file outside the root.
3. Update the README and SECURITY.md.

## Acceptance criteria

- [ ] With the option set, no file outside the root is indexed.
- [ ] Without it, behaviour is unchanged.

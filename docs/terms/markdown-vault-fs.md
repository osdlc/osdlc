# markdown-vault-fs

Status: current, changing.

The vault layer over [vfs-walk](vfs-walk.md): notes versus attachments, visibility presets, the `_system/` rules and [excluded files](excluded-files.md) ([D-DUFX](../decisions/D-DUFX-vfs-walk-and-vault-layer.md)).

## In code

`packages/rust/markdown-vault-fs`: `walk` (the vault rules, passed to `vfs-walk` as its filter), `hide`, `path`, and `stat` re-exported from `vfs-walk`.

## Not to be confused with

[markdown-vault](markdown-vault.md), the vault model built on this walk.

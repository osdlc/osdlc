# markdown-vault-fs

Status: current, changing.

The [corpus](corpus.md) layer over [vfs-walk](vfs-walk.md): notes versus attachments, visibility presets, the `_system/` rules and [excluded files](excluded-files.md) ([D-DUFX](../decisions/D-DUFX-vfs-walk-and-vault-layer.md)).

## In code

`packages/rust/markdown-vault-fs`: `walk` (the corpus rules, passed to `vfs-walk` as its filter, and `WalkOptions::admission` for one path), `hide`, `path`, and `stat` re-exported from `vfs-walk`.

## Not to be confused with

[markdown-corpus](markdown-corpus.md), the corpus model built on this walk.

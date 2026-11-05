# vfs-walk

Status: current.

The crate that walks a folder tree through [vfs-seam](vfs-seam.md): sorted entries, prune and skip lists, an entry filter, a symlink policy, an error policy and modification times. It knows nothing about Markdown or vaults; callers pass their rules in ([D-DUFX](../decisions/D-DUFX-vfs-walk-and-vault-layer.md)).

## In code

`packages/rust/vfs-walk`: `walk` and `walk_subtree`, with `WalkOptions` (`skip_names`, `prune_dirs`, `filter`, `symlinks`, `errors`), `Entry` (with `mtime_ns`), and `stat`. Split out of `markdown-vault-fs`.

## Not to be confused with

[markdown-vault-fs](markdown-vault-fs.md), the vault layer on top of it.

# vfs-seam

Status: current.

The crate that holds the `Vfs` file-access trait and its backends, so the same code runs on disk, in memory, as a dry-run preview and in a JS host ([D-JPYM](../decisions/D-JPYM-vfs-seam.md)).

## In code

`packages/rust/vfs-seam`: `Vfs`, `Metadata`, `NativeVfs`, `MemVfs`, `PreviewVfs`, `Clock`, `SystemClock`, `FixedClock`, `VfsError`.

## Not to be confused with

The `vfs` crate on crates.io, which this is not built on. [vfs-walk](vfs-walk.md), which walks a tree through this trait.

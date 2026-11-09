# vfs-seam

Status: current.

The crate that holds the `Vfs` file-access trait and its backends, so the same code runs on disk, in memory, as a dry-run preview and in a JS host ([D-JPYM](../decisions/D-JPYM-vfs-seam.md)).

## In code

`packages/rust/vfs-seam`: `Vfs`, `Metadata`, `NativeVfs`, `MemVfs`, `PreviewVfs`, `Clock`, `SystemClock`, `FixedClock`, `VfsError`, `ns_to_ms`, `ns_to_ms_f64`, `ms_f64_to_ns`.

`Metadata::modified_ns` is a file's modification time in nanoseconds since the epoch. `Metadata::modified_ms_f64` gives the fractional milliseconds node reports as `mtimeMs`, computed as node computes it. `ms_f64_to_ns` turns an `mtimeMs` from a JS host back into nanoseconds.

## Not to be confused with

The `vfs` crate on crates.io, which this is not built on. [vfs-walk](vfs-walk.md), which walks a tree through this trait.

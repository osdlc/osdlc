# D-JPYM: All file access goes through `vfs-seam`

Accepted 2026-11-04. Part of
[D-YRKH](D-YRKH-one-implementation-per-vault-concept.md).

## Decision

- **New crate `vfs-seam`:** the `Vfs` trait and its backends (native,
  in-memory, preview) plus a `Clock`. Nothing else.
- **Every vault crate reads and writes only through it:** `vfs-walk`,
  `markdown-vault-fs`, `markdown-corpus` and `markdown-relink`'s planning.
  Native forms stay for existing callers.
- **It builds for wasm.** `NativeVfs` and `SystemClock` sit behind the
  default `native` feature. The trait is not bound by `Send` or `Sync`, so
  a JS host can implement it.

## Why

The vault crates called `std::fs`, so code that must also run as wasm (a
browser or an editor plugin) kept its own copies. A trait lets the same code
run on disk, in memory for tests, as a dry-run preview and in a JS host.

## Options rejected

- The `vfs` crate: no symlinks, no execute bit, and it requires
  `Send + Sync + 'static`, which a JS host cannot meet.
- Putting the walk or other helpers in this crate: every crate depends on
  the trait, so it should change rarely ([D-DUFX](D-DUFX-vfs-walk-and-vault-layer.md)).

## Consequences

- Tests use `MemVfs` and `FixedClock` instead of temp dirs and sleeps.
- Writes that need compare-and-swap (`etag-write`) stay native.

## Reopen if

A host cannot implement the trait, for example a fully async file API.

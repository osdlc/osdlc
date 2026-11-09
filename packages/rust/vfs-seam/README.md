# vfs-seam

A file-access trait for Rust libraries that must also run where there is no
filesystem.

A library that reads files through `std::fs` compiles for
`wasm32-unknown-unknown` and then fails at runtime, because that target has no
filesystem. vfs-seam moves the I/O behind one object-safe trait, `Vfs`. The
library takes a `&dyn Vfs`; the host decides what answers it: a disk, a tree
in memory, or a JavaScript object behind a wasm bridge.

- `Vfs`: read, list, stat, write, create, rename and remove, plus the link
  questions (`canonicalize`, `read_link`, `is_symlink`) with lexical defaults.
  It is not bound by `Send` or `Sync`, so a JavaScript-backed host can
  implement it.
- `NativeVfs`: `std::fs` (the `native` feature, on by default).
- `MemVfs`: a tree in memory, as strict as `std::fs` about missing parents and
  occupied destinations. Each write moves the file's modification time, and a
  test can set one by hand.
- `Metadata`: a file's size and its modification time in nanoseconds, which
  is exact and compares exactly. `modified_ms_f64` turns it into the
  fractional milliseconds node reports as `mtimeMs`, with node's arithmetic.
  `ms_f64_to_ns` goes the other way, for a JS host that is given `mtimeMs`.
- `PreviewVfs`: wraps another `Vfs`, reads through it, and captures writes,
  renames and removals instead of doing them. A dry run reports what it
  captured.
- `Clock`, `SystemClock` (native) and `FixedClock`: the current time for a
  cache with a time-to-live, which `wasm32-unknown-unknown` cannot read
  itself.

## Install

```sh
cargo add vfs-seam
```

For `wasm32-unknown-unknown`, turn the `native` feature off:

```sh
cargo add vfs-seam --no-default-features
```

## Quick start

```rust
use std::path::Path;
use vfs_seam::{MemVfs, Vfs};

fn word_count(vfs: &dyn Vfs, path: &Path) -> vfs_seam::Result<usize> {
    let bytes = vfs.read_file(path)?;
    Ok(String::from_utf8_lossy(&bytes).split_whitespace().count())
}

let vfs = MemVfs::new();
vfs.insert("/vault/a.md", "one two three")?;
assert_eq!(word_count(&vfs, Path::new("/vault/a.md"))?, 3);
# Ok::<(), vfs_seam::VfsError>(())
```

On a native host, pass `&vfs_seam::NativeVfs` instead.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and
are listed in the [changelog](CHANGELOG.md).

## Platforms

Linux, macOS and Windows with the `native` feature, and
`wasm32-unknown-unknown` without it. The only dependency is `thiserror`. The
minimum supported Rust version is 1.89.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

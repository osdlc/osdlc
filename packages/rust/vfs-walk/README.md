# vfs-walk

Walk a folder tree through a [`vfs-seam`](https://crates.io/crates/vfs-seam)
`Vfs`, so the same walk runs on a disk, in an in-memory tree in tests, and in
a `wasm32-unknown-unknown` host.

It knows nothing about Markdown or vaults. The caller passes its rules in:

- `skip_names`: names dropped wherever they appear, such as `.DS_Store`.
- `prune_dirs`: folders never entered, such as `.git` or `node_modules`.
- `filter`: the caller's test on each file and folder by its relative path,
  asked before any stat. A folder it refuses is not entered. Rules such as a
  vault's excluded files (Obsidian's `userIgnoreFilters`, for example) get in
  here.
- `symlinks`: list a symlink as a file (the default), skip it, or refuse it
  with an error. A symlinked folder is never entered.
- `errors`: skip a folder that cannot be listed or a file that cannot be
  statted (the default), skip it and report it, or fail the walk.

Entries come back depth first, sorted by name within each folder (`String`
byte order), with the size and modification time from one stat each. The
`stat` module also has Node's `statSync()` millisecond floats for native
callers.

## Install

```sh
cargo add vfs-walk
```

For a native host, also turn on `vfs-seam`'s `native` feature to get
`NativeVfs`:

```sh
cargo add vfs-seam --features native
```

## Quick start

```rust
use std::path::Path;
use vfs_walk::vfs_seam::MemVfs;
use vfs_walk::{Candidate, WalkOptions, walk};

let vfs = MemVfs::new();
vfs.insert("/tree/a.md", "# A")?;
vfs.insert("/tree/b.tmp", "")?;
vfs.insert("/tree/node_modules/x.js", "")?;

let no_tmp = |c: &Candidate<'_>| c.is_dir || !c.name.ends_with(".tmp");
let opts = WalkOptions {
    prune_dirs: vec!["node_modules".into()],
    filter: Some(&no_tmp),
    ..Default::default()
};
let entries = walk(&vfs, Path::new("/tree"), &opts)?;
assert_eq!(entries.len(), 1);
assert_eq!(entries[0].rel, "a.md");
# Ok::<(), Box<dyn std::error::Error>>(())
```

On a native host, pass `&vfs_seam::NativeVfs` instead.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and
are listed in the [changelog](CHANGELOG.md).

## Platforms

Linux, macOS and Windows, and `wasm32-unknown-unknown`. Two dependencies:
`vfs-seam` and `thiserror`. The minimum supported Rust version is 1.89.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

# markdown-vault-fs

Filesystem primitives for a folder of Markdown notes (a "vault"). Every read
goes through a [`vfs-seam`](https://crates.io/crates/vfs-seam) `Vfs`, so the
same walk runs on a disk, in an in-memory tree in tests, and in a
`wasm32-unknown-unknown` host. None of the modules parses YAML or Markdown:

- `walk` — walk the vault under a visibility policy. `ContentNotes` skips
  dot- and underscore-prefixed entries, `IncludingUnderscore` skips only
  dot-prefixed ones, and `Everything` skips only `.git`. Optional roots scope
  the walk to subtrees. The vault's excluded files are dropped on top of the
  policy by default, except under `Everything`; `WalkOptions::hide` passes
  other rules or turns them off. Options also refuse symlinks, fail on read
  errors, skip names such as `.DS_Store`, and prune folders such as
  `node_modules`. Entries come back in name order (`String` byte order),
  depth first.
- `hide` — excluded files in Obsidian's `userIgnoreFilters` syntax: a
  case-insensitive path prefix, or a case-insensitive regex written `/.../`.
  `hide::load` reads the list from `.obsidian/app.json`.
- `path` — the `_system/` rules, plus a re-export of the
  `path-guard` containment guard for a vault-relative path
  from a client. The guard rejects bad paths lexically (absolute, `..`, empty
  segments), then checks containment against the canonicalized vault root, so
  a symlink cannot escape it.
- `stat` — a file's modification time through a `Vfs`, and, for native
  callers, millisecond floats in the shape Node's `statSync()` reports.
- `native` — the walk over the real filesystem, one line each (the default
  `native` feature).

## Install

```sh
cargo add markdown-vault-fs
```

## Quick start

```rust
use std::path::Path;
use markdown_vault_fs::{Guard, WalkOptions, native, walk};
use markdown_vault_fs::vfs_seam::MemVfs;

let vault = Path::new("/path/to/vault");

// Every visible `.md` note, vault-relative and `/`-separated.
for entry in native::walk(vault, &WalkOptions::content_notes())? {
    println!("{} ({} bytes)", entry.rel, entry.size);
}

// The same walk over any other `Vfs`, such as a tree in memory.
let mem = MemVfs::new();
mem.insert("/vault/a.md", "# A")?;
let entries = walk(&mem, Path::new("/vault"), &WalkOptions::content_notes())?;
assert_eq!(entries[0].rel, "a.md");

// A client-supplied path, validated and resolved inside the vault.
let guard = Guard::std();
let abs = guard.resolve(vault, "Projects/Alpha.md")?;
assert!(guard.resolve(vault, "../etc/passwd").is_err());
```

Five dependencies: `vfs-seam`, `path-guard`, `regex`, `serde_json` and
`thiserror`.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and are listed in the [changelog](CHANGELOG.md).

## Platforms

Tested on Linux, macOS and Windows. Without the `native` feature it builds
for `wasm32-unknown-unknown`. The minimum supported Rust version is 1.89.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

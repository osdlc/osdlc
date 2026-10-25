# markdown-vault-fs

Filesystem primitives for a folder of Markdown notes (a "vault"). Four
modules, none of which parses YAML or Markdown:

- `walk` — walk the vault under a visibility policy. `ContentNotes` skips
  dot- and underscore-prefixed entries, `IncludingUnderscore` skips only
  dot-prefixed ones, and `Everything` skips only `.git`. Optional roots scope
  the walk to subtrees. `WalkOptions::hide` drops the vault's excluded files
  on top of the policy, except under `Everything`.
- `hide` — excluded files in Obsidian's `userIgnoreFilters` syntax: a
  case-insensitive path prefix, or a case-insensitive regex written `/.../`.
  It compiles and matches the list; reading it from the vault is the caller's
  job.
- `path` — the `_system/` rules, plus a re-export of the
  `path-guard` containment guard for a vault-relative path
  from a client. The guard rejects bad paths lexically (absolute, `..`, empty
  segments), then checks containment against the canonicalized vault root, so
  a symlink cannot escape it.
- `stat` — file timestamps as millisecond floats, the shape Node's
  `statSync()` reports.

## Install

```sh
cargo add markdown-vault-fs
```

## Use

```rust
use std::path::Path;
use markdown_vault_fs::{Guard, WalkOptions, walk};

let vault = Path::new("/path/to/vault");

// Every visible `.md` note, vault-relative and `/`-separated.
for entry in walk(vault, &WalkOptions::content_notes()) {
    println!("{} ({} bytes)", entry.rel, entry.size);
}

// A client-supplied path, validated and resolved inside the vault.
let guard = Guard::std();
let abs = guard.resolve(vault, "Projects/Alpha.md")?;
assert!(guard.resolve(vault, "../etc/passwd").is_err());
```

Three dependencies: `walkdir`, `path-guard` and `regex`.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and are listed in the [changelog](CHANGELOG.md).

## Platforms

The code uses only the standard library, `walkdir`, `regex` and `path-guard`. It is written for Linux, macOS and Windows, and the path guard is tested on all three. The minimum supported Rust version is 1.89.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

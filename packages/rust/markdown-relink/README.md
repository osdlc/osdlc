# markdown-relink

Rename or move a note in a Markdown vault without breaking the links that
point at it. Renaming a note is a file move plus a rewrite of every inbound
`[[wikilink]]` and relative Markdown link, and this crate does both halves.

- `plan` computes the rewrite set and writes nothing, so a person can review
  it first.
- `execute` applies it. Each linking note is written under compare-and-swap,
  so a note that changed since the plan is skipped and reported, not
  overwritten.

Links are resolved to the file they name and then written back out. They are
never matched as text. A move that keeps the basename leaves `[[Alpha]]`
exactly as written, and an alias, heading anchor, block reference or embed `!`
is carried over byte for byte. Only the target span of a link changes.

## Install

```sh
cargo add markdown-relink
```

## Use

The vault directory must be an absolute path.

```rust
use std::path::Path;
use markdown_relink::{VaultFacts, execute, plan};

let vault = Path::new("/path/to/vault");
let facts = VaultFacts::scan(vault);

let p = plan(vault, &facts, "Projects/Alpha.md", "Archive/Alpha.md")?;
if let Some(reason) = &p.conflict {
    eprintln!("refused: {reason}");
} else {
    let result = execute(vault, &facts, &p.from, &p.to, None, &p.expect)?;
    for skip in &result.skipped {
        eprintln!("skipped {}: {}", skip.path, skip.reason);
    }
}
```

`plan_bundle` and `execute_bundle` move a folder shaped `<name>/<name>.md`
together with the files beside its entry note.

Link parsing comes from
[`markdown-link`](https://crates.io/crates/markdown-link), the vault walk and
path guard from
[`markdown-vault-fs`](https://crates.io/crates/markdown-vault-fs), and
the atomic compare-and-swap write from
[`etag-write`](https://crates.io/crates/etag-write).

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and are listed in the [changelog](CHANGELOG.md).

## Platforms

The crate is written for Linux, macOS and Windows. The minimum supported Rust version is 1.89.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

# markdown-corpus

One model of a folder of Markdown notes: its files, its links in both
directions, each note's frontmatter and its tags, kept up to date as the
files change. We call such a folder a corpus; an Obsidian vault is one
example.

A tool that reads a corpus needs the same facts again and again: which files
exist, what each link resolves to, which notes link back, what each note's
frontmatter says. markdown-corpus builds those facts once and refreshes only
what changed. It is the one corpus model shared by the tools in this
repository, so two tools never disagree about a corpus (decision D-ODPP).

It is built on `markdown-link` for finding and resolving
links, `markdown-vault-fs` for the walk and the
exclusion rules, and `vfs-seam` for file system and clock
access.

## Who it is for

Programs that read a corpus more than once: language servers, MCP servers,
link checkers, rename tools and site builders.

## When not to use it

- You only need the links in one note. Use `markdown-link` directly.
- You only need a list of files. Use `markdown-vault-fs`.

## Install

```sh
cargo add markdown-corpus
```

For `wasm32` targets, turn off the default `native` feature and pass your own
`Vfs`:

```sh
cargo add markdown-corpus --no-default-features
```

## Quick start

```rust
use markdown_corpus::vfs_seam::MemVfs;
use markdown_corpus::{Corpus, LoadOptions};

let fs = MemVfs::new();
fs.insert("/v/Home.md", "See [[Alpha]].\n").unwrap();
fs.insert("/v/Alpha.md", "# Alpha\n").unwrap();

let corpus = Corpus::load(&fs, "/v", LoadOptions::default());
assert_eq!(corpus.backlinks("Alpha.md").total, 1);
assert_eq!(corpus.resolve("Alpha", "Home.md").as_deref(), Some("Alpha.md"));
```

## How it works

- **The seam.** Every call that touches files takes a `&dyn Vfs`, and every
  call that checks freshness takes a `&dyn Clock`. Neither is stored, so a
  `Corpus`, `LinkGraph` and `FrontmatterIndex` stay `Send + Sync` and run the
  same against a real disk, an in-memory corpus or a browser.
- **Freshness.** A note is re-read only when its size or modification time
  (in nanoseconds) moves. A sweep younger than a short TTL (500 ms, or 60 s under a file
  watch) is reused. `apply_changes` updates named paths without a walk.
- **Two walks.** The link graph walks every file a link could reach, excluded
  files included, so a link into one still resolves. The frontmatter index
  walks content notes only. Both are yours to change in `LoadOptions`
  (`link_walk`, `frontmatter_walk`): roots, dot files, pruned folders such as
  `node_modules`, refused symlinks, read errors and your own excluded files.
  `Corpus::try_load` returns a walk error instead of skipping it. Under
  `Errors::Report` a load keeps going past a folder it cannot list or a note
  it cannot read, and `Corpus::unreadable` names each one.
- **Listed, not read.** `LinkGraph::with_list_only` lists the notes it picks
  (under dot-named folders, say) as files a link resolves to, without
  reading them.
- **Frontmatter.** Notes split strictly by default. `SplitMode::Lenient`
  also takes a block with blank lines before it or spaces after a fence.
- **Edges.** Each edge is a link, an embed or a frontmatter reference.
  Unresolved edges are kept.
- **Tags.** Tag syntax is not built in. Pass a `TagLexer` in `LoadOptions` to
  have tags read during the sweep.

## Platforms

Any platform with `std`. With `--no-default-features` the crate builds for
`wasm32-unknown-unknown`. No `unsafe` code.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and
are listed in the [changelog](CHANGELOG.md).

## Source

The crate lives in the [osdlc/osdlc](https://github.com/osdlc/osdlc)
repository, in `packages/rust/markdown-corpus`.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

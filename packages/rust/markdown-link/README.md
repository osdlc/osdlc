# markdown-link

Parse and resolve Markdown and wiki-style links in notes, in Rust.

Notes link to each other in several forms. `[[Note]]`, `[[Note#Heading|alias]]`,
`![[image.png]]`, relative Markdown links and frontmatter values all point at
files by a name or a partial path. Resolving a name to the right file needs
clear rules. Getting those rules wrong gives broken link graphs and broken
renames.

markdown-link does two jobs:

- Find every link in a note: `[[wikilink]]`, `![[embed]]`, relative Markdown
  links, and links in frontmatter values. Code spans and code blocks are
  skipped.
- Resolve a link target against a set of file paths. Any path suffix reaches
  a file, and when several files match, the one in the linking note's folder
  wins, then the shorter path.

The resolver follows documented link-resolution conventions. A fixture vault
and a shared case file, which other language ports can run, check the
behaviour.

## Who it is for

Programs that read or change a folder of notes: link graph builders, search
indexers, static site generators, linters, and tools that rewrite links when
a file is renamed.

## When not to use it

- You only need to render wikilinks to HTML as part of an mdBook build. Use
  `mdbook-wikilink`.
- You need a full Markdown parser or an editor model. markdown-link only finds
  and resolves links. Pair it with a Markdown parser if you need more.
- You need note-app features beyond links, such as tags, properties queries,
  canvas or plugins.

## How it compares

- [`trama`](https://crates.io/crates/trama) is a library. It extracts
  wikilinks and builds a file index that resolves a link by file stem,
  ignoring case. It has no path-suffix matching, no tie-break by the linking
  note's folder, and no frontmatter links.
- [`nexis`](https://crates.io/crates/nexis) is a command-line tool for link
  and backlink analysis. It ships no library target.
- [`mdbook-wikilink`](https://crates.io/crates/mdbook-wikilink) is an mdBook
  preprocessor. It turns wikilinks into HTML links for a book. It does not
  expose a link index or a scanner.
- The same author publishes related libraries, and markdown-link uses two of
  them: [`yaml-splice`](https://crates.io/crates/yaml-splice) edits YAML in
  place and supplies the frontmatter value type, and
  [`slug-collate`](https://crates.io/crates/slug-collate) supplies the
  case- and accent-insensitive path order that breaks ties.
  `frontmatter-lossless` splits a note into frontmatter and body; it is only
  used by markdown-link's own tests.

markdown-link combines the link scanner, the path-suffix resolution rules and
a fixture-vault test suite in one library.

## Install

```sh
cargo add markdown-link
```

## Quick start

```rust
use markdown_link::{LinkIndex, LinkKind, body_links};

let vault = vec![
    "Projects/Plan.md".to_string(),
    "Daily/2026-10-18.md".to_string(),
    "Assets/diagram.png".to_string(),
];
let index = LinkIndex::build(&vault);

let note = "See [[Plan]] and ![[diagram.png]]. Not a link: `[[Plan]]`.";
for link in body_links(note) {
    let found = index.resolve_from(&link.target, "Daily/2026-10-18.md");
    println!("{:?} {} -> {:?}", link.kind, link.target, found);
}

assert_eq!(index.resolve("Plan"), Some("Projects/Plan.md"));
assert_eq!(body_links(note)[1].kind, LinkKind::Embed);
```

The public items are documented on [docs.rs](https://docs.rs/markdown-link).

## Supported versions

- Rust: 1.89 or newer. This is the only place the number is stated in
  prose. The source of truth is the workspace's `rust-version`, which the
  crate inherits with `rust-version.workspace = true`.

## Platforms

Any platform with `std`. The crate has no platform-specific code and no
`unsafe` code.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and
are listed in the [changelog](CHANGELOG.md).

## Design decisions

Short notes on settled design choices are in [decisions/](decisions/).

## Source

The crate lives in the [osdlc/osdlc](https://github.com/osdlc/osdlc)
repository, in `packages/rust/markdown-link`.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

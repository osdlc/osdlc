# markdown-tags

Inline `#tag` lexing for Markdown note bodies, in three dialects: Obsidian's
rule (the default), a Unicode one that scans code, and an ASCII one. Tools
disagree on what an inline tag is, and no common reading is a superset of
another, so this crate implements three and keeps them apart.

## Why

Is `#2024` a tag? Is `#tag` inside a code span? Does `(#draft)` count? Is
`[see](#section)` a tag or a link to a heading? A regular expression picks one
answer without saying so, and two tools that read the same notes then disagree
on which tags exist. Here a caller names the dialect it wants, and the
TypeScript twin gives the same answer.

## Who it is for

Programs that read a folder of notes in Rust: search indexers, tag and link
graph builders, editors and renderers that need the tag rule of a note tool
without a syntax tree.

## When not to use it

- You already have a syntax tree from a parser such as `comrak` or
  `pulldown-cmark`. Read tags from its text nodes: that sees markup, entities
  and link text, which a scan of the source cannot.
- You need hashtags in plain social-media text, with no Markdown and no code.
  The [`hashtag-regex`](https://crates.io/crates/hashtag-regex) crate does that.
- You need positions. `inline_tags` returns names, not spans. `tag_at` reads one
  tag at an offset you already know.

## How it compares

- [`hashtag`](https://crates.io/crates/hashtag),
  [`hashtag-regex`](https://crates.io/crates/hashtag-regex) and
  [`mentions-hashtags`](https://crates.io/crates/mentions-hashtags) find
  hashtags in plain text. None of them knows Markdown: code, link destinations
  and the Obsidian rule are not theirs, there is no choice of dialect, and the
  latest release of each is a year or more old.
- This crate scans the plain text, with three rules, no regular expression
  engine, and a TypeScript twin that runs the same conformance suite.

## Install

```sh
cargo add markdown-tags
```

## The dialects

| | `TagDialect::Obsidian` | `TagDialect::Unicode` | `TagDialect::Ascii` |
|---|---|---|---|
| alphabet | any Unicode alphabetic char or number, `_`, `/`, `-` | the same | ASCII letters and digits, `_`, `/`, `-` |
| must hold | one char that is not a number | anything | a letter or `_` first |
| preceded by | start, whitespace or `(` | start or whitespace | start, whitespace or `(` |
| code spans and fences | blanked first | scanned | blanked first |
| link destinations and reference definitions | blanked first | scanned | scanned |

| note text | Obsidian | Unicode | Ascii |
|---|---|---|---|
| `#2024-review` | `2024-review` | `2024-review` | none |
| `#2024` | none | `2024` | none |
| `#santé` | `santé` | `santé` | `sant` |
| `(#draft)` | `draft` | none | `draft` |
| a fenced block holding `#nottag` | none | `nottag` | none |

`Obsidian` is the default. It is the rule of a renderer that follows Obsidian's tag rule
(`@osdlc/markdown-render` is one), read from the source text:

```text
(^|[\s(])#([\p{Alphabetic}\p{N}_/-]*[\p{Alphabetic}_/-][\p{Alphabetic}\p{N}_/-]*)
```

The tag is the longest run of tag characters after `#`. The run must hold one
character that is `\p{Alphabetic}`, `_`, `/` or `-`, so `#1` and `#2024` are
not tags, `#2024-review` and `#-` are. A number here is `\p{N}`, so `²` and `½`
do not count, while a Roman numeral such as `Ⅻ` is also alphabetic and does.
`\s` is JavaScript's, which counts U+FEFF and not U+0085; the other two
dialects use `char::is_whitespace`, which is the other way round.

The renderer reads the syntax tree, so it can differ from any source scan.
The conformance suite keeps these cases in its `renderer_only` section:

- A `#` right after inline markup, as in `**bold**#tag` or `~~s~~#tag`, starts
  a text node and is a tag there. A source scan finds nothing.
- An entity the renderer decodes to whitespace, as in `a&nbsp;#tag`, makes a
  tag there. A source scan finds nothing.
- Link text is never tagged. A source scan finds `#tag` in `[text #tag](url)`.

Link and image destinations and reference definitions are not text to the
renderer, so it finds no tag in `[see](#section)`, `![alt](#img)` or
`[x]: #def`. `Obsidian` blanks them after code, so it agrees. `Unicode` and
`Ascii` scan them: `(` opens an `Ascii` tag, and a definition's `#` follows a
space. The blanking is a source approximation: a destination is the balanced
`(...)` after a `]` that closes an open `[` in the same paragraph, and a
definition is a `[label]:` line (not a `[^footnote]:`) that starts the text,
follows a blank line, a heading or another definition. A definition whose
destination or title sits on the next line (`[ref]:` then `#anchor`) is not
recognised, so a `#` there is read as a tag; the renderer reads none.

Use `Obsidian` where the answer must match what a reader sees. Use `Unicode`
where losing a tag is the worse mistake (a search index). Use `Ascii` where a
tag read out of a code sample is the worse mistake (a link graph).

`TagDialect` prints as and parses from `obsidian`, `unicode` and `ascii`, so a
setting value can name one.

## Quick start

```rust
use markdown_tags::{TagDialect, extract_both, inline_tags, tag_at};

let body = "#santé and (#draft)";
assert_eq!(inline_tags(body, TagDialect::default()), vec!["santé", "draft"]);
assert_eq!(inline_tags(body, TagDialect::Unicode), vec!["santé"]);
assert_eq!(inline_tags(body, TagDialect::Ascii), vec!["sant", "draft"]);
assert_eq!("unicode".parse::<TagDialect>(), Ok(TagDialect::Unicode));

let (unicode, ascii) = extract_both(body);
assert_eq!((unicode.len(), ascii.len()), (1, 2));

// The tag whose `#` is at a byte offset, with no code or link blanking.
assert_eq!(tag_at(body, 0, TagDialect::Obsidian).as_deref(), Some("santé"));
```

Tags come back in encounter order and are not deduplicated. Code blanking is
[`markdown-link`](https://crates.io/crates/markdown-link)'s `strip_code`, so
links and tags agree on what counts as code. More in
[`examples/tags.rs`](examples/tags.rs). The public items are documented on
[docs.rs](https://docs.rs/markdown-tags).

## Supported versions

- Rust: 1.89 or newer. This is the only place the number is stated in prose.
  The source of truth is the workspace's `rust-version`, which the crate
  inherits with `rust-version.workspace = true`.

## Platforms

Any platform with `std`. The crate has no platform-specific code and no
`unsafe` code.

## Stability

This is a 0.x crate. Breaking changes are possible between minor versions and
are listed in the [changelog](CHANGELOG.md). Every public item is stable in
0.x: `TagDialect` (with `ALL`, `as_str`, and its `Display`, `FromStr` and
`Default` implementations), `ParseTagDialectError`, `inline_tags`,
`extract_both` and `tag_at`. `TagDialect` is `#[non_exhaustive]`, so a `match`
on it needs a wildcard arm and a new dialect is not a breaking change. A test
(`tests/stability.rs`) pins this list.

## Design decisions

Short notes on settled design choices are in
[decisions/](https://github.com/osdlc/osdlc/tree/main/packages/rust/markdown-tags/decisions).

## TypeScript twin

[`@osdlc/markdown-tags`](https://www.npmjs.com/package/@osdlc/markdown-tags)
(`packages/ts/markdown-tags` in the
[repository](https://github.com/osdlc/osdlc)) has the same three dialects and
the same answers, under camelCase names. Both run one conformance suite,
[`packages/conformance/markdown-tags`](https://github.com/osdlc/osdlc/tree/main/packages/conformance/markdown-tags),
which gives each case's tags in every dialect, so a change on one side that
the other does not make fails a suite. Its offsets count UTF-16 code units,
where this crate's count bytes.

## Source

The crate lives in the [osdlc/osdlc](https://github.com/osdlc/osdlc)
repository, in `packages/rust/markdown-tags`.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

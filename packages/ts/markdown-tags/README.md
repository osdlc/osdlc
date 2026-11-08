# @osdlc/markdown-tags

Inline `#tag` lexing for Markdown note bodies, in three dialects: Obsidian's
rule (the default), a Unicode one that scans code, and an ASCII one. It is the
TypeScript twin of the Rust [`markdown-tags`](https://crates.io/crates/markdown-tags)
crate, which sits beside it in
[`packages/rust/markdown-tags`](https://github.com/osdlc/osdlc/tree/main/packages/rust/markdown-tags).
Each function gives the same answer as its Rust namesake. The package has one
dependency, [`@osdlc/markdown-link`](https://www.npmjs.com/package/@osdlc/markdown-link),
which decides what counts as code.

## Why

Tools disagree on what an inline tag is. Is `#2024` a tag? Is `#tag` inside a
code span? Does `(#draft)` count? Is `[see](#section)` a tag or a link to a
heading? A regular expression picks one answer without saying so, and two tools
that read the same notes then disagree on which tags exist.

This package implements three readings and keeps them apart, so a caller names
the one it wants and gets the same result from TypeScript and from Rust.

| | `obsidian` (default) | `unicode` | `ascii` |
|---|---|---|---|
| alphabet | any Unicode letter or number, `_`, `/`, `-` | the same | ASCII letters and digits, `_`, `/`, `-` |
| must hold | one character that is not a number | anything | a letter or `_` first |
| preceded by | start, whitespace or `(` | start or whitespace | start, whitespace or `(` |
| code spans and fences | blanked first | scanned | blanked first |
| link destinations, reference definitions | blanked first | scanned | scanned |

| note text | `obsidian` | `unicode` | `ascii` |
|---|---|---|---|
| `#2024-review` | `2024-review` | `2024-review` | none |
| `#2024` | none | `2024` | none |
| `#santé` | `santé` | `santé` | `sant` |
| `(#draft)` | `draft` | none | `draft` |
| a fenced block holding `#nottag` | none | `nottag` | none |

Use `obsidian` where the answer must match what a reader of the note sees. Use
`unicode` where losing a tag is the worse mistake, as in a search index. Use
`ascii` where a tag read out of a code sample is the worse mistake, as in a
link graph.

## Who it is for

Programs that read a folder of notes in TypeScript: search indexers, link and
tag graph builders, editors and renderers that need the tag rule of a note
tool without a syntax tree.

## When not to use it

- You already have a syntax tree from remark or micromark. Read tags from its
  text nodes: that sees markup, entities and link text, which a scan of the
  source cannot. The package's conformance suite lists these differences in its
  `renderer_only` section.
- You need hashtags in plain social-media text, with no Markdown and no code.
  A hashtag regex such as
  [`hashtag-regex`](https://www.npmjs.com/package/hashtag-regex) is enough.
- You need positions. `inlineTags` returns names, not spans. `tagAt` reads one
  tag at a position you already know.

## How it compares

- [`hashtag-regex`](https://www.npmjs.com/package/hashtag-regex) and
  [`linkifyjs`](https://www.npmjs.com/package/linkifyjs) with
  `linkify-plugin-hashtag` find hashtags in plain text. They do not know
  Markdown: code, link destinations and the Obsidian rule are not theirs, and
  there is no choice of dialect.
- [`@moritzrs/micromark-extension-ofm-tag`](https://www.npmjs.com/package/@moritzrs/micromark-extension-ofm-tag)
  reads Obsidian tags as a micromark syntax. It needs the unified toolchain and
  has one rule.
- This package works on the plain text, with three rules and a Rust twin that
  shares its conformance suite.

## Install

```sh
npm install @osdlc/markdown-tags
```

`pnpm add @osdlc/markdown-tags` and `yarn add @osdlc/markdown-tags` work too.

## Quick start

```ts
import { extractBoth, inlineTags } from '@osdlc/markdown-tags'

const body = '#santé and (#draft) #2024'

inlineTags(body) // ['santé', 'draft']
inlineTags(body, 'unicode') // ['santé', '2024']
inlineTags(body, 'ascii') // ['sant', 'draft']
extractBoth(body) // [['santé', '2024'], ['sant', 'draft']]
```

More in [`examples/usage.test.ts`](./examples/usage.test.ts).

## Exports

- `inlineTags(body, dialect = 'obsidian')`: the tags in encounter order, not
  deduplicated, without the `#`. A `dialect` that is not one of the three
  throws a `RangeError` that names the accepted ones.
- `extractBoth(body)`: `[unicode, ascii]`, the pair a search index and a link
  graph read.
- `tagAt(text, index, dialect = 'obsidian')`: the tag whose `#` is at UTF-16
  offset `index`, or `null`, by the dialect's character rule alone, with no
  code or link blanking. For text that holds no code or link syntax, such as a
  renderer's text node or an editor's inline parser. It throws the same
  `RangeError` for an unknown dialect.
- `type TagDialect`, `TAG_DIALECTS` (every name, default first),
  `DEFAULT_TAG_DIALECT` (`'obsidian'`) and `isTagDialect(value)`, for an option
  or setting that names a dialect.

## Twin

The Rust crate `markdown-tags` has the same three dialects under snake_case
names: `inline_tags`, `extract_both` and `tag_at`, with a `TagDialect` enum.
Both run one conformance suite,
[`packages/conformance/markdown-tags`](https://github.com/osdlc/osdlc/tree/main/packages/conformance/markdown-tags),
so a change on one side that the other does not make fails a suite. Offsets are
UTF-16 here and bytes in Rust.

## Stability

This is a 0.x package. Every export listed above is stable in 0.x. No export is
experimental, beta or alpha, and `tests/stability.test.ts` fails if one is
tagged so. A breaking change comes only in a new minor version, and the
CHANGELOG marks it. [`decisions/`](https://github.com/osdlc/osdlc/tree/main/packages/ts/markdown-tags/decisions) records the settled design
choices.

## Runtimes and platforms

Node.js 22 or later, ESM only. The built package is tested on Node.js 22 and
24. The code is ES2022 string handling with no DOM, but other runtimes, such as
Bun, Deno or a browser, are not tested. It has no file system or platform code.
Its tests run on Linux and macOS.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).

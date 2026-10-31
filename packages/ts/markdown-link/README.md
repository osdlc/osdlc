# @osdlc/markdown-link

Wikilink parsing that follows documented link-resolution conventions, with no dependencies. It is
the TypeScript twin of the parsing half of the Rust
[`markdown-link`](https://crates.io/crates/markdown-link) crate, which sits beside it in
[`packages/rust/markdown-link`](https://github.com/osdlc/osdlc/tree/main/packages/rust/markdown-link).
Each function gives the same answer as its Rust namesake.

Resolution (`LinkIndex`) is not here yet.

## Why

Notes link to each other with `[[Note]]`, `[[Note#Heading|alias]]`,
`![[image.png]]` and relative markdown links. A tool that builds a link graph,
indexes a folder of notes or rewrites links on a rename must find every one of
them, skip the ones inside code, and know exactly where each sits in the text.
A regular expression gets code spans, escaped pipes and embed sizes wrong.

This package finds them with the same rules as the Rust crate, so a TypeScript
tool and a Rust tool that read the same notes agree on every link.

## Who it is for

Programs that read or change a folder of notes in TypeScript: link graph
builders, search indexers, renderers, linters and rename tools.

## When not to use it

- You render markdown with remark or micromark and only want wikilinks turned
  into links. A remark or micromark wikilink plugin fits the pipeline better.
- You need a full markdown parser or an editor model. This package only finds
  links and blanks code.
- You need to resolve a link to a file. That is the Rust crate's `LinkIndex`,
  which has no TypeScript twin yet.

## How it compares

- remark and micromark plugins, such as
  [`@moritzrs/micromark-extension-ofm-wikilink`](https://www.npmjs.com/package/@moritzrs/micromark-extension-ofm-wikilink)
  and
  [`@sgawarat/remark-obsidian-wikilink`](https://www.npmjs.com/package/@sgawarat/remark-obsidian-wikilink),
  parse wikilinks as part of a markdown syntax tree. They need the unified
  toolchain, and they do not share a case file with a Rust implementation.
- This package works on the plain text, with no dependencies. It returns spans
  into the original string, so a caller can rewrite a link in place.
- The same author's Rust [`markdown-link`](https://crates.io/crates/markdown-link)
  crate is the reference. Use it from Rust; use this package from TypeScript.

## Install

```sh
npm install @osdlc/markdown-link
```

`pnpm add @osdlc/markdown-link` and `yarn add @osdlc/markdown-link` work too.

## Quick start

```ts
import { bodyLinksSpanned } from '@osdlc/markdown-link'

bodyLinksSpanned('See [[Note#h|alias]] and `[[not a link]]`')
// [{ kind: 'wikilink', raw: 'Note#h|alias', target: 'Note', alias: 'alias', start: 4, end: 20 }]
```

## Exports

- Code: `stripCode` blanks fenced and inline code to spaces, keeping every
  `\n` and the code point count, so links in code are not harvested.
  `stripCodeWith(text, rules)` takes `'commonmark'` (the default) or
  `'skill-export'`.
- One link: `parseInner` splits a wikilink body into target, heading and
  alias; `targetRange` is where the target sits in it.
- Markdown link URLs: `isVaultLinkUrl` says whether a URL is a note or an
  attachment; `mdLinkTarget` percent-decodes it and drops `.md`.
- A body: `bodyLinksSpanned` finds every wikilink, embed and relative markdown
  link, with its span; `bodyLinks` is the same scan without spans.
- Display text: `displayText` replaces each wikilink and embed with what a
  reader sees, its alias or else its target. An embed's `|300` or `|300x200`
  is a size, not text, so `![[img.png|300]]` shows `img.png`.
- Typed references: `parseTypedRef` reads a whole `[[type/slug]]` or
  `[[type/slug|Alias]]` value into `{ kind, slug, alias }`, or `null`.
- `ATTACHMENT_EXTENSIONS`: the extensions that count as vault attachments.

Spans and ranges are UTF-16 offsets, so `body.slice(start, end)` is the link.
The Rust crate reports byte offsets.

## Twin

The Rust crate `markdown-link` has the parsing functions above under their
snake_case names. It also resolves links (`LinkIndex`), reads links in
frontmatter and has smaller helpers, which this package does not have yet.
Both suites read one case file,
`packages/rust/markdown-link/tests/fixtures/conformance.json` in the
repository, so they agree on every case in it.

## Stability

This is a 0.x package. Every export is stable in 0.x. No export is
experimental, beta or alpha, and `tests/stability.test.ts` fails if one is
tagged so. A breaking change comes only in a new minor version, and the
CHANGELOG marks it.

## Runtimes and platforms

Node.js 22 or later, ESM only. The built package is tested on Node.js 22 and
24. The code is plain ES2022 string handling with no imports and no DOM, but
other runtimes, such as Bun, Deno or a browser, are not tested. It has no file
system or platform code. Its tests run on Linux and macOS.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).

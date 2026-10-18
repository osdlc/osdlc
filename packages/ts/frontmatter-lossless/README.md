# @osdlc/frontmatter-lossless

Split a Markdown note into its YAML frontmatter and its body, with offsets
into the source, and put it back together byte for byte. The byte-order mark,
CRLF line endings and the exact fence bytes are kept. No dependencies.

## Why

A program that edits a note's frontmatter has to take the note apart and put
it back. The common tools parse the YAML and write it out again, so the
result can differ from the input even when no value changed: a BOM is lost,
`---\r\n` fences become `---\n`, or the YAML is reformatted. In version
control every line of the note then shows as changed.

This package does only the framing. It finds the `---` block, returns the YAML
text exactly as written, and rebuilds the note from the parts. Hand it back
what it gave you and you get the original text.

It is for programs that read or rewrite notes that people also edit: note
apps, static site generators, linters and sync tools.

When not to use it:

- To read the frontmatter's values. Pass the `yaml` string to a YAML parser,
  or use `gray-matter`, which does both steps.
- For `+++` TOML or `;;;` JSON frontmatter. Only `---` YAML blocks are found.
- To parse the Markdown body. The body is returned as a string.

## Install

```sh
npm install @osdlc/frontmatter-lossless
```

ESM only. Node.js 22 or later.

## Quick start

```ts
import { compose, split } from '@osdlc/frontmatter-lossless'

const note = '---\r\ntitle: Old\r\n---\r\n# Heading\r\n'

const { yaml, body, shape } = split(note)
yaml // 'title: Old\r'  (the YAML text, verbatim)
body // '# Heading\r\n'

// Change the YAML text however you like, then put the note back.
const updated = compose(yaml!.replace('Old', 'New'), body, shape)
updated // '---\r\ntitle: New\r\n---\r\n# Heading\r\n'  (the CRLF fences stay)

compose(yaml, body, shape) === note // true
```

## API

- `split(src)` returns a `Split`: `yaml` (the text between the fences,
  without them, or `null` when the note has no block), `body`, the offsets
  `yamlRange` (a `SourceRange`) and `bodyStart`, and a `shape`. A block is
  found only when the note starts with `---` and a line break, after an
  optional BOM, and is closed by `---` alone on a line. Anything else,
  including a block with no closing fence, is body. It never throws.
  `unterminated` is `true` when the note opens a block that never closes, so
  a caller can report that note as malformed rather than read it as body.
- `compose(frontmatter, body, shape)` rebuilds the note. `frontmatter` is
  `null` for no block, `''` for an empty block, or the YAML text. Passing back
  what `split` returned gives the original text.
- `NoteShape` holds the framing: `bom`, `openEol` (an `OpenEol`, `'\n'` or
  `'\r\n'`), `closeEol` (a `CloseEol`, which can also be `''` when the note
  ends at the closing fence) and `closeSep`. Take it from `split` and pass it
  to `compose`. Do not build one by hand: a minor release may add a field.
- `newShape(opts?)` returns the `NoteShape` for a new note that has no source
  text to split. Its `NewShapeOptions` are `eol` (`'\n'` by default, or
  `'\r\n'`) for both fences and `bom` (`false` by default). Pass the YAML
  text the way `split` returns it, without the line break before the closing
  fence: trim the trailing newline a YAML serializer adds.
- `splitLenient(content)` reads hand-written input that `split` rejects: blank lines or indentation
  before the opening fence, and trailing spaces on the fence lines. The closing fence must not be
  indented. It returns a `LenientSplit` (`yaml` and `body`), or `null` when there is no block. It
  keeps no framing, so use it to read, not to rewrite.

```ts
import { compose, newShape } from '@osdlc/frontmatter-lossless'

const yaml = 'title: New\ntags: [a]\n' // as a YAML serializer writes it
compose(yaml.replace(/\n$/, ''), '# New\n', newShape())
// '---\ntitle: New\ntags: [a]\n---\n# New\n'
```

Offsets are JavaScript string indices (UTF-16 code units):
`src.slice(yamlRange.start, yamlRange.end) === yaml` and
`src.slice(bodyStart) === body`.

```ts
import { splitLenient } from '@osdlc/frontmatter-lossless'

splitLenient('\n---  \ntitle: A\n---\nbody\n') // { yaml: 'title: A', body: 'body\n' }
splitLenient('no frontmatter\n') // null
```

Each export has TSDoc in the source. Your editor shows it.

## How it compares

- [gray-matter](https://github.com/jonschlinkert/gray-matter) and
  [front-matter](https://github.com/jxson/front-matter) parse the frontmatter
  into data. gray-matter writes a note back by serializing the data again,
  so comments, quoting and line endings can change. front-matter only reads.
  Use them when you want values; use this package when the note must come
  back unchanged.
- [remark-frontmatter](https://github.com/remarkjs/remark-frontmatter),
  micromark-extension-frontmatter and vfile-matter find frontmatter as part of
  a Markdown syntax tree or a vfile. This package needs no Markdown parser and
  works on a plain string.
- To edit single YAML values in place, keeping comments and key order, use a
  YAML editor on the `yaml` string, then `compose` the result. This package
  is the layer under such an editor.

The `frontmatter-lossless` Rust crate is this package's twin: the same
algorithm and the same conformance corpus. Its offsets are UTF-8 byte offsets.

## Stability

Every export is stable from 1.0.0. A breaking change to any of them needs a
new major version and is listed in the CHANGELOG under "Breaking".

The experimental exports:

- none

## Runtimes and platforms

Node.js 22 or later, ESM only. The built package is tested on Node.js 22 and
24, and the test suite also runs under Bun. The code is plain ES2022 string
handling with no imports, but other runtimes, such as Deno or a browser, are
not tested. It has no file system or platform code, so it runs on any
operating system. Its tests run on Linux and macOS.

## License

`MIT OR Apache-2.0`, at your option.

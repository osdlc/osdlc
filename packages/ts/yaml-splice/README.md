# @osdlc/yaml-splice

Edit top-level fields of a YAML mapping in place, on bytes. Set, remove or
rename a field, and every byte outside the edited span stays as it was:
comments, key order, quoting, a byte-order mark and line endings. It runs the
`yaml-splice` Rust crate as WebAssembly, so it has no runtime dependencies and
no native code.

## Why

A program that changes one value in a YAML file usually parses the file and
writes it out again. The values come back right, but the text does not:
comments move or vanish, quotes change, keys are reordered, and CRLF becomes
LF. In version control the whole file shows as changed, and the person who
wrote it loses their layout.

This package changes only the bytes of the field you edit. Everything else is
copied from the input. If an edit cannot be made that way, it refuses with a
typed error instead of guessing.

It is for programs that write YAML that people also edit by hand: Markdown
frontmatter, config files, and tools that sync metadata into notes.

When not to use it:

- To read values. Use a YAML parser, such as `yaml`.
- To edit nested values. Only top-level keys of a mapping are addressed; a
  `Set` replaces a key's whole value.
- In a browser or through a bundler such as Vite. This release loads under
  Node.js and Bun only (see Runtimes and platforms).

## Install

```sh
npm install @osdlc/yaml-splice
```

ESM only. Node.js 22 or later, or Bun.

## Quick start

```ts
import assert from 'node:assert/strict'

import { editYaml } from '@osdlc/yaml-splice'

const source = new TextEncoder().encode("title: 'Draft'  # shown in the header\nstatus: draft\n")

const out = editYaml(source, [
  { Set: { key: 'status', value: 'done' } },
  { Rename: { from: 'title', to: 'name' } },
])

assert.equal(new TextDecoder().decode(out.bytes), "name: 'Draft'  # shown in the header\nstatus: done\n")
assert.equal(out.changed, true)
```

More in `examples/`: setting values, removing and renaming in one batch, and
handling refusals.

## API

- `editYaml(source, edits)` takes the document as UTF-8 bytes (`Uint8Array`)
  and a list of `FieldEdit`s, and returns an `EditOutcome`: the new `bytes` and
  `changed`. It throws an `EditError` when it refuses.
- `FieldEdit` is one edit: `{ Set: { key, value } }`,
  `{ Remove: { key } }` or `{ Rename: { from, to } }`.
- `EditValue` is the value a `Set` writes: any JSON-shaped value. Maps and
  lists are written as block YAML under the key.
- `EditOutcome` holds `bytes` and `changed`. When no value changed, `bytes`
  equals the input and `changed` is `false`, so a caller can skip the write.
- `EditError` is the refusal. Its `code` (an `EditErrorCode`) says why, and
  `name` is the same code. `span`, an `EditSpan`, is the byte range
  `[start, end)` in the input that the refusal is about, when there is one.
- `EditErrorCode` is one of `InvalidUtf8`, `MalformedYaml`,
  `UnsupportedDocument`, `RootNotMapping`, `AmbiguousKey`, `MissingKey`,
  `KeyConflict`, `UnrenderableValue` and `InvalidResult`. A minor release may
  add a code, so give a `switch` over it a `default` branch.
- `EditSpan` is `{ start, end }`, in bytes. `RootNotMapping`, `AmbiguousKey`
  and `KeyConflict` always carry one; `MalformedYaml` and
  `UnsupportedDocument` carry one when the parser knows the location.

Each export has TSDoc in the source. Your editor shows it.

## Behaviour

- The edits apply in order, and each one sees the result of the ones before
  it. The batch is atomic: if any edit is refused, nothing is returned.
- Keys match case-insensitively: `Title` and `title` are the same key. Both
  sides are lowercased and nothing else is normalized. Two existing keys that
  differ only in case make an edit of either one `AmbiguousKey`.
- `Set` on a missing key appends it after the last top-level entry. `Remove`
  of a missing key changes nothing. `Rename` of a missing key is
  `MissingKey`; a rename onto an existing key is `KeyConflict`.
- New lines use the document's first line ending (LF or CRLF). A BOM stays at
  byte zero.
- `NaN` and `±Infinity` anywhere in a `Set` value are refused as
  `UnrenderableValue` before any byte is written.
- Each edit is checked against what it asked for: the addressed key must read
  back as set, removed or renamed, and no other key may change value or
  order. If not, the batch is refused as `InvalidResult` instead of returning
  a damaged document.

## How it compares

- [`yaml`](https://www.npmjs.com/package/yaml) keeps comments through its Document
  API, but writes the whole document out again, so quoting, spacing and
  line endings can change. Use it to read and to build YAML; use this package
  to change a value in a file a person edits.
- [`yaml-diff-patch`](https://www.npmjs.com/package/yaml-diff-patch) and
  [`yawn-yaml`](https://www.npmjs.com/package/yawn-yaml) keep comments and most
  formatting, but do not promise that the bytes outside the edit are
  unchanged, and have no typed refusals.
- [`@osdlc/frontmatter-lossless`](https://www.npmjs.com/package/@osdlc/frontmatter-lossless)
  splits a Markdown note into its frontmatter and body. The two compose:
  split the note, edit the YAML bytes here, and put the note back together.

The Rust crate [`yaml-splice`](https://crates.io/crates/yaml-splice) is the
implementation. This package runs it as WebAssembly, and its tests run the
crate's conformance corpus.

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export.

The experimental exports:

- none

## Tested claims

| Claim | Test |
|---|---|
| Comments, key order and quoting outside the edit are kept | corpus fixture `a_changed_value_keeps_comments_key_order_and_quoting` |
| A BOM is kept | corpus fixture `a_bom_is_preserved_and_outside_every_span` |
| CRLF and mixed line endings are kept | corpus fixtures `crlf_line_endings_survive_outside_the_edited_span`, `mixed_line_endings_are_not_normalized` |
| An edit that changes no value returns the input bytes | `tests/index.test.ts`, "a semantic no-op …" |
| Non-finite numbers are refused before any write | `tests/index.test.ts`, "a non-finite number in a Set value" |
| `EditErrorCode` lists every refusal the crate has | `tests/index.test.ts`, "EditErrorCode" |

## Runtimes and platforms

Node.js 22 or later, and Bun. The WebAssembly glue is built for Node.js: it
reads the `.wasm` file with `fs` from beside itself. So the package does not
load in a browser, in Deno without Node compatibility, or through a bundler
such as Vite. The built package is tested on Node.js 22 and 24, and the test
suite also runs under Bun. It has no native code and no platform-specific
code, so it runs on any operating system Node.js runs on. Its tests run on
Linux and macOS.

## License

`MIT OR Apache-2.0`, at your option.

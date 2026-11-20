# gfm-table

GitHub Flavored Markdown pipe tables as strings and offsets: row splitting
with the backslash-escape rule, cell text and escaping, row splices, reading,
rendering and padding whole tables, grid clipboard formats (TSV, CSV, HTML),
and tolerant reading and editing of delimited files.

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/gfm-table` (reference) | TypeScript | `packages/ts/gfm-table` |
| `gfm-pipe-table` | Rust | `packages/rust/gfm-pipe-table` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Write a new case's `input` by hand, then run

```sh
pnpm --filter @osdlc/gfm-table conformance:write
```

to write its `expect` or `error`. Never write those by hand.

Each section is one function of the library. A case's `input` holds that
function's arguments, in snake_case, and `expect` holds its result in one
JSON spelling that both runners build. Both runners fail on a section, a case
key or an input key they do not know.

## Offsets

Every offset in the suite is a UTF-8 byte offset, as the Rust crate reports
it. The TypeScript package reports UTF-16 indices, so its runner converts
them. A line's `base` is a plain number in both and is not converted. The
`cell_text`, `source_offset` and `text_offset` sections hold ASCII text only,
where the two units agree; `cell_text` gives its offsets for ASCII source only.

## Errors

An `error` is `{ "kind": ... }`: the two implementations' messages differ by
design, so a case never sets `error.message`. There are two kinds:

| Kind | TypeScript | Rust |
|---|---|---|
| `invalid_max_column_width` | `padTable` throws a `RangeError` for a `maxColumnWidth` that is not a positive integer | the type `Option<NonZeroUsize>` cannot hold one; the runner refuses the input |
| `overlapping_changes` | `applyDelimitedChanges` throws a `RangeError` | `Err(OverlappingChanges)` |

## Not in the suite

- The Rust crate's `Delimiter` and `DelimitedLineEnding` enums and its
  one-sided exports. The crate's README lists them.
- `pad_row_splice` on a line that is not a row: Rust returns `None` and
  TypeScript throws a `TypeError`.
- `apply_delimited_changes` with an offset past the end of the text or inside
  a character: Rust panics and TypeScript clamps.

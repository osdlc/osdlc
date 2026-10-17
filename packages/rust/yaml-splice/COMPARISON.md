# yaml-splice compared with yaml-edit

Date: 2026-10-17. This page records one measurement. It is not a ranking. The two crates have
different goals: yaml-edit edits nested YAML by path and reorders keys, yaml-splice changes
top-level keys of a mapping and checks its result.

## What was compared

- yaml-edit 0.3.2 (crates.io, 2026-09-17).
- yaml-edit main at commit 57f9106 (2026-10-17).
- yaml-splice 0.2.1.

## Method

The harness is the crate in [compare/](./compare/README.md). It loads a document with
`YamlFile::from_str`, calls `Mapping::set` or `Mapping::remove` on the root mapping, and prints the
result. The same edit runs through yaml-splice's `edit_yaml`.

1. 19 hand-picked cases.
2. A sweep over the document shapes of `tests/neighbours.rs`: 25 value shapes, every pair in `first`
   and `second`, three separators between them, then `last: end # t`; LF and CRLF. On each of the
   three keys: one Remove and six Sets (`Z`, three multi-line strings, `1.5`, `7`).
   78,750 edits. The sequence and mapping values that `tests/neighbours.rs` also sets are left
   out, because the harness sets scalars only.

An edit is "correct" when the result parses, with yaml-splice's parser, to the original mapping
with only the addressed key changed. Run against yaml-edit main by changing the `yaml-edit` line in
`compare/Cargo.toml`.

## Results of the sweep

| | correct | silently wrong | parse errors | panics |
|---|---|---|---|---|
| yaml-edit 0.3.2 | 40,952 | 31,624 | 6,174 | 0 |
| yaml-edit main | 45,360 | 33,390 | 0 | 0 |
| yaml-splice | 73,820 | 0 | 0 | 0 |

yaml-splice also refused 4,930 edits. A refusal returns an error and leaves the document alone.
Correct, wrong, errors and refusals add up to 78,750 for each crate.

The 0.3.2 parse errors are valid YAML with a comment indented less than a block sequence. Main
parses them.

No-op check: `Set` of `last` to its current value `end` in 3,750 documents. The result was
byte-identical in 3,456 on 0.3.2 and in 3,750 on main. A quoted value was re-written without its
quotes on both (example 5).

## Caveats

- The checker is yaml-splice's own parser (saphyr-parser). yaml-splice's zero is partly by
  construction: it checks its result with the same parser.
- A few yaml-edit counts may come from parser differences, for example an empty `a: |` at the end
  of a document. Results read by hand were real changes: a lost key, or a comment turned into value
  text.
- The shapes come from yaml-splice's own tests, so they favour the cases yaml-splice was built for.
- No upstream reports have been filed with yaml-edit yet.

## Examples

Outputs are copied from the harness output. Examples 1 to 3 and 5 to 6 are hand-picked cases.
Example 4 is a sweep sample. All give the same result on 0.3.2 and on main.

1. Lost key.
   - Input: `first: | # c\n  x\nsecond: 1\n`
   - Edit: Set `first` = `Z`
   - yaml-edit: `first: Z # csecond: 1\n` (the line break is gone, so key `second` is gone)
   - yaml-splice: `first: Z\nsecond: 1\n`
2. Comment becomes value text.
   - Input: `first: a # c\nsecond: x\n`
   - Edit: Set `first` = `"line1\nline2\n"`
   - yaml-edit: `first: |\n  line1\n  line2 # c\nsecond: x\n`
   - yaml-splice: `first: | # c\n  line1\n  line2\nsecond: x\n`
3. Less-indented comment becomes value text.
   - Input: `first: |\n    x\n  # note\nsecond: 1\n`
   - Edit: Set `first` = `"a\nb\n"`
   - yaml-edit: `first: |\n  a\n  b  # note\nsecond: 1\n`
   - yaml-splice: refused
4. Keep-chomp (`|+`) value loses blank lines, and a comment lands in the value.
   - Input: `first: 1\n\nsecond: 1\nlast: end # t\n`
   - Edit: Set `last` = `"kept\n\n\n"`
   - yaml-edit: `first: 1\n\nsecond: 1\nlast: |+\n  kept\n\n # t\n`
   - yaml-splice: refused
5. Equal value re-quoted (not corruption, but not a no-op).
   - Input: `title: 'Draft'   # keep\ntags: [a, b]\n`
   - Edit: Set `title` = `Draft`
   - yaml-edit: `title: Draft   # keep\ntags: [a, b]\n`
   - yaml-splice: input bytes unchanged
6. Line ending.
   - Input: `a: 1\r\nb: 2\r\n`
   - Edit: Set `c` = `"3"`
   - yaml-edit: `a: 1\r\nb: 2\r\nc: '3'\n` (LF line in a CRLF file)
   - yaml-splice: `a: 1\r\nb: 2\r\nc: "3"\r\n`

## What yaml-splice refuses

The 4,930 refusals split by cause as `tests/neighbours.rs` pins them. Each example was run against
yaml-splice and refused.

| Shape | Count | Example input and edit |
|---|---|---|
| A `Set` writes `\|+` and a blank line follows | 3,650 | `first: a\n\nsecond: 1\n`, Set `first` = `"kept\n\n"` |
| A `Set` writes a block value over a block with a less-indented comment | 900 | `first: \|\n    x\n  # note\nsecond: 1\n`, Set `first` = `"a\nb\n"` |
| A `\|+` neighbour would gain a blank line | 40 | `first: \|+\n  kept\nsecond: 1\n\nthird: 2\n`, Remove `second` |
| A `Remove` keeps a less-indented comment that then joins the previous block | 40 | `k: \|\n  x\nfirst: \|\n    y\n  # note\nsecond: 1\n`, Remove `first` |
| A `Remove` leaves an empty `a: \|` as the last line | 300 | `a: \|\nb: 1\n`, Remove `b` |

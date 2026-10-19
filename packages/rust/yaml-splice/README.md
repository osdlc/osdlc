# yaml-splice

Edit the top-level fields of a YAML mapping in place, for Rust.

The usual way to change one field in a YAML file is to parse it into a value,
change the value and write the whole value back. That loses everything the
value model does not hold: comments, key order, quoting style, blank lines,
flow or block layout. In a file a person also edits, such as Markdown
frontmatter or a config file, each write then shows up as a diff of lines
nobody changed, and the comments are gone.

yaml-splice changes only the bytes of the field you edit. It parses the
document with byte spans, works out which bytes belong to the field, and
replaces just those. Everything else comes through byte for byte, because it
is never written again.

It is for programs that update a few fields of YAML that people also edit:
frontmatter in notes and static sites, config files, manifests.

- `edit_yaml` takes UTF-8 bytes and a list of edits (`Set`, `Remove`,
  `Rename`) and returns the new bytes, or a typed error.
- `edit_frontmatter` does the same for a frontmatter block cut out of a
  Markdown file.
- An edit that changes nothing returns the input bytes unchanged.
- The crate does no I/O and has no global state.

## Install

```sh
cargo add yaml-splice
```

### Cargo features

- `serde_json` (on by default): `impl From<&serde_json::Value> for Value`,
  for a program that gets its values as JSON. Nothing else in the crate uses
  `serde_json`. To build without it:

  ```toml
  yaml-splice = { version = "0.3", default-features = false }
  ```

## Quick start

```rust
use yaml_splice::{FieldEdit, Value, edit_yaml};

let src = b"# Settings for the weekly report.\n\
    title: 'Weekly report'\n\
    status: draft   # draft | review | done\n\
    owners: [sam, alex]\n";

let out = edit_yaml(
    src,
    &[
        FieldEdit::Set { key: "status".into(), value: Value::from("review") },
        FieldEdit::Set { key: "due".into(), value: Value::from("2026-11-02") },
    ],
)?;

assert!(out.changed);
assert_eq!(
    String::from_utf8(out.bytes).unwrap(),
    "# Settings for the weekly report.\n\
     title: 'Weekly report'\n\
     status: review   # draft | review | done\n\
     owners: [sam, alex]\n\
     due: 2026-11-02\n"
);
# Ok::<(), yaml_splice::EditError>(())
```

The comment, the single quotes and the flow list are untouched. The new key is
appended at the end.

`examples/frontmatter.rs` edits the frontmatter of a Markdown note. Run it
with `cargo run --example frontmatter`.

## What an edit does

- **`Set`** writes a value at a key. If the current value is equal, nothing
  changes. If it differs, only the value's bytes are replaced; a trailing
  comment on the same line stays. If the key is absent, a new entry is added
  after the last top-level entry (before a `...` document-end line, if there
  is one).
- **`Remove`** deletes the key, its value lines and the comment on its last
  line. Comment lines above it stay. An absent key is a no-op.
- **`Rename`** changes the key token and keeps the value, the comments and the
  key's position. The old key must exist and the new one must not.

Edits in one call run in order, and each sees the result of the ones before
it. Either all of them apply or none do. Keys are matched case-insensitively
by default (`Title` and `title` are the same key); pass
`EditOptions::default().case_sensitive(true)` to `edit_yaml_with` for exact
matching. Only top-level keys can be addressed; to change a nested field, `Set`
the whole top-level value.

New values are written the way the npm `yaml` package (version 2) writes them:
the same quoting, the same block or flow layout, the same number formatting.
So a file written from Rust and one written from JavaScript with `yaml` do not
differ.

The document's line ending (LF or CRLF) is used for new lines. A UTF-8 BOM
stays at byte zero.

## What is refused

Each refusal is an `EditError` value, never a panic, and never a fallback to
rewriting the whole document. Where a location is known, the error carries a
byte span.

- Input that is not UTF-8, not well-formed YAML, a stream of several
  documents, a `%` directive, or a root that is not a mapping.
- A key that matches more than one existing key (`AmbiguousKey`), a `Rename`
  whose source is missing (`MissingKey`) or whose destination exists
  (`KeyConflict`).
- A value or key the emitter cannot write (`UnrenderableValue`). The edit
  functions render at line width 0, where the emitter has no error, so this
  release does not return it.
- An edit whose result would not parse, would change a key the edit does not
  address, or would not read back as the edit asked (`InvalidResult`). Each
  edit is checked by parsing its result. These shapes are refused:
  - a `Set` writes a keep-chomped (`|+`) value and a blank line follows it,
    which would join the value;
  - a `Set` writes a block value where the old block had a comment indented
    less than its content, which would land at the new indent and become
    content;
  - a neighbour is keep-chomped (`|+`) and the edit moves a blank line up
    against it;
  - a `Remove` keeps such a less-indented comment, and it would join the
    previous key's block scalar;
  - a `Remove` leaves an empty block scalar (`a: |`) as the document's last
    line, which the parser then reads as a line break.

  These refusals are a choice, not a limit of YAML. Another layout, such as
  an explicit indentation indicator (`|4`) or moving the comment, could make
  some of these edits safe. `tests/neighbours.rs` pins how many of its cases
  each shape refuses.

## When not to use it

- You need to edit nested keys by path, or reorder keys. yaml-splice
  addresses top-level keys only.
- You want to reformat or normalize a document. yaml-splice never does.
- You read YAML into your own types. Use a serde-based crate; yaml-splice's
  `Value` is a plain tree for edits, not a deserializer.
- The document is large and edited often. Each edit parses the document again
  (once to plan it and once to check the result), which is fine for
  frontmatter and config files but not for megabytes of YAML.

## Compared with other crates

| | `yaml-splice` | `yaml-edit` | `yamlpatch` | parse and re-serialize (`serde_yaml` and others) |
|---|---|---|---|---|
| Keeps comments and formatting outside the edit | yes | yes | yes | no |
| Edits nested keys by path | no | yes | yes | yes |
| Byte-identical no-op when nothing changes | yes | no | not stated | no |
| New values written as the npm `yaml` package writes them | yes | no | no | no |
| Checks that other keys did not change | yes | no | not stated | n/a |

The other columns are from each crate's crates.io description and docs.
The `yaml-edit` cells for the no-op and result-check rows come from a measurement, described in
[COMPARISON.md](https://github.com/osdlc/osdlc/blob/main/packages/rust/yaml-splice/COMPARISON.md).
`yaml-edit` is a lossless syntax tree for general YAML editing. `yamlpatch`
applies patch operations at paths and keeps formatting. Pick one of them when
you edit nested structure. Pick yaml-splice when you change a few top-level
fields and want the smallest possible diff, or output that matches JavaScript's
`yaml`.

## Which test shows what

| Claim | Test |
|---|---|
| A changed value keeps comments, key order and quoting elsewhere | conformance `a_changed_value_keeps_comments_key_order_and_quoting` |
| An equal `Set` is a byte-identical no-op | conformance `resent_equal_value_is_a_byte_identical_no_op`, `no_op_does_not_normalize_a_bare_scalar` |
| A quoted value keeps its trailing comment | conformance `a_quoted_value_keeps_its_trailing_comment` |
| Block scalars are replaced and removed without their neighbours | conformance `setting_a_block_scalar_keeps_the_next_key_on_its_own_line`, `removing_a_block_scalar_removes_only_its_own_lines` |
| No edit changes a key it does not address, and each reads back as asked | `neighbours::an_edit_changes_only_the_key_it_addresses` |
| BOM, CRLF and mixed line endings are kept | conformance `a_bom_is_preserved_and_outside_every_span`, `crlf_line_endings_survive_outside_the_edited_span`, `mixed_line_endings_are_not_normalized` |
| An appended key uses the document's line ending, and lands before `...` | conformance `an_appended_key_uses_the_documents_line_ending`, `an_append_lands_before_an_explicit_document_end_marker` |
| `Remove` takes the key, its value and its inline comment | conformance `remove_takes_the_key_its_value_and_its_inline_comment` |
| `Rename` keeps the value and position; missing source and existing destination are refused | conformance `rename_changes_the_key_token_in_place`, `rename_of_a_missing_source_is_a_missing_key_refusal`, `rename_onto_an_existing_destination_is_a_key_conflict` |
| Keys match case-insensitively by default, exactly on request | conformance `addressing_is_case_insensitive_by_default`, `case_sensitive_mode_treats_case_variants_as_distinct` |
| A batch runs in order and applies all or nothing | conformance `a_batch_applies_in_declared_order_atomically`, `a_later_edit_sees_an_earlier_one`, `a_failing_edit_discards_the_whole_batch` |
| Unsupported input is refused | conformance `invalid_utf8_is_a_structured_refusal_with_the_offset`, `malformed_yaml_is_a_structured_refusal`, `a_multi_document_stream_is_unsupported`, `a_directive_is_unsupported`, `a_sequence_root_is_a_root_not_mapping_refusal` |
| A change that would alter a neighbour is refused | `edit::frontmatter_tests::an_edit_that_would_change_a_neighbour_is_refused` |
| A `.nan` elsewhere does not block an edit | `edit::frontmatter_tests::a_nan_neighbour_does_not_block_an_edit` |
| A trailing comment moves to the header of a new block value | `splice::tests::a_trailing_comment_moves_to_the_header_of_a_new_block_value` |
| Hostile input does not panic | `conformance::no_panic_on_hostile_input` |
| `edit_frontmatter` returns split form | `edit::frontmatter_tests::appending_to_an_unterminated_block_returns_split_form`, `removing_the_last_key_leaves_no_trailing_newline` |
| New values match the npm `yaml` package | `render::tests`, expected strings captured from `yaml` 2.9.0 |

The conformance cases are in `tests/fixtures/conformance.json`, a
language-neutral file, so a binding of this crate in another language can run
the same cases. Coverage is not measured.

## Platforms

The crate is pure Rust with no platform-specific code and no I/O. It runs
wherever its dependencies (`saphyr-parser`, `thiserror`, and `serde_json`
with the default feature) build.
CI runs the tests on Linux, macOS and Windows.

Minimum supported Rust version: 1.89, checked in CI by running the tests on
1.89.

## Stability

0.2.1 is the first release on crates.io. The crate stays on 0.x for now.

Stable in 0.x: `edit_yaml`, `edit_yaml_with`, `edit_frontmatter`, `edit_frontmatter_with`,
`FieldEdit`, `EditOptions`, `EditOutcome`, `EditError`, `Value`, `Mapping`.

These are not expected to change in a breaking way. `FieldEdit`, `EditError`,
`EditOptions` and `EditOutcome` are `#[non_exhaustive]`, so a later release can
add a variant, an option or a field without a breaking change.

Unstable, may change in any 0.x minor release:

- `parse`: the span-keeping parser.
- `render`: the value emitter.
- `splice`: the older single-key splice functions.
- `value::js_float_to_string`: JavaScript-style float formatting.

A test (`tests/stability.rs`) checks that these lists match the markers in
the item docs.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

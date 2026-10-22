# @osdlc/yaml-splice

## 0.2.0

### Minor Changes

- 2f3fc7c: A malformed edit is now refused as the new `EditErrorCode` `InvalidEdit`, and an error that is not a refusal is passed through instead of being reported as `InvalidResult`.
  
  - `InvalidEdit`: a `Set` with no `value` (or `value: undefined`), an unknown tag, or a `Set` value nested more than 124 levels deep (the JSON decoder's recursion limit). These were reported as `InvalidResult`, which says the edit would damage the document, when the edit itself was bad.
  - **Breaking:** `editYaml` rethrows any error without a known code unchanged. Before, it wrapped it in `EditError('InvalidResult', …)`. A Rust panic in the WebAssembly module (`RuntimeError: unreachable`) now reaches the caller as a `RuntimeError`, so a crashed module no longer looks like a normal refusal. Code that catches only `EditError` now sees these errors propagate.

## 0.1.4

### Patch Changes

- fa792c7: The first release on npm. Versions 0.1.0 to 0.1.3 were used only during development and were never published. It edits top-level fields of a YAML mapping in place, on bytes: set, remove or rename a field, and every byte outside the edited span stays as it was, including comments, key order, quoting, a BOM and line endings. It runs the `yaml-splice` Rust crate through WebAssembly, so it has no runtime dependencies and no native code.
  
  - `editYaml(source, edits)` applies a batch of `FieldEdit`s (`Set`, `Remove`, `Rename`) in order and returns an `EditOutcome` (`bytes` and `changed`). The batch is atomic: a refused edit throws an `EditError` with an `EditErrorCode` and, where known, an `EditSpan`, and nothing is returned.
  - Keys match case-insensitively.
  
  Fixed since the last development version:
  
  - `Set` on a quoted value with a comment after it (`title: 'Draft'  # note`) no longer deletes the comment.
  - `Set` on a block scalar (`|` or `>`) no longer joins the next key onto the new value's line, and `Remove` on one no longer deletes the next line too.
  - A comment indented less than a block scalar is kept: `Set` no longer joins it onto the new value's line, and `Remove` no longer deletes it.
  - An empty block scalar (`a: |`, also with a tag or an anchor) can now be set and removed. Both were refused.
  - When a new value is written as a block, the old value's trailing comment moves to the block's header line instead of becoming part of the value.
  - A keep-chomped (`|+`) value keeps its trailing line breaks: setting `"kept\n\n"` no longer writes `"kept\n"`.
  - `editYaml` checks each edit against what it asked for. It throws `EditError('InvalidResult', …)` when an edit would change the value or order of a key it does not address, or when the addressed key would not read back as set, removed or renamed. Before, it returned that document. A `.nan` value in another key no longer counts as a change.
  
  All seven exports are stable. Node.js 22 or later and Bun; no browser or bundler build yet. Shipped as compiled JavaScript with type declarations. Tested on Linux and macOS. Licensed `MIT OR Apache-2.0`.

## History before the first public release

These versions were developed in a private repository before the package moved here, and
were never published. They are rebuilt from the git history.

### [0.1.3] - 2026-09-07 (unpublished)

#### Fixed

- `editYaml` refuses `NaN`, `Infinity` and `-Infinity` anywhere in a `Set` value, nested values
  included, with `EditError('UnrenderableValue', …)` before any byte is written. Before, they
  were written as YAML `null`.

### [0.1.2] - 2026-09-06 (unpublished)

#### Fixed

- The built entry (`dist/`) loads under Node. It imported the WebAssembly glue from a path the
  build did not create.

### [0.1.1] - 2026-07-21 (unpublished)

#### Fixed

- `EditError.span` is a truly optional property, so it type-checks under a consumer's
  `exactOptionalPropertyTypes`.

### [0.1.0] - 2026-07-21 (unpublished)

#### Added

- `editYaml(source, edits)`: set, remove or rename top-level fields of a YAML mapping without
  reserializing it, with the types `FieldEdit`, `EditValue`, `EditOutcome`, `EditError`,
  `EditErrorCode` and `EditSpan`.

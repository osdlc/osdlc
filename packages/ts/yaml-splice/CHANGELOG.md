# Changelog

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

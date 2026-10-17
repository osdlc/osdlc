---
id: D-02
type: decision
state: accepted
created: 2026-10-17
---

# D-02: Version line and stability

## Decision

- The first published version is `0.1.4`. Versions 0.1.0 to 0.1.3 were used
  during development and never published; the CHANGELOG lists them.
- All seven exports are stable within 0.x: `editYaml`, `FieldEdit`,
  `EditValue`, `EditOutcome`, `EditError`, `EditErrorCode` and `EditSpan`.
  None is experimental, and the README's experimental list is empty.
- The owner approved the API for 0.1.4 on 2026-10-17, with these answers:
  `FieldEdit` keeps the crate's externally tagged shape
  (`{ Set: { key, value } }`); `EditError.name` stays equal to the code;
  `EditErrorCode` is documented as open to new codes in a minor release, and
  tested against the crate's variants; key matching is documented as
  case-insensitive ([D-05](D-05-case-insensitive-keys.md)).

## Why

- 0.1.4 continues the development versions, so the first public version is
  above every version the package had. The last change before release, the
  `InvalidResult` check, replaces output that corrupted a document with a
  refusal, so it counts as a fix, not a breaking change.
- `FieldEdit` and the error shape match the crate and the JSON the wasm side
  reads, and both existing consumers use them.

## Consequences

- A breaking change to a stable export needs a new minor version while the
  package is 0.x, and is listed under "Breaking" in the CHANGELOG.
- Adding an `EditErrorCode` is not breaking. Callers are told to give a
  `switch` over it a `default` branch.

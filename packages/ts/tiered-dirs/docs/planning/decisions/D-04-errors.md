---
id: D-04
type: decision
state: accepted
created: 2026-10-18
---

# D-04: Errors

## Decision

- Every failure is a `TieredDirsError`, with a `readonly code` and a message.
  The constructor is `TieredDirsError(code, message)`.
- `code` is a `TieredDirsErrorCode`, exported as a type. There is one code per
  variant of the Rust crate's `Error`:
  - `MISSING_BASE_DIR`
  - `RELATIVE_OVERRIDE`
  - `OVERRIDE_REQUIRED`
  - `INVALID_CONVENTION`
  - `INVALID_KEY`
- The union can grow in a minor version, as the README documents. A `switch`
  over it needs a `default` arm.
- Resolution throws a catchable error and never asserts or aborts.

## Why

- A caller can tell a directory problem from an unrelated `Error`, and can
  branch on `code` without matching the message.
- The Rust `Error` is `#[non_exhaustive]`, so the code union follows the same
  growth rule.
- `code` carries no other fields. The Rust variants also carry the variable,
  key or value. Those are in the message here. A field can be added later
  without a break.

## Consequences

- A caller reads the variable name or the key from the message text.
- A new failure adds a code in a minor release.

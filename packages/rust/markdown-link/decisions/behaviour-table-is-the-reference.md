# The behaviour table is the reference

## Decision

When the resolver and the written behaviour table disagree on which file a
link opens, the table is right. The table is the definition of correct for
this crate.

## Why

Link resolution has several valid rule sets, and users notice when a tool
opens a different file than they expect. A written table makes the chosen
rules explicit, so a change is a visible edit to the table and its tests.

## How it is checked

- `tests/fixtures/vault/` is a small vault built to hit hard cases: contested
  names, deep paths, attachments without the `.md` extension, relative links,
  case and Unicode differences.
- The expected behaviours come from a written behaviour table, and tests
  check each row against `LinkIndex`.
- A test named `agrees_` means the resolver gives the table's answer. A test
  named `diverges_` records a known difference and states the table's answer,
  so that file is also the list of known differences.
- The tests record what the table says, never how an implementation reaches
  it.

## Consequences

- A change to resolution must say which table row it changes and how it was
  checked.
- Those tests need a dev-dependency that is not on crates.io, so they are
  left out of the published package. The other tests ship.

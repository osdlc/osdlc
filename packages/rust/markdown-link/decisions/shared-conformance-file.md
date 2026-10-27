# One case file shared with the TypeScript twin

## Decision

The parsing rules live in one language-neutral case file,
`tests/fixtures/conformance.json`. This crate's tests and the TypeScript
port's tests both read that same file. There is one copy, not two.

## Why

The TypeScript port parses links in places where Rust cannot run. If the two
parsers drift, a link found by one is missed by the other. Tests written
separately in each language drift too. One file of cases, read by both, keeps
them in step.

## What it covers

The file has one section per concern:

- `code`: what counts as code and is blanked before links are found.
- `parse`: one-link parsing, Markdown link URLs, and body scans with offsets.
- `display`: the text a reader sees for each link.
- `typedRef`: whole `[[type/slug|alias]]` values.

Offsets count characters, so neither language's string unit leaks into the
file. Resolution against a vault is not in the file. It is covered by the
differential test.

## Consequences

- A change to parsing behaviour adds or changes a case in the file. Both test
  suites then have to pass.
- The file is part of the published package, so other ports can use it too.

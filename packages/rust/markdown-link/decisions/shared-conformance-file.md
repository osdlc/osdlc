# One case file shared with the TypeScript twin

## Decision

The parsing rules live in one language-neutral conformance suite,
`packages/conformance/markdown-link/suite.json`, which S-conformance-suites
describes. This crate's tests and the TypeScript port's tests both run that
same file. There is one copy, not two. This crate is the reference: its
generator, `cargo run -p markdown-link --example conformance-write`, writes
every expected value.

## Why

The TypeScript port parses links in places where Rust cannot run. If the two
parsers drift, a link found by one is missed by the other. Tests written
separately in each language drift too. One file of cases, read by both, keeps
them in step.

## What it covers

The file has one section per concern:

- `code`: what counts as code and is blanked before links are found.
- `inner`, `url` and `body`: one-link parsing, Markdown link URLs, and body
  scans with offsets.
- `display`: the text a reader sees for each link.
- `typed_ref`: whole `[[type/slug|alias]]` values.

Offsets count characters, so neither language's string unit leaks into the
file. Resolution against a vault is not in the file. It is covered by the
differential test.

## Consequences

- A change to parsing behaviour adds or changes a case in the file. Both test
  suites then have to pass.
- The file is not part of the published crate. It lives in the repository.

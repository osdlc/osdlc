# Validation corpus

This folder is the shared test corpus for markdown-contract. It holds only
language-neutral files, so any engine that reads the same YAML contracts can run it.
An engine passes when, for every shared case, it reports the same number of findings,
the same ids in order, and the same `level`, `line` and `hint` where the expected
file records them.

## Files

- `corpus-manifest.json` lists every case. Each entry has:
  - `id`: the fixture id, such as `v10b`.
  - `contract`: the `.contract.yaml` file for the fixture, or `null` when the
    contract exists only in TypeScript.
  - `shared`: `true` when the YAML contract fully expresses the fixture. Only
    shared entries are meant for other engines.
  - `cases`: pairs of a `source` document (`.md`) and its `expected` findings
    (`.expected.json`).
- `<name>.contract.yaml`: a contract in the `mcVersion: 2` format.
- `<name>.<case>.md`: an input document. Read the bytes as they are; line numbers
  in the expected findings depend on them.
- `<name>.<case>.expected.json`: the expected findings, as a JSON array of
  `{ id, level?, line?, hint? }` in engine order. Check `level`, `line` and `hint`
  only when they are present. `[]` means the document passes.

## How it is used

The package's TypeScript tests read these files directly (`tests/harness.ts`) and
check that the manifest matches the fixture modules (`tests/corpus-manifest.test.ts`).

The Rust crate in this repository, `packages/rust/markdown-contract`, reads this
folder in place (`tests/corpus.rs`). A change here also runs the Rust CI. That test
asserts the number of shared and TypeScript-only fixtures, so a new fixture updates
the counts there too.

An engine outside this repository should copy this folder from a release tag, such
as `@osdlc/markdown-contract@0.3.2`, and check that its copy still matches that tag.
The corpus is not part of the npm package.

# Validation corpus

This folder is the shared test corpus for markdown-contract. It holds only
language-neutral files, so any engine that reads the same YAML contracts can run it
and must report the same findings.

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

Another engine should copy this folder from a release tag, such as
`@osdlc/markdown-contract@0.3.0`, and check that its copy still matches that tag.
The corpus is not part of the npm package.

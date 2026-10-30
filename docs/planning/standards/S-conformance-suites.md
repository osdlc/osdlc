# S-conformance-suites: Conformance suites for library families

**Status: in force, migration in progress.** `pnpm run check:conformance`
checks every family listed in `packages/conformance/families.json`. The
families in the migration table below that have not moved keep their current
fixtures until they do.

## Purpose

Some libraries here are written more than once, in different languages, and
must behave the same: `tiered-dirs` in Rust and TypeScript, for example. The
sdlc app is moving from TypeScript to Rust, so there will be more of them,
and a third language may follow. This standard says how such a set of
libraries shares one set of test cases, so that every implementation is held
to the same behaviour by the same data.

## Terms

- **Family.** A set of libraries, one per language, that do the same job.
  The `gfm-table` family is `@osdlc/gfm-table` and `gfm-pipe-table`.
- **Implementation.** One library in a family.
- **Reference implementation.** The implementation whose behaviour is right
  when two disagree. Its generator writes the expected values in the suite.
- **Conformance suite.** The shared cases every implementation runs: inputs
  and the result each must give.
- **Specification.** What the family must do. For most families this is the
  family README plus the suite. A family with a file format or an on-disk
  protocol states it in a `SPEC.md`.
- **Binding.** A build of one implementation for another runtime, such as
  `@osdlc/yaml-splice`, the `yaml-splice` crate built to WebAssembly. A
  binding is not an implementation and has no suite of its own.

## Rule

### Home and registry

- Each family has a directory `packages/conformance/<family>/`, named after
  the family, not after any one implementation:

  ```
  packages/conformance/<family>/
    README.md    what the family covers, its implementations, the reference
    SPEC.md      only where there is a format or protocol to state
    suite.json   or one <section>.json per section
  ```

- `packages/conformance/families.json` lists every family:

  ```json
  {
    "gfm-table": {
      "reference": "ts",
      "generator": "pnpm --filter @osdlc/gfm-table conformance:write",
      "implementations": [
        { "language": "ts", "dir": "packages/ts/gfm-table", "name": "@osdlc/gfm-table" },
        { "language": "rust", "dir": "packages/rust/gfm-pipe-table", "name": "gfm-pipe-table" }
      ]
    }
  }
  ```

  CI reads it to decide what a change affects. A change under any
  implementation's directory or the family's suite runs every implementation's
  tests.

### The reference and its generator

- Each family names one reference implementation. It is TypeScript by
  default, because the TypeScript libraries came first and the app is moving
  away from them. A family whose Rust crate came first may name Rust:
  `frontmatter-lossless`, `markdown-link`, `markdown-tags`.
- Inputs may be written by hand. Expected values are written only by the
  reference's generator, never by hand.
- The generator is committed in the reference implementation's `tests/`. It
  runs with one command, recorded in `families.json`:
  `pnpm --filter <package> conformance:write` for a TypeScript reference,
  `cargo run -p <crate> --example conformance-write` for a Rust one.
- Running the generator twice writes the same bytes.

### Suite format

A suite file is JSON:

```json
{
  "family": "gfm-table",
  "reference": "ts",
  "referenceVersion": "0.4.0",
  "sections": {
    "split_row": {
      "description": "Split one table row into cells.",
      "cases": [
        {
          "name": "an escaped pipe stays in its cell",
          "input": { "line": "| a \\| b | c |" },
          "expect": { "cells": ["a \\| b", "c"] }
        },
        {
          "name": "a cap of 0 is refused",
          "input": { "maxColumnWidth": 0 },
          "error": { "kind": "invalid_max_column_width" }
        }
      ]
    }
  }
}
```

- A case has `name`, `input`, and either `expect` or `error`.
- `error.kind` is a string that every implementation reports with the same
  spelling, in snake_case. A case compares the message only if it sets
  `error.message`. `error` holds nothing else.
- A case may set `platforms`, a list of `unix` and `windows`, or
  `skip: { "<language>": "<reason>" }`. A skip without a reason is an error.
- A value that JSON cannot hold exactly is written as a tagged string:
  `"NaN"`, `"Infinity"`, `"-0"`, or `{ "hex": "..." }` for bytes that are
  not UTF-8.
- An offset says its unit in the section's `description`: UTF-8 bytes,
  UTF-16 units or characters. Each implementation converts to its own.
- Floats compare exactly, unless a case sets `tolerance`. A case that sets
  it says why in its `name` or the section `description`.
- A suite over about 1 MB is split into one file per section.

### Every implementation runs every case

- Each implementation has one test that loads the family's suite by path
  and runs every section and case.
- The test fails on a section it does not know and on a case it does not
  run, so nothing is skipped silently.
- An implementation-only feature has no suite cases. The implementation's
  README lists it.

### Versions

Implementations share the major and minor version. One may skip versions to
catch up, as `packages/README.md` describes. A suite records
`referenceVersion`, and an implementation that passes it conforms to that
version.

## Enforcement

`scripts/conformance.ts`, run by `pnpm run check:conformance`, checks:

- every family in `families.json` names its reference among its
  implementations, the generator command above, and at least two
  implementations, each under `packages/ts/` or `packages/rust/` as its
  language says;
- every family has its directory, README and suite files, and every
  implementation directory exists;
- every suite file has the shape above;
- each implementation's `tests/` names the family's suite path;
- the implementations share major.minor;
- every `packages/ts/*` and `packages/rust/*` library whose tests read a suite
  is listed for that family, and no library's tests read the other
  language's fixtures directly.

`node scripts/conformance.ts --regenerate` also runs each family's generator
and fails if a suite changes, which catches a change to the reference whose
expected values were not regenerated. CI runs it for the TypeScript
references in `packages-ci.yml` and for the Rust references in `rust-ci.yml`.

## Exemptions

Two lists in `scripts/conformance.ts`, which shrink to nothing as migration
finishes:

- `CATCHING_UP` names a family whose implementations do not share
  major.minor yet, with the work that brings them level.
- `UNMIGRATED` names a library whose tests still read the other language's
  fixtures, until its family moves here. A binding that reads the crate it
  is built from (`@osdlc/yaml-splice`) stays on it, since it is not a family.

The check fails when an entry in either list is no longer needed.

## Migration

Each family's suite moves to `packages/conformance/<family>/`. Its generator
is committed, its file takes the format above, and both tests point at the
new path. The README's "Twin libraries" section becomes "Library families"
and points here.

| Family | Implementations | Fixture today | Reference |
|---|---|---|---|
| agent-call | TS, Rust `osdlc-agent-call` | `rust/osdlc-agent-call/tests/fixtures/parity.json` | TS |
| cli-tool | TS, Rust `osdlc-cli-tool` | `rust/osdlc-cli-tool/tests/fixtures/parity.json` | TS |
| code-host | TS, Rust | `rust/code-host/tests/fixtures/parity.json` | TS |
| color | TS, Rust `srgb-color` | `rust/srgb-color/tests/fixtures/parity.json` | TS |
| command-seam | TS, Rust | `rust/command-seam/tests/fixtures/parity.json` | TS |
| config-layers | TS, Rust | moved: `conformance/config-layers/suite.json` | TS |
| detect-harness | TS, Rust | `rust/detect-harness/tests/fixtures/parity.json` | TS |
| etag-write | TS, Rust | `rust/etag-write/tests/fixtures/parity.json` | TS |
| fenced-lock | TS, Rust | `rust/fenced-lock/tests/fixtures/parity.json` | TS |
| frontmatter-lossless | Rust, TS | moved: `conformance/frontmatter-lossless/suite.json` | Rust |
| gfm-table | TS, Rust `gfm-pipe-table` | `rust/gfm-pipe-table/tests/fixtures/parity.json` | TS |
| intersect | TS, Rust `glob-intersect` | `ts/intersect/fixtures/*.cases.json` | TS |
| manifest-graph | TS, Rust | `rust/manifest-graph/tests/fixtures/parity.json` | TS |
| markdown-contract | TS, Rust | `ts/markdown-contract/corpus/`, `rust/markdown-contract/tests/fixtures/parity.json` | TS |
| markdown-link | Rust, TS | `rust/markdown-link/tests/fixtures/conformance.json` | Rust |
| markdown-tags | Rust, TS | `rust/markdown-tags/tests/fixtures/conformance.json` | Rust |
| observe | TS, Rust `osdlc-observe` | `rust/osdlc-observe/tests/fixtures/parity.json` | TS |
| path-guard | TS, Rust | `rust/path-guard/tests/fixtures/parity.json` | TS |
| pr-update | TS, Rust | `rust/pr-update/tests/fixtures/parity.json` | TS |
| repo-cleaner | TS, Rust | `rust/repo-cleaner/tests/fixtures/parity.json` | TS |
| system-model | TS, Rust | `rust/system-model/tests/fixtures/parity.json` | TS |
| tiered-dirs | TS, Rust | moved: `conformance/tiered-dirs/suite.json` | TS |
| tool-router | TS, Rust | `rust/tool-router/tests/fixtures/parity.json` | TS |
| trust-repo | TS, Rust | `rust/trust-repo/tests/fixtures/parity.json` | TS |
| typed-gh | TS, Rust | `rust/typed-gh/tests/fixtures/parity.json` | TS |
| typed-git | TS, Rust | `rust/typed-git/tests/fixtures/parity.json` | TS |

Paths are under `packages/`. Many of these families exist only on local
`rust-twin/*` branches so far. `yaml-splice` is a binding and is not listed.
The `markdown-contract` corpus is the input set for both implementations and
moves as one section of its suite.

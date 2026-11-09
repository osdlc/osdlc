# @osdlc/conformance-suites

Checks the conformance suites of library families. A family is a set of
libraries, one per language, that do the same job, such as a Rust crate and
its TypeScript twin. Each family has one suite of cases that every
implementation runs, with expected values written by one reference
implementation's generator. This package checks that the suites, the
registry that lists them and the implementations agree, and runs the
generators to catch stale expected values.

The rules are the standard
[S-conformance-suites](https://github.com/osdlc/osdlc/blob/main/docs/planning/standards/S-conformance-suites.md).

## Install

```sh
npm install --save-dev @osdlc/conformance-suites
# or
pnpm add -D @osdlc/conformance-suites
```

Node 22 or later. ESM only.

## The layout it reads

```
packages/conformance/
  families.json        every family, its reference, generator and implementations
  config.json          optional settings (below)
  <family>/
    README.md
    SPEC.md            when the family has one implementation so far
    suite.json         or one <section>.json per section
packages/ts/<library>/ TypeScript implementations
packages/rust/<crate>/ Rust implementations, in a Cargo workspace at packages/rust
.changeset/            pending Changesets, read for the version check
```

`families.json` maps each family to its entry:

```json
{
  "gfm-table": {
    "reference": "ts",
    "generator": "pnpm --filter @acme/gfm-table conformance:write",
    "implementations": [
      { "language": "ts", "dir": "packages/ts/gfm-table", "name": "@acme/gfm-table" },
      { "language": "rust", "dir": "packages/rust/gfm-pipe-table", "name": "gfm-pipe-table" }
    ]
  }
}
```

## The command

```sh
conformance-suites check                         # check every family
conformance-suites check --regenerate            # also run each generator; fail if a suite changed
conformance-suites check --regenerate --reference ts
conformance-suites write --reference ts          # run the generators and keep what they write
```

- `check` checks the registry, each suite's format, that every
  implementation's tests name its suite, that the implementations share
  major.minor once the pending changesets are applied, and that no library's
  tests read the other language's fixtures.
- `--regenerate` first builds each TypeScript reference and the workspace
  libraries it imports (`pnpm --filter <name>... run build`), then runs the
  generators. It fails when a generator changes a suite.
- `write` runs the generators without checking first and keeps the result.
  A release runs it after bumping versions, since each suite records its
  reference's version.
- `--reference ts|rust` runs only the generators of families whose reference
  is that language.
- `--families <path>` names another registry, inside the root. A relative
  path is read from the root. Its directory holds the suites and
  `config.json`.
- `--root <dir>` is the repository root, by default the working directory.

The exit code is 0 when everything passes, 1 on a problem, and 2 on a bad
command line.

## Settings

`config.json` beside `families.json` is optional. Every key is optional.

```json
{
  "libraries": { "ts": "packages/ts", "rust": "packages/rust" },
  "catchingUp": { "tiered-dirs": "the crate reaches 0.5.0 with the realign work" },
  "unmigrated": ["packages/ts/gfm-table"],
  "skipScan": { "packages/ts/conformance-suites": "its tests hold suite paths as test data" }
}
```

- `libraries`: where each language's libraries live. The Rust directory is
  also where a Rust generator runs. The two are separate folders whose last
  names differ, since a test reaches the other language's libraries by it.
- `catchingUp`: families whose implementations do not share major.minor yet,
  each with the work that brings them level. A stale entry fails the check.
- `unmigrated`: libraries whose tests still read the other language's
  fixtures directly. An entry that reads none fails the check.
- `skipScan`: libraries whose tests are not scanned for suite paths, each
  with the reason.

## From code

```ts
import { checkRepo, regenerate } from '@osdlc/conformance-suites'

const problems = checkRepo(process.cwd())
for (const p of problems) console.error(p)

// Run the generators and list the suite files they changed.
for (const changed of regenerate(process.cwd(), { reference: 'ts' })) console.log(changed.file)
```

The checks are also exported as functions over data (`registryProblems`,
`suiteProblems`, `versionProblems`, `pendingBumps` and others), each returning
a list of problems.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and
[LICENSE-APACHE](./LICENSE-APACHE).

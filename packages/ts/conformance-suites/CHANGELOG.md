# @osdlc/conformance-suites

## 0.2.0

### Minor Changes

- 258384e: A family in `families.json` may list `readers`: libraries whose tests read the suite but that are not twins of the reference. They are checked for language, folder and a test that names the suite, but not for a matching version, and a library that reads a suite may be listed as an implementation or as a reader.

### Patch Changes

- 258384e: `registryProblems` now reports a reader listed twice in a family (by `dir` or by `name`) and a reader that is also an implementation of the same family. Before, a copy-pasted entry passed and the library was checked twice.

## 0.1.1

### Patch Changes

- Updated dependencies [e1a5941]
  - @osdlc/command-seam@0.15.0

## 0.1.0

### Minor Changes

- 767cfe3: The first release of `@osdlc/conformance-suites`: the conformance check that `scripts/conformance.ts` ran in osdlc/osdlc, as a package any repository with the same layout can use.
  
  - The `conformance-suites` command: `conformance-suites check`, `conformance-suites check --regenerate [--reference ts|rust]` and `conformance-suites write [--reference ts|rust]`, with `--families <path>` and `--root <dir>`.
  - `packages/conformance/config.json` holds what was code before: `catchingUp` and `unmigrated`, plus `libraries` (where each language's libraries live) and `skipScan` (libraries whose tests are not scanned, with the reason).
  - The checks as functions over data: `registryProblems`, `suiteProblems`, `versionProblems`, `pendingBumps`, `bumpVersion`, `configProblems`, `suiteReaders`, `readsAcross`, `generatorBuildFilters`, and `checkRepo` and `regenerate` over a repository on disk. `regenerate` takes a `run` function, so a test can stand in for the build and the generators.
  - A Rust crate's version is read with `smol-toml`.
  - ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. Licence `MIT OR Apache-2.0`.

---
"@osdlc/conformance-suites": minor
---

The first release of `@osdlc/conformance-suites`: the conformance check that `scripts/conformance.ts` ran in osdlc/osdlc, as a package any repository with the same layout can use.

- The `conformance-suites` command: `conformance-suites check`, `conformance-suites check --regenerate [--reference ts|rust]` and `conformance-suites write [--reference ts|rust]`, with `--families <path>` and `--root <dir>`.
- `packages/conformance/config.json` holds what was code before: `catchingUp` and `unmigrated`, plus `libraries` (where each language's libraries live) and `skipScan` (libraries whose tests are not scanned, with the reason).
- The checks as functions over data: `registryProblems`, `suiteProblems`, `versionProblems`, `pendingBumps`, `bumpVersion`, `configProblems`, `suiteReaders`, `readsAcross`, `generatorBuildFilters`, and `checkRepo` and `regenerate` over a repository on disk. `regenerate` takes a `run` function, so a test can stand in for the build and the generators.
- A Rust crate's version is read with `smol-toml`.
- ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. Licence `MIT OR Apache-2.0`.

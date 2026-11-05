# Contributing

Thanks for your interest in `@osdlc/intersect`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, and the
patterns and options that misbehave. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/intersect`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.12 or later.

```sh
pnpm install
cd packages/ts/intersect
pnpm test
```

`pnpm run coverage` reports test coverage.

`pnpm run build` compiles the package to `dist/`. `pnpm run smoke` runs
`tests/smoke.mjs`, a short check of the built package under Node. Build first.
It is not published.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## The conformance suite

`packages/conformance/intersect/suite.json` is the family's conformance suite,
run by this package's `tests/conformance.test.ts` and by the Rust crate
`glob-intersect`'s `tests/conformance.rs`. This package is the family's
reference. A behaviour change goes into the suite first: write the case's
`input` by hand in the section for its operation, then run
`pnpm run conformance:write` (on Linux or macOS, not as root) to write its
`expect` or `error`, and both packages' tests cover it. Never write those by
hand.
[S-conformance-suites](../../../docs/planning/standards/S-conformance-suites.md)
is the standard.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

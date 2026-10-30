# Contributing

Thanks for your interest in `@osdlc/config-layers`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, and the
call and inputs that misbehave. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/config-layers`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.12 or later.

```sh
pnpm install
cd packages/ts/config-layers
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

`packages/conformance/config-layers/suite.json` is the family's conformance
suite, run by this package's `tests/conformance.test.ts` and by the Rust
crate's `tests/conformance.rs`. This package is the family's reference. A new
shared behaviour goes into the suite first: write the case's `input` by hand,
then run `pnpm run conformance:write` to write its expected value, and both
packages' tests cover it. The table in the README's "The Rust crate" section
lists what is left out.
[S-conformance-suites](../../../docs/planning/standards/S-conformance-suites.md)
is the standard.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc and a use in `examples/`, which imports the package
  by name. A test fails if an export has no example.
- An export's TSDoc carries `@experimental` and the README's Stability section
  lists it. A test checks both.
- Path assertions must not depend on the separator: compare with `normalize`.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

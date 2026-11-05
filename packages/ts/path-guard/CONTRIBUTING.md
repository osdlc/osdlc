# Contributing

Thanks for your interest in `@osdlc/path-guard`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, and the
call and inputs that misbehave. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/path-guard`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.12 or later. Some of them make symlinks, which needs a platform
and a user that may. On Windows that means Developer Mode or an administrator
shell.

```sh
pnpm install
cd packages/ts/path-guard
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

`packages/conformance/path-guard/suite.json` is the family's conformance
suite, run by this package's `tests/conformance.test.ts` and by the Rust
crate's `tests/conformance.rs`. This package is the family's reference. A new
case goes into the suite first: write its `input` by hand, then run
`pnpm run conformance:write` on Linux or macOS to write its expected value,
and both packages' tests cover it. Neither package may add a case the other
lacks.
[S-conformance-suites](../../../docs/planning/standards/S-conformance-suites.md)
is the standard.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc, a use in `examples/`, which imports the package
  by name, and a mention in the README. It also goes into the list in
  `tests/exports.test.ts`. A test fails if one of these is missing.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

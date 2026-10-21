# Contributing

Thanks for your interest in `@osdlc/typed-gh`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, your
`gh --version`, and the call and inputs that misbehave. Report security
problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

Open pull requests in the repository that holds this package,
[osdlc/osdlc](https://github.com/osdlc/osdlc). They are reviewed and merged
there. The package lives in `packages/ts/typed-gh`.

## Setting up

The repository is a pnpm workspace. Install from the repository root:

```sh
pnpm install
```

Run the package's scripts with `pnpm --filter @osdlc/typed-gh`:

```sh
pnpm --filter @osdlc/typed-gh test
pnpm --filter @osdlc/typed-gh typecheck
pnpm --filter @osdlc/typed-gh lint
pnpm --filter @osdlc/typed-gh format:check
pnpm --filter @osdlc/typed-gh build
pnpm --filter @osdlc/typed-gh smoke
```

`smoke` runs the built package under Node, so run `build` first.

## Running the tests

pnpm installs and runs the scripts, and the `test` script runs Vitest under
Node. Build first, since the workspace packages resolve each other through
`dist/`. The tests run offline: a fake
runner stands in for `gh`, so they need no network, no login and no `gh`
binary.

## Changesets and the CHANGELOG

Add a changeset in the pull request that makes a change users can see. Run
`pnpm changeset` at the repository root, pick `@osdlc/typed-gh` and the bump,
and write the summary. Start a breaking change's summary with `**Breaking:**`.

Do not edit `CHANGELOG.md` or `version` by hand. When the pull request merges,
the release flow opens a "Version Packages" pull request that bumps the
version and writes the CHANGELOG from the pending changesets. See
[Releasing a TypeScript library](https://github.com/osdlc/osdlc/blob/main/packages/README.md#releasing-a-typescript-library).

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run
  `pnpm --filter @osdlc/typed-gh format` and `pnpm --filter @osdlc/typed-gh lint`
  before you commit.
- Add a test for each behaviour change or bug fix. Test through the fake
  runner and check the argv that would run.
- A new export gets a doc comment and an example in `examples/`, which imports
  the package by name. A test fails if an exported function is not called, or
  an exported type not imported, in `examples/`. `tests/exports.test.ts` lists
  the few exports that have no example yet.
- Shell out only through the command seam, never with a raw `child_process`
  call.
- Add a changeset for a change users can see. See above.
- Record a design choice in
  [`docs/decisions/`](https://github.com/osdlc/osdlc/tree/main/packages/ts/typed-gh/docs/decisions).

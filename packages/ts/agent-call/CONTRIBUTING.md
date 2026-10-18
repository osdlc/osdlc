# Contributing

Thanks for your interest in `@osdlc/agent-call`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your Node version, the agent CLI and its version, and the call
spec that misbehaves. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/agent-call`. Open pull requests there. They are reviewed and
merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.12 or later for development.

```sh
pnpm install
cd packages/ts/agent-call
pnpm test
```

No test needs an agent CLI. `pnpm run coverage` reports test coverage.

`pnpm run build` compiles the package to `dist/`. `pnpm run smoke` runs
`tests/smoke.mjs`, a short check of the built package under Node. Build first.
It is not published.

`pnpm run test:live` makes real, paid calls to whichever agent CLIs are
installed and signed in. The live tests are skipped unless `AGENT_CALL_LIVE=1`
is set, which that script does.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Code style

- TypeScript, ES modules, and `.js` import paths for relative imports.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix. A change to what an
  adapter maps needs a row in `tests/contract.test.ts` and in the README's
  capability map.
- A new export gets TSDoc, `@throws` if it can throw, and a use in
  `examples/`, which imports the package by name. A test fails if an export
  has no example.
- An experimental export carries `@experimental` and is listed in the
  README's API section. A test checks that the two agree.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

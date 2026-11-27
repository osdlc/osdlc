# Contributing

Thanks for your interest in `@osdlc/spec-query`.

## Issues

Report bugs and ask for features in the [issue tracker](https://github.com/osdlc/osdlc/issues).
For a bug, include the library version, your runtime and its version, your operating system, and
the call and inputs that misbehave. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/spec-query`. Open pull requests there. They are reviewed and merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then work in the package
directory. The tests run on [Vitest](https://vitest.dev) under Node 22 or later and need no
network.

```sh
pnpm install
cd packages/ts/spec-query
pnpm test
```

`pnpm run coverage` reports test coverage.

`pnpm run build` compiles the package to `dist/`. `pnpm run smoke` runs `tests/smoke.mjs`, a short
check of the built package under Node. Build first.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and `pnpm run lint` before
  you commit.
- Add a test for each behaviour change or bug fix.
- Add a line to `CHANGELOG.md` under `[Unreleased]` for a change users can see.

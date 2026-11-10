# Contributing

Thanks for your interest in `@osdlc/markdown-vault-astro`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your Node version, your operating system, and the config,
a short note and the command that show the problem. Report security problems
privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/markdown-vault-astro`. Open pull requests there. They are reviewed and
merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then work
in the package directory. The tests run on [Vitest](https://vitest.dev) under
Node 22 or later and need no network.

```sh
pnpm install
cd packages/ts/markdown-vault-astro
pnpm test
```

`pnpm test` builds `dist/` first, because the command-line tests run the built
`markdown-vault-astro` bin. `pnpm run coverage` reports test coverage. `pnpm run
bench` runs the `transform` benchmark. `pnpm run smoke` runs `tests/smoke.mjs`,
a short check of the built package under Node; build first. It is not
published.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- Add a changeset (`pnpm exec changeset` at the repository root) for a change
  users can see.

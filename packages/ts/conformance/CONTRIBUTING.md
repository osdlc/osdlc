# Contributing

Thanks for your interest in `@osdlc/conformance`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your Node version, your operating system, and the
families.json and command that misbehave. Report security problems
privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/conformance`. Open pull requests there. They are reviewed and
merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on Vitest under Node 22 or
later, offline. Build first: the package imports its sibling libraries through
their `dist/`.

```sh
pnpm install
pnpm --filter @osdlc/conformance... run build
cd packages/ts/conformance
pnpm test
pnpm run smoke
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it.
- Add a test for each behaviour change or bug fix.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

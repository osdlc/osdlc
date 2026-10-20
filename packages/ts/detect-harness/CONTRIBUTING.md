# Contributing

Thanks for your interest in `@osdlc/detect-harness`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your Node version, your operating system and a short
reproduction. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/detect-harness`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22 or later.

```sh
pnpm install
cd packages/ts/detect-harness
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

## Code style

- TypeScript, ES modules, and `.ts` extensions on relative imports; the build
  rewrites them.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc and `@throws` if it can throw. A stable export also
  gets a use in `examples/`, which imports the package by name. An experimental
  export carries `@experimental` and is listed in the README's "Experimental"
  section. Tests fail on an export with no TSDoc, on tags and list that
  disagree, and on a stable export no example imports.
- Spawn processes only through `@osdlc/command-seam`, never `child_process`.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

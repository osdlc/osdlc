# Contributing

Thanks for your interest in `@osdlc/ecosystem`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your Node version, your operating system, and a minimal
example. Report security problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/ecosystem`. Open pull requests there. They are reviewed and
merged there.

A new shared concern is a new module and subpath export here, not a new
package ([D-ZVIA](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-ZVIA-osdlc-ecosystem-package.md)).
A family file it owns follows the
[machine-files standard](https://github.com/osdlc/osdlc/blob/main/standards/machine-files.md).

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on Vitest under Node, against
the TypeScript source, and make real git repositories in a temporary
directory. The workspace packages it depends on resolve through their built
`dist/`, so build them first.

```sh
pnpm install
pnpm --filter '@osdlc/ecosystem...' run build
cd packages/ts/ecosystem
pnpm test
```

`pnpm run smoke` runs `tests/smoke.mjs`, a short check of the built package
under Node. It is not published. `pnpm run coverage` reports test coverage.

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
- Add a test for each behaviour change or bug fix. A test never reads or
  writes the real home: pass `home`, `env` or `dirs`, clear
  `OSDLC_REPOSITORIES`, and pass a fake `resolveAlias`.
- Git work goes through `@osdlc/typed-git`, and any other program through
  `@osdlc/command-seam`, never `child_process`.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

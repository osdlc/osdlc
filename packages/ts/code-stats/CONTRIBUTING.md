# Contributing

Thanks for your interest in `@osdlc/code-stats`.

## Issues

Report bugs and ask for features in the [issue tracker](https://github.com/osdlc/osdlc/issues).
For a bug, include the library version, your runtime and its version, your operating system, and
the call and inputs that misbehave: the command and its flags, or the change you measured and the
report you expected. Report security problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under `packages/ts/code-stats`.
Open pull requests there. They are reviewed and merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then work in the package
directory. The tests run on [Vitest](https://vitest.dev) under Node and need no network. They make
throwaway git repositories, so `git` must be on `PATH`.

```sh
pnpm install
cd packages/ts/code-stats
pnpm test
```

`pnpm run coverage` reports test coverage. `pnpm run build` compiles the package to `dist/`, and
`pnpm run smoke` runs `tests/smoke.mjs`, a short check of the built package under Node. Build
first.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run check:extra
```

`check:extra` fails when `src/scan/languages.generated.ts` no longer matches the vendored scc
table. `pnpm run languages` rewrites it.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths for relative imports.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and `pnpm run lint`
  before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc and a use in `examples/`, which imports the package by name. A test
  fails if an export has no TSDoc or a value export has no example.
- An experimental export carries `@experimental` and is listed in the README's Stability section.
  A test checks that the two agree.
- For a change users can see, add a changeset: run `pnpm changeset` at the repository root.
  Start a breaking change's summary with `**Breaking:**`. Do not edit `CHANGELOG.md` or `version`
  by hand; the release writes them.

# Contributing

Thanks for your interest in `@osdlc/markdown-contract`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your Node version, your operating system, the contract and a
short document that shows the problem. Report security problems privately.
See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/markdown-contract`. Open pull requests there. They are reviewed
and merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22 or later.

```sh
pnpm install
cd packages/ts/markdown-contract
pnpm test
```

`pnpm test` builds `dist/` first, because the command-line tests run the
built `markdown-contract` bin and a test reads the built `./core` import
graph. `pnpm run coverage` reports test coverage.

`pnpm run smoke` runs `tests/smoke.mjs`, a short check of the built package
under Node. Build first. It is not published.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Layout

- `src/core/` is the `./core` entry. It must import no Node module; a test
  fails if it does.
- `src/runner/`, `src/declarative/` and `src/cli/` read files and need Node.
- Unit tests sit next to their module as `*.test.ts`. `tests/` holds the
  fixture-driven suites; see [tests/FIXTURES.md](./tests/FIXTURES.md).
- `corpus/` is the shared validation corpus: documents, YAML contracts and
  expected findings in plain files. See [corpus/README.md](./corpus/README.md).
  A change to the engine's findings updates the corpus in the same pull
  request.

## Code style

- TypeScript, ES modules, and `.js` extensions on relative imports.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc, `@throws` if it can throw, and a use in
  `examples/`, which imports the package by name. A test fails if an export
  has no example.
- An experimental export carries `@experimental` and is listed in the
  README's stability section. A test checks that the two agree.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

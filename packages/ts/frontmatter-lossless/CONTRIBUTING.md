# Contributing

Thanks for your interest in `@osdlc/frontmatter-lossless`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, and the note text that
misbehaves (escape a BOM or `\r` so it survives copying). Report security
problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/frontmatter-lossless`. Open pull requests there. They are
reviewed and merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on Vitest under Node 22 or
later.

```sh
pnpm install
cd packages/ts/frontmatter-lossless
pnpm run build
pnpm test
```

`pnpm test` runs the Vitest suite. Most tests run the source.
`tests/corpus-dist.test.ts` runs the conformance corpus on the built package.
Build first.

`pnpm run smoke` runs `tests/smoke.mjs`, a short check of the built package
under Node. It is not published.
`pnpm run coverage` reports test coverage.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## The conformance corpus

The tests read the `frontmatter-lossless` Rust crate's corpus in place, at
`packages/rust/frontmatter-lossless/tests/fixtures/conformance.json`; the
package keeps no copy. A change to how notes are split changes both
implementations and the corpus together. See
[D-07](https://github.com/osdlc/osdlc/blob/main/packages/ts/frontmatter-lossless/docs/planning/decisions/D-07-conformance-corpus.md).

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc and a use in `examples/`, which imports the package
  by name. A test fails if an export has no example.
- An experimental export carries `@experimental` and is listed in the
  README's Stability section. A test checks that the two agree.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

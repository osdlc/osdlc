# Contributing

Thanks for your interest in `@osdlc/markdown-tags`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, and the note text that
misbehaves. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/markdown-tags`. Open pull requests there. They are reviewed and
merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.12 or later.

```sh
pnpm install
cd packages/ts/markdown-tags
pnpm test
```

`pnpm run coverage` reports test coverage. It sets no threshold.

`pnpm run build` compiles the package to `dist/`. `pnpm run smoke` runs
`tests/smoke.mjs`, a short check of the built package under Node. Build first.
It is not published.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## The conformance suite

`packages/conformance/markdown-tags/suite.json` is read by this package's
`tests/conformance.test.ts` and by the Rust crate's `tests/conformance.rs`.
A new case goes into that file, so both suites cover it. Write the case's
`input` by hand, then run
`cargo run -p markdown-tags --example conformance-write` from `packages/rust`
to write its `expect`; never write that by hand. A change to tag behaviour
lands in both packages in one pull request.

`bench/` holds the benchmarks (`pnpm run bench`), one per dialect with and
without link syntax. The Rust crate has the same set in `benches/`.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc, a use in `examples/`, which imports the package by
  name, and a mention in the README.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

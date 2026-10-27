# Contributing

Thanks for your interest in `@osdlc/ux`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, and the input that misbehaves: the
environment for color detection, or the text, as a JSON string, for the
text helpers. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/ux`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.12 or later.

```sh
pnpm install
cd packages/ts/ux
pnpm test
```

`pnpm run coverage` reports test coverage. It sets no threshold.

`pnpm run build` compiles the package to `dist/` and writes
`dist/tokens.css`. `pnpm run smoke` runs
`tests/smoke.mjs`, a short check of the built package under Node. Build first.
It is not published.

`pnpm test` runs from source and needs no build. `typecheck` and `build`
read `@osdlc/color` from its `dist/`, so build it first:
`pnpm --filter @osdlc/color build`.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Tokens

A change to a color must keep every pair in `CONTRAST_PAIRS` at WCAG AA in
both themes. `tests/tokens.test.ts` checks it. Colors are `#rrggbb` or
`rgb()` only. Color arithmetic belongs in `@osdlc/color`, not here.

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

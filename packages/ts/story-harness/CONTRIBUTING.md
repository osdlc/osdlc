# Contributing

Thanks for your interest in `@osdlc/story-harness`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your Node and Playwright versions, your operating system,
your Docker engine for a baseline problem, and the call and inputs that
misbehave. Report security problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/story-harness`. Open pull requests there. They are reviewed and
merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. Build first: the examples import the package
by name, and the Playwright specs resolve it to the built `dist/`.

```sh
pnpm install
pnpm run build
cd packages/ts/story-harness
pnpm test
```

`pnpm test` runs the unit tests and the examples on
[Vitest](https://vitest.dev) under Node 22 or later, with no browser.

The browser tests need Chromium (`pnpm exec playwright install chromium`):

```sh
pnpm run test:browser
```

The `story-shots` check needs Docker and bash:

```sh
pnpm run test:shots
```

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
- `src/runner/` is copied into the container as one flat folder that has only
  Node and Playwright, so its files import nothing else and stay in one
  folder.
- A change to the pinned Playwright image can move pixels, so it is a minor
  release.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

## Licence

By contributing, you agree that your contribution is licensed under
`MIT OR Apache-2.0`, as the package is.

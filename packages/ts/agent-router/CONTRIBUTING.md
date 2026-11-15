# Contributing

Thanks for your interest in `@osdlc/agent-router`.

## Issues

Report bugs and ask for features in the [issue tracker](https://github.com/osdlc/osdlc/issues).
For a bug, include the library version, your runtime and its version, your operating system, and
the call and inputs that misbehave: the reference or profile, the catalogue layers and what the
availability callback returned. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/agent-router`, beside its Rust twin in `packages/rust/agent-router`. Open pull requests
there. They are reviewed and merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then work in the package
directory. The tests run on [Vitest](https://vitest.dev) under Node and need no network.

```sh
pnpm install
cd packages/ts/agent-router
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
```

## Code style

- TypeScript, ES modules, and explicit import paths for relative imports.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and `pnpm run lint`
  before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc and a use in `examples/`, which imports the package by name. A test
  fails if a stable value export has no example.
- An experimental export carries `@experimental` and is listed in the README's Stability section.
  A test checks that the two agree.
- For a change users can see, add a changeset: run `pnpm changeset` at the repository root.
  Start a breaking change's summary with `**Breaking:**`. Do not edit `CHANGELOG.md` or `version`
  by hand; the release writes them.

## Fixture vectors

The Rust twin is checked against JSON vectors this package emits to `fixtures/`.
`scripts/fixtures.ts` holds the inputs; the expected output is what this package computes. After
a change to behaviour, run `node scripts/emit-fixtures.ts` and commit the result, then run the
crate's tests (`cargo test -p agent-router` from `packages/rust`). `pnpm run check:extra` fails
when the committed files are stale; `tests/fixtures.test.ts` checks that the TypeScript
reproduces each vector. A behaviour change ships in both twins in the same pull request.

## The shipped snapshot

`node scripts/models-snapshot.ts` regenerates the catalogue snapshot from models.dev and prints
the diff for review; `--write` writes it. The README's "Snapshot release step" has the steps.

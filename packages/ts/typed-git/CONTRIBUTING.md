# Contributing

Thanks for your interest in `@osdlc/typed-git`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime (Node or Bun) and its version, the output of
`git --version`, your operating system, and the call and inputs that
misbehave. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/typed-git`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then work
in the package directory. The tests run on Vitest under Node 22 or later.
`git` must be on `PATH`:
many tests create real temporary repositories.

```sh
pnpm install
cd packages/ts/typed-git
pnpm run build
pnpm test
```

Build before testing: the examples import the package by name, and under Node
that name resolves to `dist/`. After a build, `pnpm run smoke` runs
`tests/smoke.mjs`, a short check of the built package under Node. It is not
published.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

`npm run <script>` works the same way once the workspace is installed.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behavior change or bug fix. Use a real temporary
  repository from `@osdlc/typed-git/testing` for behavior. Use a recording
  runner to check the argument array.
- A verb's arguments, absence codes and parser are defined once, in
  `verbs.ts`. Both clients use that definition. Do not copy them into
  `sync.ts` or `async.ts`.
- A new export gets TSDoc and an example in `examples/`, which imports the
  package by name.
- Keep comments short. Say why, not what.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

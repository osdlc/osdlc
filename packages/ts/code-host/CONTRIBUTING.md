# Contributing

Thanks for your interest in `@osdlc/code-host`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, and
the call and inputs that misbehave. Report security
problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/code-host`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.18 or later. They run offline: a fake runner stands in for `gh`,
`git` and `curl`, so the tests need no network and no login.

```sh
pnpm install
cd packages/ts/code-host
pnpm test
```

`pnpm run build` compiles the package to `dist/`.

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
- Add a test for each behaviour change or bug fix. Test through the fake
  runner and check the argv that would run.
- Shell out only through the command seam, never with a raw `child_process`
  call.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

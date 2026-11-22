# Contributing

Thanks for your interest in `@osdlc/diffkit`.

## Issues

Report bugs and ask for features in the [issue tracker](https://github.com/osdlc/osdlc/issues).
For a bug, include the library version, your Node.js version, your operating system, the `git` and
`gh` versions, and the command or call that misbehaves, with the manifest it printed. Report
security problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under `packages/ts/diffkit`.
Open pull requests there. They are reviewed and merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then work in the package
directory. The tests run on [Vitest](https://vitest.dev) under Node and need `git` on the PATH. They
build throwaway repositories in a temp directory and need no network and no login. The package
imports its sibling libraries through their built `dist/`, so run `pnpm run build` at the
repository root first.

```sh
pnpm install
pnpm run build
cd packages/ts/diffkit
pnpm test
```

`pnpm run coverage` reports test coverage. `pnpm run smoke` runs `tests/smoke.mjs`, a short check
of the built package and its binary under Node. Build first.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

To run the CLI from a checkout, build the package and run `node bin/diffkit.js prep --help`.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and `pnpm run lint`
  before you commit.
- Add a test for each behaviour change or bug fix. Test against a throwaway repository or a fake
  runner and check what ran.
- Shell out only through the command seam, never with a raw `child_process` call.
- A new export gets TSDoc and a use in `examples/`, which imports the package by name. A test
  fails if an export has no example.
- An experimental export carries `@experimental` and is listed in the README's Stability section.
  A test checks that the two agree.
- For a change users can see, add a changeset: run `pnpm changeset` at the repository root. Start a
  breaking change's summary with `**Breaking:**`. Do not edit `CHANGELOG.md` or `version` by hand.
  The release writes them. See
  [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

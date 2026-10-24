# Contributing

Thanks for your interest in `@osdlc/waypost`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
package version, your runtime and its version, your operating system, the
command you ran and the repository layout it misread. Report security problems
privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/waypost`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.22.2 or later. They build throwaway repositories in a temp
directory, need `git` on the PATH, and need no network. The package imports its
sibling libraries through their built `dist/`, so run `pnpm run build` at the
repository root first.

```sh
pnpm install
pnpm run build
cd packages/ts/waypost
pnpm test
```

To run the CLI from a checkout, build the package and run
`node bin/way.js --help`. The terminal UI's frames are committed under
`tests/frames/`; after a deliberate change to the UI, regenerate them with
`CAPTURE_FRAMES=1 pnpm exec vitest run tests/frames.test.ts` and review the
diff.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run smoke        # the built binary, after pnpm run build
```

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- Shell out only through `@osdlc/command-seam`, never with a raw
  `child_process` call.
- `src/web/` and `src/groups.ts` run in the browser: no Node built-ins there.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Do not edit `CHANGELOG.md` or `version` by hand; the release
  writes them. See
  [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

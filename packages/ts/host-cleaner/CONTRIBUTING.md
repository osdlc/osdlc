# Contributing

Thanks for your interest in `@osdlc/host-cleaner`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, and
the call and inputs that misbehave. Report security
problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/host-cleaner`. Open pull requests there. They are reviewed and merged
there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node 22.22.2 or later. They run offline and need `git` on the PATH. Some
tests build throwaway repositories in a temp directory, and a canned `gh`
stands in for GitHub, so the tests need no network and no login. The package
imports its sibling libraries through their built `dist/`, so run
`pnpm run build` at the repository root first.

```sh
pnpm install
pnpm run build
cd packages/ts/host-cleaner
pnpm test
```

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Drafting a descriptor

`scripts/draft-descriptor.ts` drafts a tier 1 descriptor from one store of
the system-cleanup research corpus, for you to review before it ships. Build
the workspace first (`pnpm run build` at the repository root), then, in the
package directory:

```sh
pnpm draft:descriptor <slug>                 # print the draft of one store
pnpm draft:descriptor --out <dir> <slug>...  # write <dir>/<slug>.yaml for each
pnpm draft:descriptor --out <dir> --first-set
```

- `--out <dir>` writes the drafts. A file already there is kept, since it may
  hold a review, unless you pass `--force`.
- `--first-set` drafts the stores the package ships descriptors for.
- `--corpus <dir>` reads another corpus folder in place of the dev
  dependency's.

A draft never sets `idleHours` or `removes`. What it can't put in a valid
file goes into comments at its top for the reviewer.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix. Test against a throwaway
  repository or a fake runner and check what ran.
- Shell out only through the command seam, never with a raw `child_process`
  call.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

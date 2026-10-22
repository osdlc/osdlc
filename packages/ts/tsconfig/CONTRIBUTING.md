# Contributing

Thanks for your interest in `@osdlc/tsconfig`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
preset, your TypeScript version and the error. Report security problems
privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/tsconfig`. Open pull requests there. They are reviewed and merged
there.

## Checking a change

The repository is a pnpm workspace. Install from the repository root, then work
in the package directory. The package ships JSON presets and no code, so it has
no build and no tests. `pnpm run typecheck` points `tsc` at `tests/resolve.json`,
which extends every preset by the specifier a consumer writes. Adding a preset
file without its `exports` entry fails there.

```sh
pnpm install
cd packages/ts/tsconfig
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

Every other package in the workspace extends these presets, so also run
`pnpm run typecheck` at the repository root after a change.

## Code style

- Prettier formats the files and oxlint checks them. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

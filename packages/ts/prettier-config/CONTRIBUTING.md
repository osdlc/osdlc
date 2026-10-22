# Contributing

Thanks for your interest in `@osdlc/prettier-config`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
config version, your Prettier version and a small file that formats wrongly.
Report security problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/prettier-config`. Open pull requests there. They are reviewed and
merged there.

## Checking a change

The repository is a pnpm workspace. Install from the repository root, then work
in the package directory. The package is one JSON file, `index.json`, and ships
no code, so it has no build and no tests. Every other package in the workspace
formats with it, so a change shows up in their `format:check`:

```sh
pnpm install
pnpm run format:check
pnpm -r run format:check
```

## Code style

- Prettier formats this package with its own config. Run `pnpm run format`
  before you commit.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

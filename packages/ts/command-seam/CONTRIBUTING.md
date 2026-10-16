# Contributing

Thanks for your interest in `@osdlc/command-seam`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug,
include the library version, your runtime (Node or Bun) and version, your
operating system, and a minimal example. Report security problems privately.
See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/command-seam`, which is a release mirror. Each release is
published there as a snapshot of the source, so changes cannot be merged
there directly. You can still open a pull request. The maintainer ports
accepted changes to the source and they appear in the next release. Please
expect that to take some time.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run under Bun today, so install
[Bun](https://bun.sh) as well as Node 22 or later.

```sh
pnpm install
cd packages/ts/command-seam
pnpm run build
pnpm test
```

Build before testing: the examples import the package by name, and under Node
that name resolves to `dist/`. After a build, `pnpm run smoke` runs a short
check of the built package under Node.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

`npm run <script>` and `bun run <script>` work the same way once the workspace
is installed.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code. Run `npm run format` before you commit.
- oxlint checks the code. Run `npm run lint`.
- No semicolons and single quotes, as Prettier enforces.
- Add a test for each behavior change or bug fix.
- For an API addition or change, add an example in `examples/` that shows the
  code a user would write. The change is judged by how that code reads. See
  [D-15](https://github.com/osdlc/osdlc/blob/main/packages/ts/command-seam/docs/planning/decisions/D-15-api-changes-start-from-consumer-code.md).
- Keep comments short. Say why, not what.
- Update `CHANGELOG.md` for changes users can see.

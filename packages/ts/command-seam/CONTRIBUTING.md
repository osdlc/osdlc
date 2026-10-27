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
`packages/ts/command-seam`. Open pull requests there. They are reviewed and
merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on Vitest under Node 22 or
later. Build first, because workspace packages resolve each other through
`dist/`.

```sh
pnpm install
cd packages/ts/command-seam
pnpm run build
pnpm test
```

Vitest runs the examples on the source (see `vitest.config.ts`), except
imports of `@osdlc/command-seam/quote`, which resolve to `dist/`. The
typecheck resolves the package's own name through `dist/`, so it needs a
build. After a build, `pnpm run smoke` runs `tests/smoke.mjs`, a short check
of the built package under Node. It is not published.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

`npm run <script>` works the same way once the workspace is installed.

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
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

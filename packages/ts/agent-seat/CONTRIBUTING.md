# Contributing

Thanks for your interest in this package.

## Issues

Report bugs and ask for features in the issue tracker of the repository that
hosts this package. For a bug, include the package version, your runtime and
its version, your operating system, the host and harness, and the call and
inputs that misbehave. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

Open pull requests against the repository that hosts this package. They are
reviewed and merged there.

## Running the tests

The tests run under [Vitest](https://vitest.dev) on Node. The package lives in the pnpm workspace of
[osdlc/osdlc](https://github.com/osdlc/osdlc). Build it and the libraries it
depends on first, then run the checks from the package directory:

```sh
pnpm --filter @osdlc/agent-seat... build
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run smoke
```

The tests need no terminal app: every host is driven through a fake command
runner. `tests/tmux-live.test.ts` also runs against a real tmux server when
`tmux` is installed, and is skipped otherwise.

## Code style

- TypeScript and ES modules, compiled to `dist/` by `tsc -p tsconfig.build.json`.
- A change users can see comes with a changeset (`pnpm changeset` at the
  repository root).
- Prettier formats the code and oxlint checks it.
- Every subprocess goes through an injected `CommandRunner`.
- Add a test for each behaviour change or bug fix.

# Contributing

Thanks for your interest in `@osdlc/typed-gh`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, your
`gh --version`, and the call and inputs that misbehave. Report security
problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

Open pull requests in the repository that holds this package. They are
reviewed and merged there.

## Running the tests

The tests run on [Bun](https://bun.sh). They run offline: a fake runner stands
in for `gh`, so the tests need no network, no login and no `gh` binary.

```sh
bun install
bun test
```

Other checks:

```sh
bun run typecheck
bun run lint
bun run format:check
```

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `bun run format` and
  `bun run lint` before you commit.
- Add a test for each behaviour change or bug fix. Test through the fake
  runner and check the argv that would run.
- A new export gets a doc comment and an example in `examples/`, which imports
  the package by name. A test fails if an exported function is not called, or
  an exported type not imported, in `examples/`. `tests/exports.test.ts` lists
  the few exports that have no example yet.
- Shell out only through the command seam, never with a raw `child_process`
  call.
- Add a line to `CHANGELOG.md` under `[Unreleased]` for a change users can see.
- Record a design choice in
  [`docs/decisions/`](https://github.com/osdlc/osdlc/tree/main/packages/ts/typed-gh/docs/decisions).

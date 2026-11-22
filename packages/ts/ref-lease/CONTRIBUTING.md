# Contributing

Thanks for your interest in `@osdlc/ref-lease`.

## Issues

Report bugs and ask for features in the [issue tracker](https://github.com/osdlc/osdlc/issues).
For a bug, include the library version, your runtime and its version, your operating system, and
the call and inputs that misbehave. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

Open pull requests in the repository that holds this package. They are reviewed and merged there.

## Running the tests

The tests run under [Vitest](https://vitest.dev) and need no network.

```sh
bun install
bun run test
```

Other checks:

```sh
bun run typecheck
bun run lint
bun run format:check
```

## The conformance suite

`packages/conformance/ref-lease/suite.json` is the family's conformance suite,
run by this package's `tests/conformance.test.ts` and by the Rust crate's
`tests/conformance.rs`. This package is the family's reference. A new case goes
into the suite first: write its `input` by hand, then run
`pnpm run conformance:write` to write its expected value, and both packages'
tests cover it. Neither package may add a case the other lacks.
[S-conformance-suites](../../../docs/planning/standards/S-conformance-suites.md)
is the standard.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `bun run format` and `bun run lint` before
  you commit.
- Add a test for each behaviour change or bug fix.
- Add a line to `CHANGELOG.md` under `[Unreleased]` for a change users can see.

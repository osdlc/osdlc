# Contributing

Thanks for your interest in `@osdlc/file-lock`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime (Node or Bun) and version, your operating
system and file system, and a minimal example. Report security problems
privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/file-lock`. Open pull requests there. They are reviewed and
merged there.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on Vitest under Node 22 or
later, against the TypeScript source. The smoke check below runs the built
package, so build before it.

```sh
pnpm install
cd packages/ts/file-lock
pnpm run build
pnpm test
```

`pnpm run smoke` runs `tests/smoke.mjs`, a short check of the built package
under Node. It is not published. `pnpm run coverage` reports test coverage.

`tests/conformance.test.ts` runs the `file-lock` conformance suite,
`packages/conformance/file-lock/suite.json`, which the Rust crate
`osdlc-file-lock` runs too. This package is the suite's reference: after
adding a case's `input` by hand, or changing behaviour the suite records, run
`pnpm run conformance:write` on Linux or macOS to rewrite the expected values.
A change to the protocol in `packages/conformance/file-lock/SPEC.md` is a
change to both implementations.

`tests/interop.test.ts` runs Node.js and Rust processes against one lock. It
is skipped unless the crate's example is built:

```sh
cargo build --manifest-path ../../rust/Cargo.toml -p osdlc-file-lock --example interop-counter
```

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- A new export gets TSDoc and a use in `examples/`, which imports the package
  by name. A test fails if an export has no example.
- An experimental export carries `@experimental` and is listed in the
  README's Stability section. A test checks that the two agree.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

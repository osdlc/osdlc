# Contributing

Thanks for your interest in `@osdlc/yaml-splice`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, the YAML input (escape a BOM or
`\r` so it survives copying), and the edits you passed. Report security
problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/yaml-splice`. Open pull requests there. They are reviewed and
merged there.

## Where a change goes

The editing itself is the `yaml-splice` Rust crate, in `packages/rust/yaml-splice`.
`packages/rust/yaml-splice-wasm` exposes it to JavaScript, and this package's
`index.ts` is the typed wrapper over that. A change to how YAML is edited goes
into the crate, with a fixture in its conformance corpus
(`packages/rust/yaml-splice/tests/fixtures/conformance.json`), which both the
crate's tests and this package's tests run.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on Vitest under Node 22 or
later. No Rust toolchain is needed:
the built WebAssembly is committed in `wasm/`.

```sh
pnpm install
cd packages/ts/yaml-splice
pnpm test
```

`pnpm test` runs the Vitest suite. Most tests run the source;
`tests/corpus-dist.test.ts` runs the conformance corpus on the built package,
so build first.

`pnpm run smoke` runs `tests/smoke.mjs`, a short check of the built package
under Node. It is not published.
`pnpm run coverage` reports test coverage.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Rebuilding the WebAssembly

`wasm/` is built from the crates by `packages/rust/yaml-splice-wasm/build.sh`
(`pnpm run build:wasm`). Rebuild it whenever either crate changes, and commit
the result. The script needs:

- the Rust toolchain pinned in `packages/rust/rust-toolchain.toml`, with the
  `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`);
- `wasm-bindgen` 0.2.126 (`cargo install wasm-bindgen-cli --version 0.2.126`);
- `wasm-opt` from binaryen `version_131`.

The `wasm` job in `.github/workflows/rust-ci.yml` rebuilds `wasm/` on every
pull request that touches the crates or `wasm/`, and fails when the result
differs from what is committed. When it fails, it uploads the rebuilt files
as the `yaml-splice-wasm` artifact.

A change that changes the WebAssembly changes what this package does, so it
needs a changeset for `@osdlc/yaml-splice` (see below), even when no file in
this directory other than `wasm/` changed.

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
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

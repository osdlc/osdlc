# Contributing

Thanks for your interest in `@osdlc/tradecraft-wasm`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, and the
request you passed. Report security problems privately. See
[SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/tradecraft-wasm`. Open pull requests there. They are reviewed and
merged there.

## Where a change goes

Every decision about a publish, an export, an adoption or a status is made by
the `tradecraft-core` Rust crate, in `packages/rust/tradecraft-core`.
`packages/rust/tradecraft-wasm` exposes it to JavaScript. This package is the
typed wrapper over that, plus the Node filesystem adapter. A change to what
the core does goes into the crate, not here.

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on Vitest under Node 22 or
later. No Rust toolchain is needed: the built WebAssembly is committed in
`wasm/`.

```sh
pnpm install
cd packages/ts/tradecraft-wasm
pnpm test
```

`pnpm run smoke` runs `tests/smoke.mjs`, a short check of the built package
under Node. Run `pnpm run build` first. It is not published.
`pnpm run coverage` reports test coverage.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

## Rebuilding the WebAssembly

`wasm/` is built from the crates by `packages/rust/tradecraft-wasm/build.sh`
(`pnpm run build:wasm`). Rebuild it whenever `tradecraft-core`,
`tradecraft-wasm` or a crate they depend on changes, and commit the result.
The script needs:

- the Rust toolchain pinned in `packages/rust/rust-toolchain.toml`, with the
  `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`);
- `wasm-bindgen` 0.2.126 (`cargo install wasm-bindgen-cli --version 0.2.126`);
- `wasm-opt` from binaryen `version_131`.

The `wasm` job in `.github/workflows/rust-ci.yml` rebuilds `wasm/` on every
pull request that touches the Rust crates or `wasm/`, and fails when the
result differs from what is committed. When it fails, it uploads the rebuilt
files as the `tradecraft-wasm` artifact.
The compiler can emit different bytes on macOS and on Linux, so commit the
Linux build from that artifact when you build on another system.

A change that changes the WebAssembly changes what this package does, so it
needs a changeset for `@osdlc/tradecraft-wasm` (see below), even when no file
in this directory other than `wasm/` changed.

## Regenerating the types

`src/core.generated.ts` is a copy of
`packages/rust/tradecraft-typegen/generated/core.generated.ts`. Do not edit
it. After a change to a wire type in Rust:

```sh
cd packages/rust
cargo run -p tradecraft-typegen
cp tradecraft-typegen/generated/core.generated.ts ../ts/tradecraft-wasm/src/core.generated.ts
```

`cargo test -p tradecraft-typegen` fails when the crate's file is behind the
Rust source. A test in this package fails when its copy differs from the
crate's. The `wasm` job also compares the two.

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand; the release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).

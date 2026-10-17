---
id: D-03
type: decision
state: accepted
created: 2026-10-17
---

# D-03: The committed WebAssembly and its check

## Decision

- The built WebAssembly and its glue are committed in `wasm/`. They are built
  from `packages/rust/yaml-splice` and `packages/rust/yaml-splice-wasm` by
  `packages/rust/yaml-splice-wasm/build.sh`, with pinned tools: the Rust
  toolchain in `packages/rust/rust-toolchain.toml`, `wasm-bindgen` 0.2.126
  and binaryen `version_131`.
- `build.sh` runs `cargo` from the Rust workspace, so the pinned toolchain is
  used, and maps the machine's paths (`CARGO_HOME`, the toolchain sysroot and
  the workspace) to fixed names with `--remap-path-prefix`. The standard
  library's source maps to `/rustc/<commit>`, as when the `rust-src`
  component is not installed. `wasm-opt` drops the `producers` section, which
  differs between a `cargo install`ed and a released `wasm-bindgen`. It fails when the
  built `.wasm` still contains a `/Users/` or `/home/` path.
- The `wasm` job in `.github/workflows/rust-ci.yml` runs `build.sh` on every
  pull request that touches the crates or `wasm/`, and fails when the result
  differs from what is committed. On a difference it uploads the rebuilt
  files.
- The package's build copies `wasm/` into `dist/wasm/`. The published tarball
  holds `dist/` only, so it ships the `.wasm` once.

## Why

- With `wasm/` committed, building and testing the TypeScript package needs
  no Rust toolchain. The root scripts run every package's `build` and `test`,
  so a missing `wasm/` would cost every contributor the toolchain, not only
  this package's.
- Without the path mapping the `.wasm` named the builder's home directory in
  24 places, and every build machine gave different bytes. With it, the bytes
  depend only on the pinned tools and the source, so CI can compare the
  rebuild with the commit byte for byte.

## Consequences

- A change to either crate that changes the `.wasm` must commit the rebuilt
  `wasm/`, and needs a changeset for this package.
- Moving a pinned tool version means rebuilding `wasm/` in the same pull
  request.

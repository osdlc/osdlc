# yaml-splice-wasm

The wasm-bindgen wrapper that exposes [`yaml-splice`](../yaml-splice) to
JavaScript and TypeScript: the WebAssembly half of the
[`@osdlc/yaml-splice`](../../ts/yaml-splice) npm package. It has no logic of its own, only bindings.

It is not published to crates.io (`publish = false`), and release-plz skips
it.

## Errors

`editYaml` throws a JavaScript `Error` for every refusal:

- A refusal from `yaml-splice` has the `EditError` variant as its `name`
  (`MissingKey`, `InvalidResult`, …) and, where known, a `span` of
  `{ start, end }`.
- An `edits` string that does not decode has the name `InvalidEdit`: it is
  not JSON, not a list of objects with one `Set`, `Remove` or `Rename` tag,
  or is missing a field. A `Set` value can nest at most 124 levels deep:
  serde_json stops at 128, and the edit list, the edit and its body take
  the other levels.

Anything else, such as a `RuntimeError` from a Rust panic, is not a refusal.
The npm package passes it through unchanged.

## Building

`build.sh` builds the crate for `wasm32-unknown-unknown`, runs `wasm-bindgen
--target nodejs` and `wasm-opt -Oz`, and writes the result to
`packages/ts/yaml-splice/wasm/`, which is committed (set `OUT_DIR` to write
elsewhere). Rebuild it whenever this crate or `yaml-splice` changes, and
commit the result. It needs:

- the toolchain pinned in `packages/rust/rust-toolchain.toml`, with the
  target added: `rustup target add wasm32-unknown-unknown`;
- the `wasm-bindgen` CLI at exactly the version of the `wasm-bindgen` crate
  (0.2.126, pinned with `=` in `packages/rust/Cargo.toml`):
  `cargo install wasm-bindgen-cli --version 0.2.126 --locked`;
- `wasm-opt` from binaryen, version 131.

```sh
bash packages/rust/yaml-splice-wasm/build.sh
```

The crate also builds for the host target, so it is part of the normal
workspace build and tests. The `wasm` job in `.github/workflows/rust-ci.yml`
runs `build.sh` and fails when the result differs from the committed
`packages/ts/yaml-splice/wasm/`.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

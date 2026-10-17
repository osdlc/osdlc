# yaml-splice-wasm

The wasm-bindgen wrapper that exposes [`yaml-splice`](../yaml-splice) to
JavaScript and TypeScript: the WebAssembly half of the yaml-splice npm
package. It has no logic of its own, only bindings.

It is not published to crates.io (`publish = false`), and release-plz skips
it.

## Building

`build.sh` builds the crate for `wasm32-unknown-unknown`, runs `wasm-bindgen
--target nodejs` and `wasm-opt -Oz`, and writes the result to
`packages/ts/yaml-splice/wasm/`, where the npm package will live once it
moves to this repo (set `OUT_DIR` to write elsewhere). It needs:

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
workspace build and tests. CI also builds it for `wasm32-unknown-unknown`.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

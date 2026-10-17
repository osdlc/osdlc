# yaml-splice-compare

Runs the edit shapes of `tests/neighbours.rs` through yaml-edit and yaml-splice. Not published.
Run it with `cargo run --release --manifest-path packages/rust/yaml-splice/compare/Cargo.toml`.
To test another yaml-edit, change the `yaml-edit` line in `Cargo.toml` to a path or git source.
Results and method: [COMPARISON.md](../COMPARISON.md).
CI does not build this harness, so a yaml-splice API change may break it.

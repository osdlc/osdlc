# system-model

A repository's structure, as typed data: the packages and crates it holds, the
dependencies they declare, and how their directories nest.

This is the Rust twin of [`@osdlc/system-model`](../../ts/system-model). It moves
here from the `manifest-graph` crate. The model types and the dependency graph
are in; the walk, the containment tree and the wire schema follow.

## Install

```sh
cargo add system-model
```

```rust
use system_model::{GraphOptions, ManifestInfo, build_dependency_graph};

let manifests: Vec<ManifestInfo> = Vec::new();
let graph = build_dependency_graph(&manifests, &GraphOptions::default());
assert!(graph.nodes.is_empty());
```

The graph is deterministic: nodes keep the walk's order, external nodes are
sorted by id and edges are sorted, so two runs diff cleanly.

`tests/mini-repo` is the fixture tree both implementations will walk once the walk lands here.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

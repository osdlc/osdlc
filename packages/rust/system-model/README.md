# system-model

A repository's structure, as typed data: the packages and crates it holds, the
dependencies they declare, and how their directories nest.

This is the Rust twin of [`@osdlc/system-model`](../../ts/system-model). It moves
here from the `manifest-graph` crate. The crate holds the model types, the walk, the
aspect scanners, the dependency graph, the containment tree and the wire
schema.

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

`walk_manifests(root, &WalkOptions::default())` finds and parses every
`package.json` and `Cargo.toml` under `root`. A malformed manifest comes back as
an entry with `error` set. Dependency tables are read in sorted key order.

`build_system_graph(root, include_external)` does all of it and returns the
`schema::SystemGraph` payload the system-graph viewer reads. The crate is the
authority on that shape; `@osdlc/system-model/graph` states it once for
TypeScript. Enum-shaped fields are strings on purpose, so a newer walker can add
a kind without breaking a consumer.

`tests/mini-repo` is the fixture tree both implementations walk.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.

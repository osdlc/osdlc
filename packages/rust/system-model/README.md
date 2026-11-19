# system-model

A repository's structure, as typed data: the packages and crates it holds, the
dependencies they declare, and how their directories nest.

This is the Rust twin of [`@osdlc/system-model`](../../ts/system-model). It moves
here from the `manifest-graph` crate. The model types, the walk, the aspect
scanners and the dependency graph are in; the containment tree and the wire
schema follow.

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

`tests/mini-repo` is the fixture tree both implementations walk.

## Licence

Dual-licensed under [MIT](./LICENSE-MIT) or [Apache-2.0](./LICENSE-APACHE), at your option.

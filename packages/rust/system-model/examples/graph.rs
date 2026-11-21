//! Build the dependency graph of an empty set of manifests.
//!
//! Run with `cargo run --example graph`.

use system_model::{GraphOptions, ManifestInfo, build_dependency_graph};

fn main() {
    let manifests: Vec<ManifestInfo> = Vec::new();
    let graph = build_dependency_graph(&manifests, &GraphOptions::default());
    println!("{} nodes", graph.nodes.len());
}

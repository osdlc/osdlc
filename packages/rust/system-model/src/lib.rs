//! # system-model
//!
//! A repository's structure, as typed data. Point it at a directory tree; it
//! finds every `package.json` and `Cargo.toml`, parses each into a typed
//! [`ManifestInfo`] and builds the dependency graph they declare.
//!
//! ```
//! use system_model::{GraphOptions, ManifestInfo, build_dependency_graph};
//!
//! let manifests: Vec<ManifestInfo> = Vec::new();
//! let graph = build_dependency_graph(&manifests, &GraphOptions::default());
//! assert!(graph.nodes.is_empty());
//! ```
//!
//! This is the Rust twin of `@osdlc/system-model`. The two walk one fixture
//! tree, `tests/mini-repo`, and assert the same contract.

mod graph;
mod model;

pub use graph::{GraphOptions, build_dependency_graph};
pub use model::{
    Aspect, DepDecl, DepKind, DependencyGraph, Ecosystem, Entry, Evidence, EvidenceKind, GraphEdge,
    GraphNode, ManifestInfo, NodeKind, SpecifierKind,
};

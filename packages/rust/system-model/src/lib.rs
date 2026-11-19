//! # system-model
//!
//! A repository's structure, as typed data: [`ManifestInfo`] for one parsed
//! manifest, and [`build_dependency_graph`] to turn a set of them into the
//! dependency graph they declare. The directory walk, the containment tree
//! and the wire schema follow in later changes.
//!
//! ```
//! use system_model::{GraphOptions, ManifestInfo, build_dependency_graph};
//!
//! let manifests: Vec<ManifestInfo> = Vec::new();
//! let graph = build_dependency_graph(&manifests, &GraphOptions::default());
//! assert!(graph.nodes.is_empty());
//! ```
//!
//! This is the Rust twin of `@osdlc/system-model`.

mod graph;
mod model;

pub use graph::{GraphOptions, build_dependency_graph};
pub use model::{
    Aspect, DepDecl, DepKind, DependencyGraph, Ecosystem, Entry, Evidence, EvidenceKind, GraphEdge,
    GraphNode, ManifestInfo, NodeKind, SpecifierKind,
};

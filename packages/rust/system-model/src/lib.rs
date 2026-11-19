//! # system-model
//!
//! A repository's structure, as typed data. [`walk_manifests`] finds every
//! `package.json` and `Cargo.toml` under a directory and parses each into a
//! [`ManifestInfo`]; [`build_dependency_graph`] turns them into the dependency
//! graph they declare, and [`scan_aspects`] reads the technologies a manifest
//! uses. The containment tree and the wire schema follow in a later change.
//!
//! ```
//! use system_model::{GraphOptions, ManifestInfo, build_dependency_graph};
//!
//! let manifests: Vec<ManifestInfo> = Vec::new();
//! let graph = build_dependency_graph(&manifests, &GraphOptions::default());
//! assert!(graph.nodes.is_empty());
//! ```
//!
//! Malformed manifests never abort a walk: they come back as entries
//! carrying an `error`.
//!
//! This is the Rust twin of `@osdlc/system-model`.

mod aspects;
mod graph;
mod model;
mod walk;

pub use aspects::scan_aspects;
pub use graph::{GraphOptions, build_dependency_graph};
pub use model::{
    Aspect, DepDecl, DepKind, DependencyGraph, Ecosystem, Entry, Evidence, EvidenceKind, GraphEdge,
    GraphNode, ManifestInfo, NodeKind, SpecifierKind,
};
pub use walk::{DEFAULT_EXCLUDES, WalkOptions, walk_manifests};

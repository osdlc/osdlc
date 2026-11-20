//! Wire types for the system-graph view: the focused project's own structure.
//!
//! This module is the authority on the shape. `@osdlc/system-model`'s `./graph`
//! states it once more for TypeScript. The payload is ephemeral: nothing here
//! persists, and `build_system_graph` assembles all of it from the manifests
//! on disk.
//!
//! Enum-shaped fields are `String`. A newer walker may add a kind, and a frontend that pattern-matched an exhaustive
//! enum would break on data it could simply have shown.
//!
//! The whole payload crosses once. Containment is a tree the viewer folds and
//! unfolds constantly; a round trip per collapse would be unusable, so the
//! full node set and the full edge set ship together and the client does its
//! own aggregation.

use serde::{Deserialize, Serialize};

/// One reason to believe a node has an aspect.
///
/// A wire mirror of `crate::Evidence`, not a re-export: a code generator
/// that reads this module sees the struct itself, which a re-export hides. The
/// same reason `SystemNode` is a flattening rather than a re-export of
/// `GraphNode`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    /// `manifest` | `dependency` | `files` | `content`.
    pub kind: String,
    /// The kind's tier — 1 is the most direct.
    pub tier: i64,
    /// What was inspected: `package.json#main`, `dependencies.vue`.
    pub source: String,
    /// What was there. The raw value, not a verdict about it.
    pub found: String,
}

/// One technology a node is, with everything that supported the claim.
///
/// Deliberately not a confidence score: the tier says how directly it was
/// seen, the evidence says what was seen, and a reader can weigh those without
/// being handed a total nobody can justify.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aspect {
    /// The technology's id, such as `typescript` or `nuxt`.
    pub id: String,
    /// The most direct tier that supported this aspect.
    pub tier: i64,
    /// Every reason found, in scanner order. Never empty.
    pub evidence: Vec<Evidence>,
}

impl From<&crate::Aspect> for Aspect {
    fn from(a: &crate::Aspect) -> Self {
        Self {
            id: a.id.clone(),
            tier: a.tier,
            evidence: a
                .evidence
                .iter()
                .map(|e| Evidence {
                    kind: e.kind.clone(),
                    tier: e.tier,
                    source: e.source.clone(),
                    found: e.found.clone(),
                })
                .collect(),
        }
    }
}

/// One package, crate, directory, or external dependency.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemNode {
    /// Stable within one payload: the manifest's name, else its root-relative
    /// directory. Synthetic nodes use a `:`-bearing id (`repo:root`,
    /// `external:node`) that no real package name can collide with.
    pub id: String,
    /// What to show. Never empty — a nameless manifest falls back to its dir.
    pub label: String,
    /// Root-relative directory, `""` for the repo itself. `None` for nodes
    /// that are not on disk here (externals and their groups).
    pub dir: Option<String>,
    /// The containing node's id. `None` marks a containment ROOT: the repo,
    /// and each external group — a registry package is not within the repo.
    pub parent: Option<String>,
    /// `repo` | `group` | `package` | `crate` | `external`. `group` is
    /// synthetic: a directory that holds manifests but declares none.
    pub kind: String,
    /// `node` | `rust`, or `None` for a directory, which belongs to neither.
    pub ecosystem: Option<String>,
    /// Named by some manifest but not present in the walked tree.
    pub external: bool,
    /// The manifest's own `description`, when it declares one.
    pub description: Option<String>,
    /// npm `"private": true`, or cargo `publish = false`.
    pub private: bool,
    /// Derived hint: npm `main` points at `nuxt.config.ts` — a Nuxt layer.
    pub is_nuxt_layer: bool,
    /// Derived hint: npm `bin` entries, or cargo `[[bin]]` sections.
    pub has_bin: bool,
    /// Set when this node's manifest could not be parsed. The node still
    /// appears: a half-written manifest the operator cannot see is worse than
    /// one marked.
    pub error: Option<String>,
    /// What this node IS, technologically, and what makes anyone think so.
    ///
    /// A list, because a package is rarely one technology: a Nuxt layer is
    /// usually TypeScript and Vue at once. Every aspect carries the evidence
    /// for it — a claim that cannot say what it saw is one nobody can check.
    /// Empty for synthetic nodes and externals, which have no manifest.
    pub aspects: Vec<Aspect>,
}

/// One declared dependency, from the declaring node to the depended-on node.
///
/// Containment is deliberately NOT here — it is `SystemNode.parent`. The two
/// relations have different shapes (a mesh and a tree) and the viewer draws
/// them differently.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemEdge {
    /// The declaring node's id.
    pub from: String,
    /// The depended-on node's id.
    pub to: String,
    /// `prod` | `dev` | `peer` | `optional` | `build`.
    pub kind: String,
    /// `workspace` | `file` | `path` | `registry` | `other`.
    pub specifier_kind: String,
    /// The raw specifier text (`workspace:*`, `^1.2.3`, a path, …).
    pub specifier: String,
}

/// The focused project's structure, in one payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemGraph {
    /// Absolute path of the project this graph was walked from — the project
    /// switcher's selection. Shown so the view can never lie about its scope.
    pub root: String,
    /// The checkout's directory name, and the repo node's label.
    pub root_label: String,
    /// True when external (registry) dependencies were included.
    pub include_external: bool,
    /// Every node, containers and externals included.
    pub nodes: Vec<SystemNode>,
    /// Every dependency edge.
    pub edges: Vec<SystemEdge>,
    /// Non-fatal oddities from the walk: duplicate manifest names, id
    /// collisions. Data, not errors — one duplicate must not blank the view.
    pub warnings: Vec<String>,
    /// Manifests walked, including ones that failed to parse.
    pub manifests_scanned: i64,
}

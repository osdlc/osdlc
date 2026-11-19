//! The manifest-graph data model. Plain structs on purpose: any provider
//! producing the same shapes can stand in for the walker.

use serde::{Deserialize, Serialize};

/// Which packaging ecosystem a manifest belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ecosystem {
    /// The `node` case.
    Node,
    /// The `rust` case.
    Rust,
}

impl Ecosystem {
    /// The lowercase wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            Ecosystem::Node => "node",
            Ecosystem::Rust => "rust",
        }
    }
}

/// How a dependency is declared.
///
/// Node: `dependencies` → `Prod`, `devDependencies` → `Dev`,
/// `peerDependencies` → `Peer`, `optionalDependencies` → `Optional`.
/// Cargo: `[dependencies]` → `Prod`, `[dev-dependencies]` → `Dev`,
/// `[build-dependencies]` → `Build`, and the same under `[target.*]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DepKind {
    /// The `prod` case.
    Prod,
    /// The `dev` case.
    Dev,
    /// The `peer` case.
    Peer,
    /// The `optional` case.
    Optional,
    /// The `build` case.
    Build,
}

impl DepKind {
    /// The lowercase wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            DepKind::Prod => "prod",
            DepKind::Dev => "dev",
            DepKind::Peer => "peer",
            DepKind::Optional => "optional",
            DepKind::Build => "build",
        }
    }
}

/// What the dependency's specifier points at.
///
/// - `Workspace` — node `workspace:` protocol, or cargo `workspace = true`
/// - `File` — node `file:` protocol
/// - `Path` — cargo `path = "…"` dependency
/// - `Registry` — a plain version range / dist-tag resolved from a registry
/// - `Other` — anything else (git URLs, `npm:` aliases, http tarballs, …)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpecifierKind {
    /// The `workspace` case.
    Workspace,
    /// The `file` case.
    File,
    /// The `path` case.
    Path,
    /// The `registry` case.
    Registry,
    /// The `other` case.
    Other,
}

impl SpecifierKind {
    /// The lowercase wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            SpecifierKind::Workspace => "workspace",
            SpecifierKind::File => "file",
            SpecifierKind::Path => "path",
            SpecifierKind::Registry => "registry",
            SpecifierKind::Other => "other",
        }
    }
}

/// What a graph node structurally IS — the axis containment is drawn on.
///
/// `Group` nodes are synthetic: they stand for a directory that holds
/// manifests but declares none of its own (`packages/ts`, `apps`). `Repo` is
/// the single containment root. `External` nodes sit outside the tree
/// entirely — a registry dependency is not *within* the repo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    /// The `repo` case.
    Repo,
    /// The `group` case.
    Group,
    /// The `package` case.
    Package,
    /// The `crate` case.
    Crate,
    /// The `external` case.
    External,
}

impl NodeKind {
    /// The lowercase wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            NodeKind::Repo => "repo",
            NodeKind::Group => "group",
            NodeKind::Package => "package",
            NodeKind::Crate => "crate",
            NodeKind::External => "external",
        }
    }
}

/// One declared dependency, as written in the manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DepDecl {
    /// The depended-on package's real name, not a local alias: a cargo
    /// `package = "…"` (own or inherited from `[workspace.dependencies]`), or
    /// the package an npm `npm:<name>@<range>` alias points at.
    pub name: String,
    /// What `build_dependency_graph` accepts.
    pub kind: DepKind,
    /// The raw specifier text (`workspace:*`, `^1.2.3`, a path, …).
    pub specifier: String,
    /// What `build_dependency_graph` accepts.
    pub specifier_kind: SpecifierKind,
}

/// Where an aspect's evidence came from, most direct first.
///
/// Peer of `@osdlc/system-model`'s `EvidenceKind`. Adding a variant is a
/// wire change and has to be made on both sides.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EvidenceKind {
    /// The manifest says so about itself. No inference.
    Manifest,
    /// It depends on something that implies the aspect. Strong, but inferential.
    Dependency,
    /// Something on disk says so. Costs a directory read; no scanner yet.
    Files,
    /// The inside of a file says so. The most accurate and most expensive.
    Content,
}

impl EvidenceKind {
    /// The lowercase wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            EvidenceKind::Manifest => "manifest",
            EvidenceKind::Dependency => "dependency",
            EvidenceKind::Files => "files",
            EvidenceKind::Content => "content",
        }
    }

    /// Lower is more direct.
    pub fn tier(self) -> i64 {
        match self {
            EvidenceKind::Manifest => 1,
            EvidenceKind::Dependency => 2,
            EvidenceKind::Files => 3,
            EvidenceKind::Content => 4,
        }
    }
}

/// One reason to believe an aspect applies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Evidence {
    /// An [`EvidenceKind`], widened — a newer walker may learn a fifth.
    pub kind: String,
    /// The kind's tier, carried so a reader need not join.
    pub tier: i64,
    /// What was inspected, in a form someone can go and look at.
    pub source: String,
    /// What was there. The raw value, not a verdict about it.
    pub found: String,
}

/// One technology a node is, with everything that supported the claim.
///
/// Deliberately not a confidence score: the tier says how directly it was
/// seen, the evidence says what was seen, and a reader can weigh those without
/// being handed a total nobody can justify.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Aspect {
    /// What `build_dependency_graph` accepts.
    pub id: String,
    /// The most direct tier that supported this aspect.
    pub tier: i64,
    /// Every reason found, in scanner order. Never empty.
    pub evidence: Vec<Evidence>,
}

/// The entry points a package declares, kept verbatim.
///
/// Read rather than discarded because an entry point's EXTENSION is the
/// package's own statement about what it ships. Both `None` for cargo, which
/// has no equivalent field.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    /// What `build_dependency_graph` accepts.
    pub main: Option<String>,
    /// What `build_dependency_graph` accepts.
    pub types: Option<String>,
}

/// One manifest found by the walk.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestInfo {
    /// Absolute path to the manifest file.
    pub path: String,
    /// Directory holding the manifest, relative to the walk root
    /// (`""` = the root itself). Always `/`-separated.
    pub dir: String,
    /// What `build_dependency_graph` accepts.
    pub ecosystem: Ecosystem,
    /// `package.json` `name`, or cargo `[package].name`. `None` when absent
    /// (e.g. a virtual cargo workspace root).
    pub name: Option<String>,
    /// Declared version, when it is a plain string.
    pub version: Option<String>,
    /// Node `"private": true`, or cargo `publish = false`.
    pub private: bool,
    /// What `build_dependency_graph` accepts.
    pub description: Option<String>,
    /// Workspace declarations: node `workspaces` globs, or cargo
    /// `[workspace].members`.
    pub workspaces: Vec<String>,
    /// The entry points a package declares — see [`Entry`].
    pub entry: Entry,
    /// Derived hint: node `main` points at `nuxt.config.ts`, the Nuxt-layer
    /// convention.
    pub is_nuxt_layer: bool,
    /// Derived hint: node `bin` entries, or cargo `[[bin]]` sections.
    pub has_bin: bool,
    /// What `build_dependency_graph` accepts.
    pub deps: Vec<DepDecl>,
    /// Set when the manifest could not be parsed. The entry still appears in
    /// the walk result (with empty/default fields) so a malformed file never
    /// aborts the walk — it just carries its error.
    pub error: Option<String>,
}

impl ManifestInfo {
    /// A blank entry for `path`, used as the base every parser fills in and as
    /// the shape an unreadable manifest degrades to.
    #[allow(dead_code)] // used by the walk, which follows in the next change
    pub(crate) fn blank(path: String, dir: String, ecosystem: Ecosystem) -> Self {
        Self {
            path,
            dir,
            ecosystem,
            name: None,
            version: None,
            private: false,
            description: None,
            workspaces: Vec::new(),
            entry: Entry::default(),
            is_nuxt_layer: false,
            has_bin: false,
            deps: Vec::new(),
            error: None,
        }
    }
}

/// One node of the graph.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GraphNode {
    /// Stable id: the manifest name when it has one, else its root-relative
    /// dir (`"."` for the walk root). De-collided with a suffix if two
    /// manifests would otherwise share an id — see the graph `warnings`.
    pub id: String,
    /// What `build_dependency_graph` accepts.
    pub name: Option<String>,
    /// Root-relative dir for in-set manifests and synthetic groups; `None` for
    /// external nodes.
    pub dir: Option<String>,
    /// For in-set nodes, the manifest's ecosystem. For external nodes, the
    /// ecosystem of the (first) manifest that declared the dependency. For a
    /// synthetic group, `None` — a directory belongs to no ecosystem.
    pub ecosystem: Option<Ecosystem>,
    /// True for a dependency named by some manifest but not present in the
    /// walked set.
    pub external: bool,
    /// What `build_dependency_graph` accepts.
    pub kind: NodeKind,
    /// The containing node's id. `None` for containment roots: the repo node,
    /// and any external node not placed under an external group.
    pub parent: Option<String>,
    /// The full manifest, for in-set nodes.
    pub manifest: Option<ManifestInfo>,
}

/// One edge: a manifest declaring a dependency on another node.
///
/// Containment is deliberately NOT an edge — it is the `parent` field on
/// `GraphNode`. A renderer that groups by containment needs a tree, and a
/// tree expressed as edges has to be re-derived by every consumer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GraphEdge {
    /// `GraphNode.id` of the declaring manifest.
    pub from: String,
    /// `GraphNode.id` of the dependency target.
    pub to: String,
    /// What `build_dependency_graph` accepts.
    pub kind: DepKind,
    /// What `build_dependency_graph` accepts.
    pub specifier_kind: SpecifierKind,
    /// The raw specifier text, carried through from the `DepDecl`.
    pub specifier: String,
}

/// The result of `build_dependency_graph`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DependencyGraph {
    /// What `build_dependency_graph` accepts.
    pub nodes: Vec<GraphNode>,
    /// What `build_dependency_graph` accepts.
    pub edges: Vec<GraphEdge>,
    /// Non-fatal oddities: duplicate names, id collisions.
    pub warnings: Vec<String>,
}

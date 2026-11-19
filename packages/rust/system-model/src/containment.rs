//! Containment: the tree a repository's directory layout implies.
//!
//! Dependencies are a mesh and belong on edges. Containment is a tree and
//! belongs on `GraphNode.parent` — a renderer that groups by containment
//! (collapsing a directory into one node and rolling its descendants'
//! dependencies onto it) needs the tree, and a tree smuggled in as edges has
//! to be re-derived by every consumer.
//!
//! Three node populations come out of this pass:
//!
//! - the single `Repo` root — always synthetic, standing for the checkout;
//! - synthetic `Group` nodes for directories that HOLD manifests but declare
//!   none (`packages/ts`, `apps`), minus the ones that carry no information —
//!   see chain collapse below;
//! - the manifests themselves, each parented to its nearest ancestor.
//!
//! Externals stay outside the tree: a registry package is not *within* the
//! repo. They are optionally gathered under one synthetic group per ecosystem
//! so a viewer can fold the whole registry cloud with one click.

use std::collections::{BTreeMap, BTreeSet, HashSet};

use crate::model::{DependencyGraph, Ecosystem, GraphNode, NodeKind};

/// What `apply_containment` accepts.
#[derive(Debug, Clone)]
pub struct ContainmentOptions {
    /// Name for the repo root node. Default `"repository"`.
    pub root_label: String,
    /// Gather external nodes under one synthetic group per ecosystem.
    pub group_externals: bool,
}

impl Default for ContainmentOptions {
    fn default() -> Self {
        Self {
            root_label: "repository".to_string(),
            group_externals: true,
        }
    }
}

/// Synthetic id for the containment root. As with the external groups, the
/// `:` keeps it clear of every real package and crate name — and of the `"."`
/// a virtual cargo workspace root at the checkout top already falls back to.
pub const ROOT_ID: &str = "repo:root";

/// Synthetic id for the per-ecosystem external group. `:` cannot appear in an
/// npm package name or a crate name, so these cannot collide with a real one.
fn external_group_id(ecosystem: Ecosystem) -> &'static str {
    match ecosystem {
        Ecosystem::Node => "external:node",
        Ecosystem::Rust => "external:rust",
    }
}

/// Opening of the warning this pass emits when a group directory's id is
/// taken. A re-run drops its own warnings by this prefix;
/// `build_dependency_graph`'s collision warnings read `id collision: "…` and
/// are left alone.
const GROUP_COLLISION_WARNING: &str = "id collision: directory";

fn external_group_label(ecosystem: Ecosystem) -> &'static str {
    match ecosystem {
        Ecosystem::Node => "npm",
        Ecosystem::Rust => "crates.io",
    }
}

/// Stamp `parent` on every node and insert the synthetic `Repo` / `Group`
/// nodes the tree needs. Idempotent: a second call re-derives from scratch
/// under its own `options`, landing exactly where a first call with those
/// options would. Meant to run once, straight after `build_dependency_graph`.
pub fn apply_containment(graph: &mut DependencyGraph, options: &ContainmentOptions) {
    // Undo any previous pass first. Everything below is minted
    // unconditionally, so re-running over an already-contained graph would
    // append a SECOND `repo:root` and a second external group per ecosystem.
    // `Repo` and `Group` are the kinds only this pass mints —
    // `build_dependency_graph` emits `Package`, `Crate` and `External` — so
    // dropping those nodes, unstamping every `parent` and clearing the
    // warnings this pass owns restores the pre-containment shape.
    graph
        .nodes
        .retain(|n| !matches!(n.kind, NodeKind::Repo | NodeKind::Group));
    for node in graph.nodes.iter_mut() {
        node.parent = None;
    }
    graph
        .warnings
        .retain(|w| !w.starts_with(GROUP_COLLISION_WARNING));

    let mut used_ids: HashSet<String> = graph.nodes.iter().map(|n| n.id.clone()).collect();

    // ── the root ─────────────────────────────────────────────────────────
    // Always synthetic. The checkout is not the same thing as the manifest
    // that happens to sit at its top — and a monorepo root commonly carries
    // TWO (a `package.json` beside a virtual-workspace `Cargo.toml`), so
    // electing one of them the repo would be arbitrary. Both become children.
    let root_id = ROOT_ID.to_string();
    used_ids.insert(root_id.clone());
    graph.nodes.insert(
        0,
        GraphNode {
            id: root_id.clone(),
            name: Some(options.root_label.clone()),
            dir: Some(String::new()),
            ecosystem: None,
            external: false,
            kind: NodeKind::Repo,
            parent: None,
            manifest: None,
        },
    );

    // ── which node owns which directory ──────────────────────────────────
    // Two manifests can share a directory (a `package.json` beside a
    // `Cargo.toml`). Below the root the first in walk order owns the dir and
    // the other becomes its child, rather than a sibling floating at the
    // grandparent.
    let mut dir_owner: BTreeMap<String, String> = BTreeMap::new();
    dir_owner.insert(String::new(), root_id.clone());
    let mut co_located: BTreeMap<String, String> = BTreeMap::new();
    for node in graph.nodes.iter() {
        if node.external || node.id == root_id {
            continue;
        }
        let Some(dir) = node.dir.clone() else {
            continue;
        };
        if dir.is_empty() {
            continue; // a top-level manifest is a child of the repo, not the repo
        }
        match dir_owner.get(&dir) {
            None => {
                dir_owner.insert(dir, node.id.clone());
            }
            Some(owner) => {
                co_located.insert(node.id.clone(), owner.clone());
            }
        }
    }

    // ── candidate group directories ──────────────────────────────────────
    // Every proper ancestor of a manifest dir that holds no manifest itself.
    let mut group_dirs: BTreeSet<String> = BTreeSet::new();
    for dir in dir_owner.keys() {
        for ancestor in ancestors(dir) {
            if !dir_owner.contains_key(&ancestor) {
                group_dirs.insert(ancestor);
            }
        }
    }

    // ── chain collapse ───────────────────────────────────────────────────
    // A group with exactly one child says nothing the child does not already
    // say, so `…/runners/sqlite/builder` reports one node, not three, while
    // `packages/ts` (many children) survives. Manifest dirs are never removed:
    // they are real, whatever their fan-out.
    loop {
        let tree: BTreeSet<String> = dir_owner
            .keys()
            .cloned()
            .chain(group_dirs.iter().cloned())
            .collect();
        let mut child_count: BTreeMap<String, usize> = BTreeMap::new();
        for dir in &tree {
            if dir.is_empty() {
                continue;
            }
            *child_count.entry(nearest_ancestor(dir, &tree)).or_insert(0) += 1;
        }
        let doomed: Vec<String> = group_dirs
            .iter()
            .filter(|g| child_count.get(*g).copied().unwrap_or(0) <= 1)
            .cloned()
            .collect();
        if doomed.is_empty() {
            break;
        }
        for g in doomed {
            group_dirs.remove(&g);
        }
    }

    // ── materialize the surviving groups ─────────────────────────────────
    let tree: BTreeSet<String> = dir_owner
        .keys()
        .cloned()
        .chain(group_dirs.iter().cloned())
        .collect();
    let mut group_ids: BTreeMap<String, String> = BTreeMap::new();
    for dir in &group_dirs {
        let id = claim(dir, &mut used_ids);
        if &id != dir {
            graph.warnings.push(format!(
                "{GROUP_COLLISION_WARNING} \"{dir}\" already taken — using \"{id}\""
            ));
        }
        group_ids.insert(dir.clone(), id);
    }
    let id_at = |dir: &str| -> String {
        dir_owner
            .get(dir)
            .or_else(|| group_ids.get(dir))
            .cloned()
            .unwrap_or_else(|| root_id.clone())
    };

    let group_nodes: Vec<GraphNode> = group_dirs
        .iter()
        .map(|dir| GraphNode {
            id: group_ids[dir].clone(),
            name: Some(label_under(dir, &nearest_ancestor(dir, &tree))),
            dir: Some(dir.clone()),
            ecosystem: None,
            external: false,
            kind: NodeKind::Group,
            parent: Some(id_at(&nearest_ancestor(dir, &tree))),
            manifest: None,
        })
        .collect();

    // ── stamp parents on the manifests ───────────────────────────────────
    for node in graph.nodes.iter_mut() {
        if node.external || node.id == root_id {
            continue;
        }
        if let Some(owner) = co_located.get(&node.id) {
            node.parent = Some(owner.clone());
            continue;
        }
        let Some(dir) = node.dir.clone() else {
            continue;
        };
        node.parent = Some(id_at(&nearest_ancestor(&dir, &tree)));
    }

    // ── externals ────────────────────────────────────────────────────────
    let mut external_groups: Vec<GraphNode> = Vec::new();
    if options.group_externals {
        let ecosystems: BTreeSet<Ecosystem> = graph
            .nodes
            .iter()
            .filter(|n| n.external)
            .filter_map(|n| n.ecosystem)
            .collect();
        for ecosystem in ecosystems {
            let id = external_group_id(ecosystem).to_string();
            used_ids.insert(id.clone());
            external_groups.push(GraphNode {
                id,
                name: Some(external_group_label(ecosystem).to_string()),
                dir: None,
                ecosystem: Some(ecosystem),
                external: true,
                kind: NodeKind::Group,
                parent: None,
                manifest: None,
            });
        }
        for node in graph.nodes.iter_mut().filter(|n| n.external) {
            if let Some(ecosystem) = node.ecosystem {
                node.parent = Some(external_group_id(ecosystem).to_string());
            }
        }
    }

    // Groups land after the manifests and before the external tail, so the
    // vec still reads root-ish → in-set → outside.
    let split = graph
        .nodes
        .iter()
        .position(|n| n.external)
        .unwrap_or(graph.nodes.len());
    let tail: Vec<GraphNode> = graph.nodes.split_off(split);
    graph.nodes.extend(group_nodes);
    graph.nodes.extend(external_groups);
    graph.nodes.extend(tail);
}

/// A group's display name: its path with the container's path stripped off.
/// `packages/ts` under `packages` reads `ts`; `tools/cage/crates` sitting at
/// the repo root (its middle links chain-collapsed) keeps all three segments
/// rather than claiming to be some other repo's `crates`.
fn label_under(dir: &str, parent_dir: &str) -> String {
    if parent_dir.is_empty() {
        return dir.to_string();
    }
    dir.strip_prefix(parent_dir)
        .and_then(|r| r.strip_prefix('/'))
        .unwrap_or(dir)
        .to_string()
}

/// Every proper ancestor of `dir`, excluding the root (`""`).
/// `a/b/c` → `["a", "a/b"]`.
fn ancestors(dir: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut acc = String::new();
    let segments: Vec<&str> = dir.split('/').filter(|s| !s.is_empty()).collect();
    for segment in segments.iter().take(segments.len().saturating_sub(1)) {
        if !acc.is_empty() {
            acc.push('/');
        }
        acc.push_str(segment);
        out.push(acc.clone());
    }
    out
}

/// The longest strict prefix of `dir` present in `tree`, on a `/` boundary.
/// Falls back to the root (`""`), which every tree contains.
fn nearest_ancestor(dir: &str, tree: &BTreeSet<String>) -> String {
    for candidate in ancestors(dir).into_iter().rev() {
        if tree.contains(&candidate) {
            return candidate;
        }
    }
    String::new()
}

/// `preferred` if free, else `preferred#group`, else numbered.
fn claim(preferred: &str, used: &mut HashSet<String>) -> String {
    if !used.contains(preferred) {
        used.insert(preferred.to_string());
        return preferred.to_string();
    }
    let suffixed = format!("{preferred}#group");
    if !used.contains(&suffixed) {
        used.insert(suffixed.clone());
        return suffixed;
    }
    let mut n = 2;
    while used.contains(&format!("{preferred}#group{n}")) {
        n += 1;
    }
    let id = format!("{preferred}#group{n}");
    used.insert(id.clone());
    id
}

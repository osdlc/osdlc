//! The pure half: manifests in, dependency graph out. No I/O.

use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};

use crate::model::{DependencyGraph, Ecosystem, GraphEdge, GraphNode, ManifestInfo, NodeKind};

/// What `build_dependency_graph` accepts.
#[derive(Debug, Clone, Default)]
pub struct GraphOptions {
    /// Materialize dependencies that name nothing in the manifest set as nodes
    /// flagged `external`. Default: such dependencies are dropped.
    pub include_external: bool,
}

/// Build a dependency graph from a set of walked manifests. Pure — no I/O.
///
/// One node per manifest; edges connect a declaring manifest to the in-set
/// manifest whose `name` matches the dependency, within the same ecosystem
/// (a cargo dep never resolves to an npm package of the same name).
///
/// Output is deterministic: in-set nodes keep the walk's order, external nodes
/// are appended sorted by id, and edges are sorted. Callers render this, diff
/// it, and gate on it — an unstable order would show up as phantom churn.
pub fn build_dependency_graph(
    manifests: &[ManifestInfo],
    options: &GraphOptions,
) -> DependencyGraph {
    let mut warnings = Vec::new();
    let mut nodes: Vec<GraphNode> = Vec::new();
    let mut used_ids: HashSet<String> = HashSet::new();
    // `{ecosystem}:{name}` -> node id, for edge resolution.
    let mut by_name: HashMap<String, String> = HashMap::new();

    for m in manifests {
        let dir_id = if m.dir.is_empty() {
            ".".to_string()
        } else {
            m.dir.clone()
        };
        // An empty name is no name: it falls back to the dir and claims no key.
        let name = m.name.as_deref().filter(|n| !n.is_empty());
        let preferred = name.map_or_else(|| dir_id.clone(), str::to_string);
        let id = claim_id(
            &preferred,
            &[dir_id, format!("{preferred}#{}", m.ecosystem.as_str())],
            &mut used_ids,
        );
        if id != preferred {
            let where_ = if m.dir.is_empty() { "." } else { &m.dir };
            warnings.push(format!(
                "id collision: \"{preferred}\" ({where_}) already taken — using \"{id}\""
            ));
        }
        nodes.push(GraphNode {
            id: id.clone(),
            name: m.name.clone(),
            dir: Some(m.dir.clone()),
            ecosystem: Some(m.ecosystem),
            external: false,
            kind: match m.ecosystem {
                Ecosystem::Node => NodeKind::Package,
                Ecosystem::Rust => NodeKind::Crate,
            },
            parent: None,
            manifest: Some(m.clone()),
        });
        if let Some(name) = name {
            let key = format!("{}:{name}", m.ecosystem.as_str());
            match by_name.entry(key) {
                Entry::Vacant(slot) => {
                    slot.insert(id);
                }
                Entry::Occupied(_) => {
                    let where_ = if m.dir.is_empty() { "." } else { &m.dir };
                    warnings.push(format!(
                        "duplicate {} manifest name \"{name}\" ({where_}) — edges resolve to the first",
                        m.ecosystem.as_str()
                    ));
                }
            }
        }
    }

    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut externals: HashMap<String, String> = HashMap::new();
    let mut external_nodes: Vec<GraphNode> = Vec::new();

    // Snapshot the declaring side first: resolving a dependency can mint a new
    // external node, and growing `nodes` while borrowing it would not compile.
    let declarers: Vec<(String, ManifestInfo)> = nodes
        .iter()
        .filter_map(|n| n.manifest.clone().map(|m| (n.id.clone(), m)))
        .collect();

    for (node_id, manifest) in declarers {
        for dep in &manifest.deps {
            let key = format!("{}:{}", manifest.ecosystem.as_str(), dep.name);
            let to = match by_name.get(&key) {
                Some(id) => id.clone(),
                None => {
                    if !options.include_external {
                        continue;
                    }
                    match externals.get(&key) {
                        Some(id) => id.clone(),
                        None => {
                            let id = claim_id(
                                &dep.name,
                                &[format!("{}#external", dep.name)],
                                &mut used_ids,
                            );
                            externals.insert(key, id.clone());
                            external_nodes.push(GraphNode {
                                id: id.clone(),
                                name: Some(dep.name.clone()),
                                dir: None,
                                ecosystem: Some(manifest.ecosystem),
                                external: true,
                                kind: NodeKind::External,
                                parent: None,
                                manifest: None,
                            });
                            id
                        }
                    }
                }
            };
            edges.push(GraphEdge {
                from: node_id.clone(),
                to,
                kind: dep.kind,
                specifier_kind: dep.specifier_kind,
                specifier: dep.specifier.clone(),
            });
        }
    }

    external_nodes.sort_by(|a, b| a.id.cmp(&b.id));
    nodes.extend(external_nodes);

    edges.sort_by(|a, b| {
        a.from
            .cmp(&b.from)
            .then_with(|| a.to.cmp(&b.to))
            .then_with(|| a.kind.as_str().cmp(b.kind.as_str()))
            .then_with(|| a.specifier.cmp(&b.specifier))
    });

    DependencyGraph {
        nodes,
        edges,
        warnings,
    }
}

/// First non-empty unused candidate, else `preferred#n`.
fn claim_id(preferred: &str, fallbacks: &[String], used: &mut HashSet<String>) -> String {
    for candidate in std::iter::once(preferred).chain(fallbacks.iter().map(String::as_str)) {
        if !candidate.is_empty() && !used.contains(candidate) {
            used.insert(candidate.to_string());
            return candidate.to_string();
        }
    }
    let mut n = 2;
    while used.contains(&format!("{preferred}#{n}")) {
        n += 1;
    }
    let id = format!("{preferred}#{n}");
    used.insert(id.clone());
    id
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{DepDecl, DepKind, SpecifierKind};

    fn manifest(name: &str, dir: &str, ecosystem: Ecosystem, deps: &[&str]) -> ManifestInfo {
        ManifestInfo {
            name: Some(name.to_string()),
            deps: deps
                .iter()
                .map(|d| DepDecl {
                    name: (*d).to_string(),
                    kind: DepKind::Prod,
                    specifier: "workspace:*".to_string(),
                    specifier_kind: SpecifierKind::Workspace,
                })
                .collect(),
            ..ManifestInfo::blank(format!("/r/{dir}/package.json"), dir.to_string(), ecosystem)
        }
    }

    #[test]
    fn an_in_set_dependency_becomes_an_edge() {
        let manifests = vec![
            manifest("a", "a", Ecosystem::Node, &["b", "lodash"]),
            manifest("b", "b", Ecosystem::Node, &[]),
        ];
        let graph = build_dependency_graph(&manifests, &GraphOptions::default());
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(
            (graph.edges[0].from.as_str(), graph.edges[0].to.as_str()),
            ("a", "b")
        );
    }

    #[test]
    fn include_external_adds_external_nodes() {
        let manifests = vec![manifest("a", "a", Ecosystem::Node, &["lodash"])];
        let graph = build_dependency_graph(
            &manifests,
            &GraphOptions {
                include_external: true,
            },
        );
        let external: Vec<_> = graph.nodes.iter().filter(|n| n.external).collect();
        assert_eq!(external.len(), 1);
        assert_eq!(external[0].kind, NodeKind::External);
        assert_eq!(graph.edges.len(), 1);
    }

    #[test]
    fn a_cargo_dep_never_resolves_to_an_npm_package() {
        let manifests = vec![
            manifest("a", "a", Ecosystem::Rust, &["b"]),
            manifest("b", "b", Ecosystem::Node, &[]),
        ];
        let graph = build_dependency_graph(&manifests, &GraphOptions::default());
        assert!(graph.edges.is_empty());
    }

    #[test]
    fn a_duplicate_name_warns_and_gets_a_distinct_id() {
        let manifests = vec![
            manifest("x", "one", Ecosystem::Node, &[]),
            manifest("x", "two", Ecosystem::Node, &[]),
        ];
        let graph = build_dependency_graph(&manifests, &GraphOptions::default());
        assert_ne!(graph.nodes[0].id, graph.nodes[1].id);
        assert!(!graph.warnings.is_empty());
    }
}

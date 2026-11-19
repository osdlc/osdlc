//! `build_system_graph`: walk a project and flatten it into the wire payload.

use std::fmt;
use std::path::Path;

use crate::aspects::scan_aspects;
use crate::containment::{ContainmentOptions, apply_containment};
use crate::graph::{GraphOptions, build_dependency_graph};
use crate::model::{Ecosystem, GraphNode};
use crate::schema::{SystemEdge, SystemGraph, SystemNode};
use crate::walk::{WalkOptions, walk_manifests};

/// `root` is not a directory.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotADirectory(pub String);

impl fmt::Display for NotADirectory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "not a directory: {}", self.0)
    }
}

impl std::error::Error for NotADirectory {}

fn workspace_label(ecosystem: Ecosystem) -> &'static str {
    match ecosystem {
        Ecosystem::Node => "Node workspace",
        Ecosystem::Rust => "Rust workspace",
    }
}

/// What to call a node on screen: its name, else its directory, else the
/// ecosystem's word for a nameless workspace root, else its id.
fn node_label(n: &GraphNode) -> String {
    if let Some(name) = n.name.as_ref().filter(|s| !s.is_empty()) {
        return name.clone();
    }
    if let Some(dir) = n.dir.as_ref().filter(|d| !d.is_empty()) {
        return dir.clone();
    }
    if let Some(ecosystem) = n.ecosystem {
        return workspace_label(ecosystem).to_string();
    }
    n.id.clone()
}

/// Walk `root` and return its structure as the [`SystemGraph`] wire payload.
///
/// Stateless and uncached: the walk is fast, and a cache would let the view
/// disagree with the disk after an install or a new package.
pub fn build_system_graph(
    root: &Path,
    include_external: bool,
) -> Result<SystemGraph, NotADirectory> {
    if !root.is_dir() {
        return Err(NotADirectory(root.display().to_string()));
    }
    // Absolute, so `root` and the checkout's label hold for a relative input like `.`.
    let absolute = std::path::absolute(root).unwrap_or_else(|_| root.to_path_buf());
    let root = absolute.as_path();
    let root_label = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.display().to_string());

    let manifests = walk_manifests(root, &WalkOptions::default());
    let mut graph = build_dependency_graph(&manifests, &GraphOptions { include_external });
    apply_containment(
        &mut graph,
        &ContainmentOptions {
            root_label: root_label.clone(),
            group_externals: true,
        },
    );

    let nodes = graph
        .nodes
        .iter()
        .map(|n| SystemNode {
            id: n.id.clone(),
            label: node_label(n),
            dir: n.dir.clone(),
            parent: n.parent.clone(),
            kind: n.kind.as_str().to_string(),
            ecosystem: n.ecosystem.map(|e| e.as_str().to_string()),
            external: n.external,
            description: n.manifest.as_ref().and_then(|m| m.description.clone()),
            private: n.manifest.as_ref().is_some_and(|m| m.private),
            is_nuxt_layer: n.manifest.as_ref().is_some_and(|m| m.is_nuxt_layer),
            has_bin: n.manifest.as_ref().is_some_and(|m| m.has_bin),
            error: n.manifest.as_ref().and_then(|m| m.error.clone()),
            // Synthetic nodes and externals have no manifest to scan.
            aspects: n
                .manifest
                .as_ref()
                .map(|m| scan_aspects(m).iter().map(Into::into).collect())
                .unwrap_or_default(),
        })
        .collect();

    let edges = graph
        .edges
        .iter()
        .map(|e| SystemEdge {
            from: e.from.clone(),
            to: e.to.clone(),
            kind: e.kind.as_str().to_string(),
            specifier_kind: e.specifier_kind.as_str().to_string(),
            specifier: e.specifier.clone(),
        })
        .collect();

    Ok(SystemGraph {
        root: root.display().to_string(),
        root_label,
        include_external,
        nodes,
        edges,
        warnings: graph.warnings.clone(),
        manifests_scanned: manifests.len() as i64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::NodeKind;

    fn node(name: Option<&str>, dir: Option<&str>, ecosystem: Option<Ecosystem>) -> GraphNode {
        GraphNode {
            id: ".".into(),
            name: name.map(Into::into),
            dir: dir.map(Into::into),
            ecosystem,
            external: false,
            kind: NodeKind::Crate,
            parent: None,
            manifest: None,
        }
    }

    #[test]
    fn a_nameless_manifest_at_the_root_is_named_for_its_ecosystem() {
        assert_eq!(
            node_label(&node(None, Some(""), Some(Ecosystem::Rust))),
            "Rust workspace"
        );
        assert_eq!(
            node_label(&node(None, Some(""), Some(Ecosystem::Node))),
            "Node workspace"
        );
    }

    #[test]
    fn a_name_always_wins_and_a_directory_is_the_next_best_thing() {
        assert_eq!(
            node_label(&node(
                Some("@acme/ui"),
                Some("packages/ui"),
                Some(Ecosystem::Node)
            )),
            "@acme/ui"
        );
        assert_eq!(
            node_label(&node(None, Some("packages/ui"), Some(Ecosystem::Node))),
            "packages/ui"
        );
    }

    #[test]
    fn an_empty_name_falls_back_to_the_directory() {
        assert_eq!(
            node_label(&node(Some(""), Some("a"), Some(Ecosystem::Node))),
            "a"
        );
    }

    #[test]
    fn a_missing_root_is_an_error() {
        let err = build_system_graph(Path::new("/definitely/not/here"), false).unwrap_err();
        assert!(err.to_string().starts_with("not a directory"));
    }
}

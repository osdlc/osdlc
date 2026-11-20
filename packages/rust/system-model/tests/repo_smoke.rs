//! The gate against the real monorepo: proof the walk survives a tree this
//! size and that the graph it builds is the one a reader would expect.

use std::path::{Path, PathBuf};

use system_model::{
    ContainmentOptions, GraphOptions, NodeKind, SpecifierKind, WalkOptions, apply_containment,
    build_dependency_graph, walk_manifests,
};

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .unwrap()
}

#[test]
fn walks_the_real_repo_and_finds_a_known_workspace_edge() {
    let manifests = walk_manifests(&repo_root(), &WalkOptions::default());
    assert!(
        manifests.len() > 20,
        "expected > 20 manifests, found {}",
        manifests.len()
    );
    assert!(
        manifests
            .iter()
            .any(|m| m.ecosystem == system_model::Ecosystem::Rust),
        "expected at least one crate"
    );

    let graph = build_dependency_graph(&manifests, &GraphOptions::default());
    let edge = graph
        .edges
        .iter()
        .find(|e| e.from == "@osdlc/code-host" && e.to == "@osdlc/command-seam")
        .expect("expected the @osdlc/code-host -> @osdlc/command-seam edge");
    assert_eq!(edge.specifier_kind, SpecifierKind::Workspace);
}

#[test]
fn the_real_repo_yields_one_containment_root_that_every_node_reaches() {
    let manifests = walk_manifests(&repo_root(), &WalkOptions::default());
    let mut graph = build_dependency_graph(&manifests, &GraphOptions::default());
    apply_containment(&mut graph, &ContainmentOptions::default());

    let roots: Vec<&str> = graph
        .nodes
        .iter()
        .filter(|n| n.parent.is_none())
        .map(|n| n.id.as_str())
        .collect();
    assert_eq!(
        roots.len(),
        1,
        "expected exactly one containment root, got {roots:?}"
    );
    assert_eq!(
        graph
            .nodes
            .iter()
            .find(|n| n.parent.is_none())
            .unwrap()
            .kind,
        NodeKind::Repo
    );

    let by_id = |id: &str| graph.nodes.iter().find(|n| n.id == id);
    for node in &graph.nodes {
        let mut hops = 0;
        let mut cursor = node.parent.clone();
        while let Some(id) = cursor {
            hops += 1;
            assert!(
                hops < 64,
                "containment chain from {} did not terminate",
                node.id
            );
            cursor = by_id(&id)
                .unwrap_or_else(|| panic!("dangling parent {id}"))
                .parent
                .clone();
        }
    }

    // The grouping is real: this repo nests packages under `packages/ts`, and
    // that directory declares no manifest of its own.
    let ts = graph
        .nodes
        .iter()
        .find(|n| n.dir.as_deref() == Some("packages/ts"))
        .expect("expected a packages/ts group node");
    assert_eq!(ts.kind, NodeKind::Group);
    assert!(
        graph
            .nodes
            .iter()
            .filter(|n| n.parent.as_deref() == Some(ts.id.as_str()))
            .count()
            > 5,
        "expected packages/ts to contain several packages"
    );
}

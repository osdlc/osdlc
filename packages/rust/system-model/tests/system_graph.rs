//! `build_system_graph` over the shared mini-repo fixture.

use std::path::Path;

use system_model::build_system_graph;

fn root() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/mini-repo")
}

#[test]
fn the_payload_has_one_root_and_the_walked_edges() {
    let graph = build_system_graph(&root(), false).unwrap();
    assert_eq!(graph.root_label, "mini-repo");
    assert!(!graph.include_external);
    assert_eq!(graph.nodes.iter().filter(|n| n.parent.is_none()).count(), 1);
    assert_eq!(graph.edges.len(), 4);
    assert!(graph.manifests_scanned > 0);
}

#[test]
fn the_wire_keys_are_snake_case_in_declaration_order() {
    let graph = build_system_graph(&root(), false).unwrap();
    let json = serde_json::to_string(&graph).unwrap();
    let keys = [
        "root",
        "root_label",
        "include_external",
        "nodes",
        "edges",
        "warnings",
        "manifests_scanned",
    ];
    let mut at = 0;
    for key in keys {
        let found = json[at..]
            .find(&format!("\"{key}\":"))
            .unwrap_or_else(|| panic!("{key} out of order"));
        at += found;
    }
}

#[test]
fn a_missing_root_is_an_error() {
    assert!(build_system_graph(Path::new("/definitely/not/here"), false).is_err());
}

#[test]
fn a_relative_root_is_made_absolute() {
    let graph = build_system_graph(Path::new("tests/mini-repo"), false).unwrap();
    assert!(Path::new(&graph.root).is_absolute());
    assert_eq!(graph.root_label, "mini-repo");
}

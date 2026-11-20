//! The gate for the walk + dependency-graph contract, over a fixture tree that
//! is a miniature monorepo: two ecosystems, a virtual cargo workspace root, a
//! Nuxt layer, a binary, and one deliberately malformed manifest.
//!
//! The `mini-repo` fixture tree is the one `@osdlc/system-model`'s manifest
//! tests were written against.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use system_model::{
    DepKind, Ecosystem, GraphOptions, ManifestInfo, SpecifierKind, WalkOptions,
    build_dependency_graph, walk_manifests,
};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/mini-repo")
}

fn manifests() -> &'static Vec<ManifestInfo> {
    static CELL: OnceLock<Vec<ManifestInfo>> = OnceLock::new();
    CELL.get_or_init(|| walk_manifests(&root(), &WalkOptions::default()))
}

fn by_dir(dir: &str) -> &'static ManifestInfo {
    manifests()
        .iter()
        .find(|m| m.dir == dir)
        .unwrap_or_else(|| panic!("no manifest at dir \"{dir}\""))
}

fn dep(m: &ManifestInfo, name: &str) -> (DepKind, String, SpecifierKind) {
    let d = m
        .deps
        .iter()
        .find(|d| d.name == name)
        .unwrap_or_else(|| panic!("no dep \"{name}\" on {}", m.dir));
    (d.kind, d.specifier.clone(), d.specifier_kind)
}

#[test]
fn finds_every_manifest_in_the_tree() {
    let dirs: Vec<&str> = manifests().iter().map(|m| m.dir.as_str()).collect();
    assert_eq!(
        dirs,
        vec![
            "", // mini-repo root package.json
            "crates",
            "crates/crate-one",
            "crates/crate-two",
            "layers/layer-ui",
            "packages/broken",
            "packages/pkg-a",
            "packages/pkg-b",
            "packages/pkg-c",
        ]
    );
}

#[test]
fn tags_ecosystems_and_reads_the_basics() {
    let root = by_dir("");
    assert_eq!(root.ecosystem, Ecosystem::Node);
    assert_eq!(root.name.as_deref(), Some("mini-root"));
    assert!(root.private);
    assert_eq!(root.workspaces, vec!["packages/*", "layers/*"]);

    let a = by_dir("packages/pkg-a");
    assert_eq!(a.ecosystem, Ecosystem::Node);
    assert_eq!(a.version.as_deref(), Some("1.0.0"));
    assert_eq!(
        a.description.as_deref(),
        Some("Depends on pkg-b in-workspace and lodash externally")
    );

    let one = by_dir("crates/crate-one");
    assert_eq!(one.ecosystem, Ecosystem::Rust);
    assert_eq!(one.name.as_deref(), Some("crate-one"));
    assert_eq!(one.version.as_deref(), Some("0.1.0"));
}

#[test]
fn derived_hints_nuxt_layer_and_bin() {
    assert!(by_dir("layers/layer-ui").is_nuxt_layer);
    assert!(!by_dir("packages/pkg-a").is_nuxt_layer);
    assert!(by_dir("packages/pkg-c").has_bin);
    assert!(!by_dir("packages/pkg-b").has_bin);
}

#[test]
fn virtual_cargo_workspace_root_has_no_name_but_lists_members() {
    let ws = by_dir("crates");
    assert_eq!(ws.name, None);
    assert_eq!(ws.workspaces, vec!["crate-one", "crate-two"]);
}

#[test]
fn cargo_publish_false_maps_to_private() {
    assert!(by_dir("crates/crate-two").private);
    assert!(!by_dir("crates/crate-one").private);
}

#[test]
fn a_malformed_manifest_becomes_an_error_entry_not_a_panic() {
    let broken = by_dir("packages/broken");
    assert!(broken.error.is_some(), "expected error to be set");
    assert_eq!(broken.name, None);
    assert!(broken.deps.is_empty());
}

#[test]
fn node_dep_kinds_and_specifier_kinds() {
    let a = by_dir("packages/pkg-a");
    assert_eq!(a.deps.len(), 2);
    assert_eq!(
        dep(a, "@mini/pkg-b"),
        (
            DepKind::Prod,
            "workspace:*".to_string(),
            SpecifierKind::Workspace
        )
    );
    assert_eq!(
        dep(a, "lodash"),
        (
            DepKind::Prod,
            "^4.17.21".to_string(),
            SpecifierKind::Registry
        )
    );

    let b = by_dir("packages/pkg-b");
    assert_eq!(b.deps.len(), 2);
    assert_eq!(
        dep(b, "vue"),
        (DepKind::Peer, "^3.0.0".to_string(), SpecifierKind::Registry)
    );
    assert_eq!(
        dep(b, "fsevents"),
        (
            DepKind::Optional,
            "^2.3.0".to_string(),
            SpecifierKind::Registry
        )
    );

    let c = by_dir("packages/pkg-c");
    assert_eq!(c.deps.len(), 1);
    assert_eq!(
        dep(c, "@mini/pkg-b"),
        (
            DepKind::Prod,
            "file:../pkg-b".to_string(),
            SpecifierKind::File
        )
    );
}

#[test]
fn cargo_dep_kinds_and_specifier_kinds() {
    let one = by_dir("crates/crate-one");
    assert_eq!(one.deps.len(), 4);
    assert_eq!(
        dep(one, "crate-two"),
        (
            DepKind::Prod,
            "../crate-two".to_string(),
            SpecifierKind::Path
        )
    );
    assert_eq!(
        dep(one, "serde"),
        (DepKind::Prod, "1".to_string(), SpecifierKind::Registry)
    );
    assert_eq!(
        dep(one, "tempfile"),
        (DepKind::Dev, "3".to_string(), SpecifierKind::Registry)
    );
    assert_eq!(
        dep(one, "cc"),
        (DepKind::Build, "1.0".to_string(), SpecifierKind::Registry)
    );
}

#[test]
fn exclude_option_skips_caller_named_directories() {
    let without = walk_manifests(
        &root(),
        &WalkOptions {
            exclude: vec!["crates".to_string()],
        },
    );
    assert!(without.iter().all(|m| m.ecosystem != Ecosystem::Rust));
}

#[test]
fn one_node_per_manifest_and_externals_dropped_by_default() {
    let graph = build_dependency_graph(manifests(), &GraphOptions::default());
    assert_eq!(graph.nodes.len(), manifests().len());
    assert!(graph.warnings.is_empty(), "{:?}", graph.warnings);
    assert!(graph.nodes.iter().all(|n| !n.external));

    // The virtual cargo workspace root falls back to its dir as id.
    let ws = graph
        .nodes
        .iter()
        .find(|n| n.dir.as_deref() == Some("crates"))
        .unwrap();
    assert_eq!(ws.id, "crates");
    assert_eq!(ws.name, None);

    let rendered: Vec<String> = graph
        .edges
        .iter()
        .map(|e| {
            format!(
                "{} -[{}/{}]-> {}",
                e.from,
                e.kind.as_str(),
                e.specifier_kind.as_str(),
                e.to
            )
        })
        .collect();
    assert_eq!(
        rendered,
        vec![
            "@mini/layer-ui -[prod/workspace]-> @mini/pkg-b",
            "@mini/pkg-a -[prod/workspace]-> @mini/pkg-b",
            "@mini/pkg-c -[prod/file]-> @mini/pkg-b",
            "crate-one -[prod/path]-> crate-two",
        ]
    );
}

#[test]
fn include_external_materializes_external_nodes_and_their_edges() {
    let graph = build_dependency_graph(
        manifests(),
        &GraphOptions {
            include_external: true,
        },
    );

    let external_ids: Vec<&str> = graph
        .nodes
        .iter()
        .filter(|n| n.external)
        .map(|n| n.id.as_str())
        .collect();
    assert_eq!(
        external_ids,
        vec!["cc", "fsevents", "lodash", "serde", "tempfile", "vue"]
    );
    assert!(
        graph
            .nodes
            .iter()
            .filter(|n| n.external)
            .all(|n| n.dir.is_none() && n.manifest.is_none())
    );
    let eco = |id: &str| graph.nodes.iter().find(|n| n.id == id).unwrap().ecosystem;
    assert_eq!(eco("serde"), Some(Ecosystem::Rust));
    assert_eq!(eco("lodash"), Some(Ecosystem::Node));

    let kind_of = |id: &str| {
        graph
            .edges
            .iter()
            .find(|e| e.to == id)
            .unwrap_or_else(|| panic!("no edge to {id}"))
            .kind
    };
    assert_eq!(kind_of("vue"), DepKind::Peer);
    assert_eq!(kind_of("fsevents"), DepKind::Optional);
    assert_eq!(kind_of("tempfile"), DepKind::Dev);
    assert_eq!(kind_of("cc"), DepKind::Build);
    assert_eq!(kind_of("lodash"), DepKind::Prod);

    // In-set edges are unchanged by the option.
    assert_eq!(graph.edges.len(), 4 + external_ids.len());
}

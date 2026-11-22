//! The gate for the containment contract, over a fixture tree that
//! is a miniature monorepo: two ecosystems, a virtual cargo workspace root, a
//! Nuxt layer, a binary, and one deliberately malformed manifest.
//!
//! Ported from `@osdlc/system-model`'s `tests/containment.test.ts`, whose
//! fixture tree this is — the assertions are the same because the contract is.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use system_model::{
    ContainmentOptions, GraphOptions, ManifestInfo, NodeKind, WalkOptions, apply_containment,
    build_dependency_graph, walk_manifests,
};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/mini-repo")
}

fn manifests() -> &'static Vec<ManifestInfo> {
    static CELL: OnceLock<Vec<ManifestInfo>> = OnceLock::new();
    CELL.get_or_init(|| walk_manifests(&root(), &WalkOptions::default()))
}

fn contained(include_external: bool) -> system_model::DependencyGraph {
    let mut graph = build_dependency_graph(manifests(), &GraphOptions { include_external });
    apply_containment(&mut graph, &ContainmentOptions::default());
    graph
}

#[test]
fn the_repo_node_is_synthetic_and_top_level_manifests_are_its_children() {
    let graph = contained(false);
    let roots: Vec<&str> = graph
        .nodes
        .iter()
        .filter(|n| n.parent.is_none())
        .map(|n| n.id.as_str())
        .collect();
    assert_eq!(roots, vec!["repo:root"]);

    let repo = graph.nodes.iter().find(|n| n.id == "repo:root").unwrap();
    assert_eq!(repo.kind, NodeKind::Repo);
    assert_eq!(repo.name.as_deref(), Some("repository"));
    assert!(
        repo.manifest.is_none(),
        "the checkout is not one of its own manifests"
    );

    // The root `package.json` is a package that lives at the top of the
    // checkout, not the checkout itself.
    let root_pkg = graph.nodes.iter().find(|n| n.id == "mini-root").unwrap();
    assert_eq!(root_pkg.kind, NodeKind::Package);
    assert_eq!(root_pkg.parent.as_deref(), Some("repo:root"));
}

#[test]
fn a_group_appears_only_where_a_directory_holds_manifests_but_declares_none() {
    let graph = contained(false);
    let groups: Vec<&str> = graph
        .nodes
        .iter()
        .filter(|n| n.kind == NodeKind::Group)
        .map(|n| n.dir.as_deref().unwrap_or(""))
        .collect();
    // `crates` holds a manifest of its own (the virtual workspace root), so it
    // is not synthetic. `layers` is chain-collapsed — see below.
    assert_eq!(groups, vec!["packages"]);
}

#[test]
fn a_single_child_group_is_collapsed_away() {
    let graph = contained(false);
    // `layers/` holds exactly one manifest, so a `layers` box would say nothing
    // `layers/layer-ui` does not already say: the layer parents to the repo.
    assert!(
        graph
            .nodes
            .iter()
            .all(|n| n.dir.as_deref() != Some("layers"))
    );
    let layer = graph
        .nodes
        .iter()
        .find(|n| n.id == "@mini/layer-ui")
        .unwrap();
    assert_eq!(layer.parent.as_deref(), Some("repo:root"));
}

#[test]
fn manifests_parent_to_their_nearest_container() {
    let graph = contained(false);
    let parent = |id: &str| {
        graph
            .nodes
            .iter()
            .find(|n| n.id == id)
            .unwrap()
            .parent
            .clone()
            .unwrap_or_default()
    };
    assert_eq!(parent("@mini/pkg-a"), "packages");
    assert_eq!(parent("@mini/pkg-b"), "packages");
    assert_eq!(parent("packages"), "repo:root");
    // `crates` is a real (virtual-workspace) manifest, and its members nest
    // under it rather than under a synthetic sibling.
    assert_eq!(parent("crate-one"), "crates");
    assert_eq!(parent("crate-two"), "crates");
    assert_eq!(parent("crates"), "repo:root");
}

#[test]
fn every_in_set_node_reaches_the_root_by_walking_parents() {
    let graph = contained(false);
    for node in graph.nodes.iter().filter(|n| !n.external) {
        let mut seen = vec![node.id.clone()];
        let mut cursor = node.parent.clone();
        while let Some(id) = cursor {
            assert!(!seen.contains(&id), "containment cycle through {id}");
            seen.push(id.clone());
            cursor = graph
                .nodes
                .iter()
                .find(|n| n.id == id)
                .unwrap()
                .parent
                .clone();
        }
        assert_eq!(
            seen.last().unwrap(),
            "repo:root",
            "{} never reached the root",
            node.id
        );
    }
}

#[test]
fn externals_gather_under_one_group_per_ecosystem_outside_the_repo() {
    let graph = contained(true);
    let parent = |id: &str| {
        graph
            .nodes
            .iter()
            .find(|n| n.id == id)
            .unwrap()
            .parent
            .clone()
            .unwrap_or_default()
    };
    assert_eq!(parent("lodash"), "external:node");
    assert_eq!(parent("vue"), "external:node");
    assert_eq!(parent("serde"), "external:rust");
    assert_eq!(parent("cc"), "external:rust");

    // A registry package is not *within* the repo, so its group is a second
    // containment root rather than a child of it.
    let roots: Vec<&str> = graph
        .nodes
        .iter()
        .filter(|n| n.parent.is_none())
        .map(|n| n.id.as_str())
        .collect();
    assert_eq!(roots, vec!["repo:root", "external:node", "external:rust"]);
}

#[test]
fn a_group_under_the_root_is_labelled_by_its_dir() {
    let graph = contained(false);
    let packages = graph.nodes.iter().find(|n| n.id == "packages").unwrap();
    assert_eq!(packages.name.as_deref(), Some("packages"));
}

#[test]
fn a_second_pass_re_derives_under_its_own_options() {
    // Everything below the entry point is minted unconditionally, so a pass
    // that did not first undo its predecessor would append a second
    // `repo:root` and a second group per ecosystem — and one that simply
    // bailed out would silently drop this call's options.
    let with_external = GraphOptions {
        include_external: true,
    };
    for options in [
        ContainmentOptions::default(),
        ContainmentOptions {
            root_label: "checkout".to_string(),
            group_externals: false,
        },
    ] {
        let mut twice = build_dependency_graph(manifests(), &with_external);
        apply_containment(&mut twice, &ContainmentOptions::default());
        apply_containment(&mut twice, &options);

        let mut once = build_dependency_graph(manifests(), &with_external);
        apply_containment(&mut once, &options);

        let twice_ids: Vec<&str> = twice.nodes.iter().map(|n| n.id.as_str()).collect();
        let once_ids: Vec<&str> = once.nodes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(twice_ids, once_ids);
        assert_eq!(twice, once);
    }
}

#[test]
fn containment_never_invents_dependency_edges() {
    let bare = build_dependency_graph(manifests(), &GraphOptions::default());
    let contained = contained(false);
    assert_eq!(bare.edges, contained.edges);
}

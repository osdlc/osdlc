//! Walk and graph cases written against scratch trees rather than the shared
//! `mini-repo` fixture, which the other cases read and which these must not change.

use std::fs;
use std::path::{Path, PathBuf};

use system_model::{
    DependencyGraph, GraphOptions, ManifestInfo, SpecifierKind, WalkOptions,
    build_dependency_graph, walk_manifests,
};

/// A scratch directory removed on drop.
struct Tree(PathBuf);

impl Tree {
    fn new(label: &str, files: &[(&str, &str)]) -> Tree {
        let root =
            std::env::temp_dir().join(format!("system-model-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for (rel, body) in files {
            let path = root.join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, body).unwrap();
        }
        Tree(root)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn walk(&self) -> Vec<ManifestInfo> {
        walk_manifests(self.path(), &WalkOptions::default())
    }
}

impl Drop for Tree {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn at<'a>(manifests: &'a [ManifestInfo], dir: &str) -> &'a ManifestInfo {
    manifests
        .iter()
        .find(|m| m.dir == dir)
        .unwrap_or_else(|| panic!("no manifest at dir \"{dir}\""))
}

fn edges(graph: &DependencyGraph) -> Vec<String> {
    graph
        .edges
        .iter()
        .map(|e| format!("{} -> {}", e.from, e.to))
        .collect()
}

#[test]
fn cargo_target_specific_dependency_tables_are_read() {
    let tree = Tree::new(
        "target-deps",
        &[
            (
                "a/Cargo.toml",
                "[package]\nname = \"a\"\n\n\
                 [target.'cfg(unix)'.dependencies]\nb = { path = \"../b\" }\n\n\
                 [target.'cfg(windows)'.dev-dependencies]\nc = \"1\"\n\n\
                 [target.x86_64-apple-darwin.build-dependencies]\nd = \"2\"\n",
            ),
            ("b/Cargo.toml", "[package]\nname = \"b\"\n"),
        ],
    );
    let manifests = tree.walk();
    let deps: Vec<(String, &str)> = at(&manifests, "a")
        .deps
        .iter()
        .map(|d| (d.name.clone(), d.kind.as_str()))
        .collect();
    assert_eq!(
        deps,
        vec![
            ("b".to_string(), "prod"),
            ("c".to_string(), "dev"),
            ("d".to_string(), "build"),
        ]
    );
    let graph = build_dependency_graph(&manifests, &GraphOptions::default());
    assert_eq!(edges(&graph), vec!["a -> b"]);
}

#[test]
fn npm_github_shorthand_is_not_a_registry_specifier() {
    let tree = Tree::new(
        "gh-shorthand",
        &[(
            "p/package.json",
            r#"{"name":"p","dependencies":{"gh":"user/repo","gh2":"user/repo#main","reg":"^1.0.0"}}"#,
        )],
    );
    let manifests = tree.walk();
    let kind = |name: &str| {
        at(&manifests, "p")
            .deps
            .iter()
            .find(|d| d.name == name)
            .unwrap()
            .specifier_kind
    };
    assert_eq!(kind("gh"), SpecifierKind::Other);
    assert_eq!(kind("gh2"), SpecifierKind::Other);
    assert_eq!(kind("reg"), SpecifierKind::Registry);
}

#[test]
fn an_empty_manifest_name_raises_no_collision_warning() {
    let tree = Tree::new(
        "empty-name",
        &[
            ("packages/a/package.json", r#"{"name":""}"#),
            ("packages/b/package.json", r#"{"name":""}"#),
        ],
    );
    let graph = build_dependency_graph(&tree.walk(), &GraphOptions::default());
    let ids: Vec<&str> = graph.nodes.iter().map(|n| n.id.as_str()).collect();
    assert_eq!(ids, vec!["packages/a", "packages/b"]);
    assert!(graph.warnings.is_empty(), "{:?}", graph.warnings);
}

#[test]
fn npm_alias_dependencies_resolve_to_the_real_package() {
    let tree = Tree::new(
        "npm-alias",
        &[
            ("a/package.json", r#"{"name":"lodash"}"#),
            ("b/package.json", r#"{"name":"real-pkg"}"#),
            ("c/package.json", r#"{"name":"@scope/real"}"#),
            (
                "app/package.json",
                r#"{"name":"app","dependencies":{"lodash":"npm:lodash-es@^4","alias":"npm:real-pkg@*","sc":"npm:@scope/real@^1","bare":"npm:@scope/real"}}"#,
            ),
        ],
    );
    let manifests = tree.walk();
    let app = at(&manifests, "app");
    let names: Vec<(&str, &str)> = app
        .deps
        .iter()
        .map(|d| (d.name.as_str(), d.specifier.as_str()))
        .collect();
    // In key order (alias, bare, lodash, sc), not document order.
    assert_eq!(
        names,
        vec![
            ("real-pkg", "npm:real-pkg@*"),
            ("@scope/real", "npm:@scope/real"),
            ("lodash-es", "npm:lodash-es@^4"),
            ("@scope/real", "npm:@scope/real@^1"),
        ]
    );
    let graph = build_dependency_graph(&manifests, &GraphOptions::default());
    assert_eq!(
        edges(&graph),
        vec![
            "app -> @scope/real",
            "app -> @scope/real",
            "app -> real-pkg"
        ]
    );
}

#[test]
fn cargo_publish_empty_array_is_private() {
    let tree = Tree::new(
        "publish-array",
        &[
            ("c/Cargo.toml", "[package]\nname = \"c\"\npublish = []\n"),
            (
                "d/Cargo.toml",
                "[package]\nname = \"d\"\npublish = [\"my-registry\"]\n",
            ),
        ],
    );
    let manifests = tree.walk();
    assert!(at(&manifests, "c").private);
    assert!(!at(&manifests, "d").private);
}

#[test]
fn workspace_inherited_deps_take_the_rename_from_workspace_dependencies() {
    let tree = Tree::new(
        "ws-rename",
        &[
            (
                "Cargo.toml",
                "[workspace]\nmembers = [\"b\", \"user\"]\n\n\
                 [workspace.dependencies]\nbee = { package = \"real-b\", path = \"b\" }\nplain = \"1\"\n",
            ),
            ("b/Cargo.toml", "[package]\nname = \"real-b\"\n"),
            (
                "user/Cargo.toml",
                "[package]\nname = \"user\"\n\n\
                 [dependencies]\nbee = { workspace = true }\nplain = { workspace = true }\n",
            ),
        ],
    );
    let manifests = tree.walk();
    let deps: Vec<(&str, SpecifierKind)> = at(&manifests, "user")
        .deps
        .iter()
        .map(|d| (d.name.as_str(), d.specifier_kind))
        .collect();
    assert_eq!(
        deps,
        vec![
            ("real-b", SpecifierKind::Workspace),
            ("plain", SpecifierKind::Workspace),
        ]
    );
    let graph = build_dependency_graph(&manifests, &GraphOptions::default());
    assert_eq!(edges(&graph), vec!["user -> real-b"]);
}

//! The gate for the aspect scanners, over the shared fixture tree.
//!
//! `@osdlc/system-model`'s `tests/aspect-scan.test.ts` asserts the SAME
//! expectations against the SAME directories. Aspects are inference, and two
//! implementations inferring separately is exactly where they would quietly
//! stop agreeing — so the expectations are written out in full, including the
//! evidence strings, which are payload rather than debug text.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use system_model::{Aspect, Evidence, ManifestInfo, WalkOptions, scan_aspects, walk_manifests};

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/mini-repo")
}

fn manifests() -> &'static Vec<ManifestInfo> {
    static CELL: OnceLock<Vec<ManifestInfo>> = OnceLock::new();
    CELL.get_or_init(|| walk_manifests(&root(), &WalkOptions::default()))
}

fn at(dir: &str) -> &'static ManifestInfo {
    manifests()
        .iter()
        .find(|m| m.dir == dir)
        .unwrap_or_else(|| panic!("no manifest at \"{dir}\""))
}

fn evidence(kind: &str, tier: i64, source: &str, found: &str) -> Evidence {
    Evidence {
        kind: kind.to_string(),
        tier,
        source: source.to_string(),
        found: found.to_string(),
    }
}

fn aspect(id: &str, tier: i64, evidence: Vec<Evidence>) -> Aspect {
    Aspect {
        id: id.to_string(),
        tier,
        evidence,
    }
}

#[test]
fn a_cargo_toml_is_rust_tier_one_no_inference() {
    assert_eq!(
        scan_aspects(at("crates/crate-one")),
        vec![aspect(
            "rust",
            1,
            vec![evidence("manifest", 1, "Cargo.toml", "[package]")]
        )]
    );
}

#[test]
fn one_field_can_support_two_aspects_at_once() {
    // The Nuxt-layer convention and the entry point's extension are separate
    // claims that happen to read the same `main`. A package is rarely one
    // technology, and this is the smallest case of it.
    assert_eq!(
        scan_aspects(at("layers/layer-ui")),
        vec![
            aspect(
                "nuxt",
                1,
                vec![evidence(
                    "manifest",
                    1,
                    "package.json#main",
                    "nuxt.config.ts"
                )]
            ),
            aspect(
                "typescript",
                1,
                vec![evidence(
                    "manifest",
                    1,
                    "package.json#main",
                    "./nuxt.config.ts"
                )]
            ),
        ]
    );
}

#[test]
fn a_dependency_is_tier_two_and_says_which_table_it_came_from() {
    // Depending on vue is not being written in vue, which is the whole reason
    // this is a lower tier that carries its reason.
    assert_eq!(
        scan_aspects(at("packages/pkg-b")),
        vec![aspect(
            "vue",
            2,
            vec![evidence("dependency", 2, "dependencies.vue", "peer ^3.0.0")]
        )]
    );
}

#[test]
fn a_manifest_that_supports_nothing_claims_nothing() {
    assert!(scan_aspects(at("packages/pkg-a")).is_empty());
    // Including the one that would not parse: no manifest, no claims.
    assert!(scan_aspects(at("packages/broken")).is_empty());
}

#[test]
fn an_aspects_tier_is_the_most_direct_evidence_for_it() {
    for m in manifests() {
        for a in scan_aspects(m) {
            assert!(!a.evidence.is_empty(), "{} claimed with no evidence", a.id);
            assert_eq!(a.tier, a.evidence.iter().map(|e| e.tier).min().unwrap());
        }
    }
}

#[test]
fn aspects_come_back_ordered_by_tier_then_id() {
    for m in manifests() {
        let aspects = scan_aspects(m);
        for pair in aspects.windows(2) {
            let (prev, cur) = (&pair[0], &pair[1]);
            assert!(
                prev.tier < cur.tier || (prev.tier == cur.tier && prev.id < cur.id),
                "{} before {} is out of order",
                prev.id,
                cur.id
            );
        }
    }
}

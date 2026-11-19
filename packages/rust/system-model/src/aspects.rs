//! The aspect scanners: what a manifest reveals about what it IS.
//!
//! Each check names the tier it works at, looks at one thing, and returns what
//! it saw — never a verdict without the reason for it.
//!
//! PARITY IS THE CONSTRAINT. `@osdlc/system-model`'s `src/aspect-scan.ts` runs
//! the same scanners in the same order and must produce identical output, so:
//!
//!   - scanners run in the order declared here, and evidence is emitted in
//!     that order;
//!   - `source` strings are part of the payload, not debug text — changing one
//!     is a wire change and has to be made on both sides;
//!   - every scanner reads only fields the walk has ALREADY parsed. Tiers 3
//!     and 4 (`files`, `content`) would go back to disk, and are deliberately
//!     empty: a directory read is a second thing for two implementations to
//!     disagree about, and worth adding on purpose rather than by drift.

use crate::model::{Aspect, Ecosystem, Evidence, EvidenceKind, ManifestInfo};

/// A dependency name that implies an aspect, whatever table it sits in.
///
/// Order is part of the contract: it decides the order evidence appears in.
const DEPENDENCY_ASPECTS: &[(&str, &str)] = &[
    ("vue", "vue"),
    ("nuxt", "nuxt"),
    ("typescript", "typescript"),
    ("vitest", "test"),
    ("@playwright/test", "test"),
    ("wasm-bindgen", "wasm"),
    ("wasm-pack", "wasm"),
];

/// An extension in an entry point that implies a language.
fn language_of_entry(entry: &str) -> Option<&'static str> {
    if entry.ends_with(".ts") || entry.ends_with(".tsx") {
        Some("typescript")
    } else if entry.ends_with(".js") || entry.ends_with(".mjs") || entry.ends_with(".cjs") {
        Some("javascript")
    } else if entry.ends_with(".vue") {
        Some("vue")
    } else {
        None
    }
}

struct Finding {
    aspect: &'static str,
    kind: EvidenceKind,
    source: String,
    found: String,
}

/// Every aspect a manifest supports, with the evidence for each.
///
/// Ordered by the most direct tier, then by aspect id, so the payload is
/// deterministic and diffable — the same reason the walk sorts everything else.
pub fn scan_aspects(manifest: &ManifestInfo) -> Vec<Aspect> {
    let mut findings: Vec<Finding> = Vec::new();

    // Tier 1. A Cargo.toml is not evidence that something is Rust; it is the
    // thing being Rust. No inference, so nothing to get wrong.
    if manifest.ecosystem == Ecosystem::Rust {
        findings.push(Finding {
            aspect: "rust",
            kind: EvidenceKind::Manifest,
            source: "Cargo.toml".to_string(),
            found: "[package]".to_string(),
        });
    }

    // Tier 1. `main`/`types` point at the file a consumer is handed, so their
    // extension is the package's own statement about what it ships.
    for (field, value) in [
        ("main", &manifest.entry.main),
        ("types", &manifest.entry.types),
    ] {
        let Some(value) = value else { continue };
        if let Some(aspect) = language_of_entry(value) {
            findings.push(Finding {
                aspect,
                kind: EvidenceKind::Manifest,
                source: format!("package.json#{field}"),
                found: value.clone(),
            });
        }
    }

    // Tier 1. The Nuxt-layer convention: `main` points at a nuxt.config. Kept
    // separate from the entry-point scanner because it is a claim about ROLE,
    // and the same field can support both at once.
    if manifest.is_nuxt_layer {
        findings.push(Finding {
            aspect: "nuxt",
            kind: EvidenceKind::Manifest,
            source: "package.json#main".to_string(),
            found: "nuxt.config.ts".to_string(),
        });
    }

    // Tier 2. Depending on something is not being it — a package that lists
    // `vue` might only be a build tool for Vue projects — which is exactly why
    // this is a lower tier carrying its reason rather than a bare label.
    for (name, aspect) in DEPENDENCY_ASPECTS {
        let Some(dep) = manifest.deps.iter().find(|d| d.name == *name) else {
            continue;
        };
        findings.push(Finding {
            aspect,
            kind: EvidenceKind::Dependency,
            source: format!("dependencies.{name}"),
            found: if dep.specifier.is_empty() {
                dep.kind.as_str().to_string()
            } else {
                format!("{} {}", dep.kind.as_str(), dep.specifier)
            },
        });
    }

    // Group, preserving first-seen order so the grouping cannot reorder
    // evidence relative to the scanners that produced it.
    let mut aspects: Vec<Aspect> = Vec::new();
    for finding in findings {
        let evidence = Evidence {
            kind: finding.kind.as_str().to_string(),
            tier: finding.kind.tier(),
            source: finding.source,
            found: finding.found,
        };
        match aspects.iter_mut().find(|a| a.id == finding.aspect) {
            Some(existing) => existing.evidence.push(evidence),
            None => aspects.push(Aspect {
                id: finding.aspect.to_string(),
                tier: evidence.tier,
                evidence: vec![evidence],
            }),
        }
    }

    for aspect in aspects.iter_mut() {
        aspect.tier = aspect.evidence.iter().map(|e| e.tier).min().unwrap_or(0);
    }
    aspects.sort_by(|a, b| a.tier.cmp(&b.tier).then_with(|| a.id.cmp(&b.id)));
    aspects
}

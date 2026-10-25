//! The vault snapshot a plan is computed against.
//!
//! Everything the planner needs to know about the vault that is not "read this
//! one file": the corpus of paths links resolve against, each note's outgoing
//! body links, and each note's link-shaped frontmatter values.
//!
//! # Why this is a struct and not a walk
//!
//! A host application may already have the answers. It can keep a link graph
//! (out-edges with spans, incrementally refreshed) and a frontmatter index
//! (parsed frontmatter, same freshness rule) because every read op needs them,
//! so a planner that walked and re-read the whole vault for a debounced
//! preview would be paying twice for an answer already in memory. Taking a snapshot instead means the caches stay where
//! they are — a cache is a *capability's* concern, not a transform's — and this
//! crate stays a pure function over a vault, testable with a `tempdir` and no
//! host.
//!
//! [`VaultFacts::scan`] is the standalone path: build the same snapshot by walking
//! and reading. It is what the crate's own tests run against, so the
//! algorithm is exercised against a snapshot nothing else produced.

use std::collections::BTreeMap;
use std::path::Path;

use markdown_link::BodyLink;

/// One link-shaped value found in a note's frontmatter.
///
/// Never rewritten — see [`crate::plan::plan`]'s scope note — so all that is kept is
/// what a diagnostic has to say: which key it was under and what it named.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontmatterRef {
    /// The top-level frontmatter key the value was under, when known.
    pub field: Option<String>,
    /// The link target as written.
    pub target: String,
}

/// Everything the planner reads about the vault as a whole.
#[derive(Debug, Clone, Default)]
pub struct VaultFacts {
    /// Every file a link can resolve to — notes and attachments alike, which
    /// is `WalkOptions::notes_and_attachments()`'s set. Attachments belong in
    /// it because `![[assets/diagram.svg]]` is a link, and a corpus built from
    /// notes alone would report it unresolved.
    pub paths: Vec<String>,
    /// Per note, its outgoing body links as written, with spans. Used only to
    /// decide **which notes to open**: the spans here were taken when the note
    /// was last scanned, and the planner re-reads and re-scans every file it is
    /// about to edit. The snapshot is a filter; the file is the truth.
    pub links: BTreeMap<String, Vec<BodyLink>>,
    /// Per note, the link-shaped values in its frontmatter.
    pub frontmatter: BTreeMap<String, Vec<FrontmatterRef>>,
}

impl VaultFacts {
    /// Build the snapshot by walking and reading the vault.
    ///
    /// The standalone path. A caller holding warm caches should populate the
    /// fields directly instead — that is the whole reason they are public.
    pub fn scan(vault_dir: &Path) -> VaultFacts {
        let entries = markdown_vault_fs::walk::walk(
            vault_dir,
            &markdown_vault_fs::walk::WalkOptions::notes_and_attachments(),
        );
        let mut facts = VaultFacts {
            paths: entries.iter().map(|e| e.rel.clone()).collect(),
            ..VaultFacts::default()
        };
        for entry in entries.into_iter().filter(|e| e.is_note) {
            // An unreadable note contributes nothing rather than aborting the
            // scan: a projection over thousands of notes must never die on one.
            let Ok(source) = std::fs::read_to_string(&entry.abs) else {
                continue;
            };
            let split = frontmatter_lossless::split(&source);
            facts.links.insert(
                entry.rel.clone(),
                markdown_link::body_links_spanned(split.body),
            );
            if let Some(yaml) = split.yaml
                && let Ok(mapping) = yaml_splice::parse::parse_mapping(yaml)
            {
                let refs: Vec<FrontmatterRef> = markdown_link::frontmatter_links(&mapping)
                    .into_iter()
                    .map(|l| FrontmatterRef {
                        field: l.field,
                        target: l.target,
                    })
                    .collect();
                if !refs.is_empty() {
                    facts.frontmatter.insert(entry.rel, refs);
                }
            }
        }
        facts
    }

    /// How many notes the snapshot covers.
    pub fn notes_scanned(&self) -> u64 {
        self.links.len() as u64
    }
}

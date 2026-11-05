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
//! [`VaultFacts::from_corpus`] builds it from the shared corpus model,
//! [`VaultFacts::from_graph`] from that model's link graph alone, and
//! [`VaultFacts::scan`] is the standalone path: load that model from disk first. It is what the crate's own tests run against, so the
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
    /// The snapshot out of a loaded [`markdown_corpus::Corpus`]: its paths, each
    /// note's body links with spans, and each note's frontmatter link values.
    ///
    /// The path a caller holding the corpus model takes, so the planner reads
    /// the same walk, links and resolution corpus every other tool does. The
    /// same as [`VaultFacts::from_graph`] on the corpus's link graph.
    pub fn from_corpus(corpus: &markdown_corpus::Corpus) -> VaultFacts {
        VaultFacts::from_graph(corpus.links())
    }

    /// The snapshot out of a [`markdown_corpus::LinkGraph`] alone, for a host
    /// that keeps a graph and no whole `Corpus`.
    ///
    /// The paths, body links and frontmatter links are read under one lock
    /// hold ([`markdown_corpus::LinkGraph::with_snapshot`]), so they come from
    /// the same sweep even while another thread refreshes the graph.
    pub fn from_graph(graph: &markdown_corpus::LinkGraph) -> VaultFacts {
        graph.with_snapshot(|paths, notes| {
            let links = notes
                .iter()
                .map(|(path, facts)| (path.clone(), facts.links.clone()))
                .collect();
            let frontmatter = notes
                .iter()
                .filter(|(_, facts)| !facts.frontmatter_links.is_empty())
                .map(|(path, facts)| {
                    let refs = facts
                        .frontmatter_links
                        .iter()
                        .map(|l| FrontmatterRef {
                            field: l.field.clone(),
                            target: l.target.clone(),
                        })
                        .collect();
                    (path.clone(), refs)
                })
                .collect();
            VaultFacts {
                paths: paths.to_vec(),
                links,
                frontmatter,
            }
        })
    }

    /// Build the snapshot by loading the vault from the real filesystem:
    /// [`markdown_corpus::Corpus::load`] over `NativeVfs`, then
    /// [`VaultFacts::from_corpus`].
    ///
    /// The standalone path. A caller holding warm caches should build the
    /// snapshot from them instead.
    pub fn scan(vault_dir: &Path) -> VaultFacts {
        let corpus = markdown_corpus::Corpus::load(
            &vfs_seam::NativeVfs,
            vault_dir,
            markdown_corpus::LoadOptions::default(),
        );
        VaultFacts::from_corpus(&corpus)
    }

    /// How many notes the snapshot covers.
    pub fn notes_scanned(&self) -> u64 {
        self.links.len() as u64
    }
}

//! [`Vault`]: the link graph and the frontmatter index over one vault root,
//! loaded in one call.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use markdown_contract::DocTree;
use markdown_link::{BodyLink, RawLink, ResolveError};
use vfs_seam::{Clock, FixedClock, Vfs, VfsError};

use crate::frontmatter::{FrontmatterIndex, IndexedNote, RefreshStats};
use crate::links::{BacklinkPage, Edge, GraphStats, LinkGraph, join_rel};
use crate::note::{Note, read_note};
use crate::tags::TagLexer;

/// How [`Vault::load`] builds the model.
#[derive(Clone, Default)]
pub struct LoadOptions {
    /// The inline-tag lexer. `None` finds no tags.
    pub tags: Option<Arc<dyn TagLexer + Send + Sync>>,
}

impl std::fmt::Debug for LoadOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LoadOptions")
            .field("tags", &self.tags.is_some())
            .finish()
    }
}

/// What a [`Vault::refresh`] changed, per cache.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct VaultStats {
    /// The link graph's changes.
    pub links: GraphStats,
    /// The frontmatter index's changes.
    pub frontmatter: RefreshStats,
}

/// One vault, its link graph and its frontmatter index.
///
/// [`Vault::load`] builds both in one call, for a CLI or a wasm host that
/// reads a vault once. A long-lived host keeps the `Vault` and calls
/// [`Vault::refresh`] or [`Vault::apply_changes`] as files change. `Send +
/// Sync`, like the two caches.
#[derive(Debug)]
pub struct Vault {
    root: PathBuf,
    links: LinkGraph,
    frontmatter: FrontmatterIndex,
}

impl Vault {
    /// Walks and reads the vault at `root` through `vfs` once.
    ///
    /// The load is stamped at time 0, so the first [`Vault::refresh`] with a
    /// real clock walks again; [`Vault::apply_changes`] works straight away.
    pub fn load(vfs: &dyn Vfs, root: impl Into<PathBuf>, opts: LoadOptions) -> Vault {
        let vault = Vault::empty(root, opts);
        vault.refresh_now(vfs, &FixedClock::new(0));
        vault
    }

    /// A vault at `root` with nothing read yet; the first refresh reads it.
    pub fn empty(root: impl Into<PathBuf>, opts: LoadOptions) -> Vault {
        Vault {
            root: root.into(),
            links: match opts.tags {
                Some(tags) => LinkGraph::with_tags(tags),
                None => LinkGraph::new(),
            },
            frontmatter: FrontmatterIndex::new(),
        }
    }

    /// The vault directory.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The link graph.
    pub fn links(&self) -> &LinkGraph {
        &self.links
    }

    /// The frontmatter index.
    pub fn frontmatter(&self) -> &FrontmatterIndex {
        &self.frontmatter
    }

    /// Brings both caches up to date, reusing a sweep younger than the TTL.
    pub fn refresh(&self, vfs: &dyn Vfs, clock: &dyn Clock) -> VaultStats {
        VaultStats {
            links: self.links.refresh(vfs, clock, &self.root),
            frontmatter: self.frontmatter.refresh(vfs, clock, &self.root),
        }
    }

    /// [`Vault::refresh`] that always walks.
    pub fn refresh_now(&self, vfs: &dyn Vfs, clock: &dyn Clock) -> VaultStats {
        VaultStats {
            links: self.links.refresh_now(vfs, clock, &self.root),
            frontmatter: self.frontmatter.refresh_now(vfs, clock, &self.root),
        }
    }

    /// Brings both caches up to date for named changed paths, without a walk.
    pub fn apply_changes(&self, vfs: &dyn Vfs, rels: &[String]) {
        self.links.apply_changes(vfs, &self.root, rels);
        for rel in rels {
            self.frontmatter.apply_change(vfs, &self.root, rel);
        }
    }

    /// Every file a link can resolve to, notes and attachments.
    pub fn paths(&self) -> Vec<String> {
        self.links.paths()
    }

    /// Each note's outgoing body links, as written, with body-relative spans.
    pub fn body_links(&self) -> BTreeMap<String, Vec<BodyLink>> {
        self.links.with_notes(|notes| {
            notes
                .iter()
                .map(|(path, facts)| (path.clone(), facts.links.clone()))
                .collect()
        })
    }

    /// Each note's frontmatter references (wikilinks and file paths, with the
    /// top-level key). Notes with none are left out.
    pub fn frontmatter_links(&self) -> BTreeMap<String, Vec<RawLink>> {
        self.links.with_notes(|notes| {
            notes
                .iter()
                .filter(|(_, facts)| !facts.frontmatter_links.is_empty())
                .map(|(path, facts)| (path.clone(), facts.frontmatter_links.clone()))
                .collect()
        })
    }

    /// One content note's cached frontmatter.
    pub fn note(&self, rel: &str) -> Option<Arc<IndexedNote>> {
        self.frontmatter.get(rel)
    }

    /// What `target` resolves to as written in `from`.
    pub fn resolve(&self, target: &str, from: &str) -> Option<String> {
        self.links.resolve(target, from)
    }

    /// [`Vault::resolve`] that refuses an ambiguous target.
    pub fn resolve_strict(&self, target: &str, from: &str) -> Result<String, ResolveError> {
        self.links.resolve_strict(target, from)
    }

    /// The notes whose body links to `path`. See [`LinkGraph::backlinks`].
    pub fn backlinks(&self, path: &str) -> BacklinkPage {
        self.links.backlinks(path)
    }

    /// Every edge out of `source`. See [`LinkGraph::outbound`].
    pub fn outbound(&self, source: &str) -> Vec<Edge> {
        self.links.outbound(source)
    }

    /// Reads the note at vault-relative `rel` without failing on its
    /// frontmatter. See [`read_note`].
    pub fn read_note(&self, vfs: &dyn Vfs, rel: &str) -> Result<Note, VfsError> {
        let bytes = vfs.read_file(&join_rel(&self.root, rel))?;
        Ok(read_note(&String::from_utf8_lossy(&bytes)))
    }

    /// The document tree of the note at vault-relative `rel`, for heading and
    /// block selection. See [`document`].
    pub fn document(&self, vfs: &dyn Vfs, rel: &str) -> Result<DocTree, VfsError> {
        document(vfs, &join_rel(&self.root, rel))
    }
}

/// The document tree of the note at `path`, parsed by `markdown-contract`.
/// Only reading the file can fail.
pub fn document(vfs: &dyn Vfs, path: &Path) -> Result<DocTree, VfsError> {
    let bytes = vfs.read_file(path)?;
    Ok(markdown_contract::parse_document(&String::from_utf8_lossy(
        &bytes,
    )))
}

#[cfg(test)]
mod tests {
    use vfs_seam::MemVfs;

    use super::*;
    use crate::links::EdgeKind;

    fn vault_fs() -> MemVfs {
        let d = MemVfs::new();
        d.insert(
            "/v/Home.md",
            "---\nup: \"[[Alpha]]\"\n---\n# Home\n\nSee [[Alpha#Intro]].\n",
        )
        .unwrap();
        d.insert("/v/Alpha.md", "# Alpha\n\n## Intro\n\nText.\n")
            .unwrap();
        d.insert("/v/Bad.md", "---\na: [1\n---\nbody [[Gone]]\n")
            .unwrap();
        d
    }

    #[test]
    fn load_reads_links_and_frontmatter_in_one_pass() {
        let d = vault_fs();
        let v = Vault::load(&d, "/v", LoadOptions::default());
        assert_eq!(v.paths(), ["Alpha.md", "Bad.md", "Home.md"]);
        assert_eq!(v.backlinks("Alpha.md").total, 1);
        assert_eq!(v.resolve("Alpha", "Home.md").as_deref(), Some("Alpha.md"));
        assert!(v.note("Bad.md").unwrap().parse_error.is_some());
        let kinds: Vec<EdgeKind> = v.outbound("Home.md").iter().map(|e| e.kind).collect();
        assert_eq!(kinds, [EdgeKind::Link, EdgeKind::Frontmatter]);
    }

    #[test]
    fn body_and_frontmatter_links_are_kept_per_note() {
        let d = vault_fs();
        let v = Vault::load(&d, "/v", LoadOptions::default());
        let body = v.body_links();
        assert_eq!(body["Home.md"][0].target, "Alpha");
        assert_eq!(body["Home.md"][0].heading.as_deref(), Some("Intro"));
        assert_eq!(body["Bad.md"][0].target, "Gone");
        let fm = v.frontmatter_links();
        assert_eq!(fm.keys().collect::<Vec<_>>(), ["Home.md"]);
        assert_eq!(fm["Home.md"][0].target, "Alpha");
        assert_eq!(fm["Home.md"][0].field.as_deref(), Some("up"));
    }

    #[test]
    fn apply_changes_updates_both_caches_without_a_walk() {
        let d = vault_fs();
        let v = Vault::load(&d, "/v", LoadOptions::default());
        d.insert("/v/Alpha.md", "---\nstatus: done\n---\n[[Home]]\n")
            .unwrap();
        v.apply_changes(&d, &["Alpha.md".to_string()]);
        assert_eq!(v.links().rebuilds(), 1);
        assert_eq!(v.backlinks("Home.md").total, 1);
        let status = v
            .note("Alpha.md")
            .unwrap()
            .frontmatter
            .get("status")
            .cloned();
        assert_eq!(status.as_ref().and_then(|s| s.as_str()), Some("done"));
    }

    #[test]
    fn read_note_tolerates_bad_frontmatter_and_document_parses_the_body() {
        let d = vault_fs();
        let v = Vault::empty("/v", LoadOptions::default());
        let note = v.read_note(&d, "Bad.md").unwrap();
        assert!(note.parse_error.is_some());
        assert!(note.body.contains("[[Gone]]"));
        assert!(v.read_note(&d, "Missing.md").is_err());
        assert!(v.document(&d, "Alpha.md").is_ok());
        assert!(document(&d, Path::new("/v/Missing.md")).is_err());
    }

    #[test]
    fn a_vault_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Vault>();
    }
}

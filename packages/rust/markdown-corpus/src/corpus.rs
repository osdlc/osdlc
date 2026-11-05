//! [`Corpus`]: the link graph and the frontmatter index over one corpus root,
//! loaded in one call.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use markdown_link::{BodyLink, RawLink, ResolveError};
use markdown_vault_fs::walk::{WalkError, WalkOptions};
use vfs_seam::{Clock, FixedClock, Vfs, VfsError};

use crate::frontmatter::{FrontmatterIndex, IndexedNote, RefreshStats};
use crate::links::{Backlink, BacklinkPage, Edge, GraphStats, LinkGraph, LinkSnapshot, join_rel};
use crate::note::{Note, SplitMode, read_note_with};
use crate::tags::TagLexer;

/// How [`Corpus::load`] builds the model.
///
/// The default is the model as it always was: no tags, the two walks below
/// with their defaults, and the strict frontmatter split. Start from
/// [`LoadOptions::default`] and change what you need, with the `with_`
/// methods or by setting a field; new fields come with defaults, so this
/// struct can grow without breaking a caller.
///
/// # Two walks
///
/// The link graph and the frontmatter index walk differently on purpose (see
/// the [crate docs](crate)), so each has its own [`WalkOptions`]. A caller
/// that changes something for both, such as the roots or the pruned
/// folders, sets it in both.
#[derive(Clone)]
#[non_exhaustive]
pub struct LoadOptions {
    /// The inline-tag lexer. `None` finds no tags.
    pub tags: Option<Arc<dyn TagLexer + Send + Sync>>,
    /// The link graph's walk. Default [`LinkGraph::default_walk`]: notes and
    /// attachments, `_system/` and excluded files included.
    pub link_walk: WalkOptions,
    /// The frontmatter index's walk. Default
    /// [`FrontmatterIndex::default_walk`]: content notes, the corpus's
    /// excluded files left out.
    pub frontmatter_walk: WalkOptions,
    /// How each note's frontmatter is found, for both caches and
    /// [`Corpus::read_note`]. Default [`SplitMode::Strict`].
    pub split: SplitMode,
}

impl Default for LoadOptions {
    fn default() -> Self {
        LoadOptions {
            tags: None,
            link_walk: LinkGraph::default_walk(),
            frontmatter_walk: FrontmatterIndex::default_walk(),
            split: SplitMode::default(),
        }
    }
}

impl LoadOptions {
    /// These options, lexing inline tags with `tags`.
    pub fn with_tags(mut self, tags: Arc<dyn TagLexer + Send + Sync>) -> Self {
        self.tags = Some(tags);
        self
    }

    /// These options, with the link graph walking by `walk`.
    pub fn with_link_walk(mut self, walk: WalkOptions) -> Self {
        self.link_walk = walk;
        self
    }

    /// These options, with the frontmatter index walking by `walk`.
    pub fn with_frontmatter_walk(mut self, walk: WalkOptions) -> Self {
        self.frontmatter_walk = walk;
        self
    }

    /// These options, finding each note's frontmatter by `split`.
    pub fn with_split(mut self, split: SplitMode) -> Self {
        self.split = split;
        self
    }
}

impl std::fmt::Debug for LoadOptions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LoadOptions")
            .field("tags", &self.tags.is_some())
            .field("link_walk", &self.link_walk)
            .field("frontmatter_walk", &self.frontmatter_walk)
            .field("split", &self.split)
            .finish()
    }
}

/// What a [`Corpus::refresh`] changed, per cache.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CorpusStats {
    /// The link graph's changes.
    pub links: GraphStats,
    /// The frontmatter index's changes.
    pub frontmatter: RefreshStats,
}

/// One corpus, its link graph and its frontmatter index.
///
/// [`Corpus::load`] builds both in one call, for a CLI or a wasm host that
/// reads a corpus once. A long-lived host keeps the `Corpus` and calls
/// [`Corpus::refresh`] or [`Corpus::apply_changes`] as files change. `Send +
/// Sync`, like the two caches.
#[derive(Debug)]
pub struct Corpus {
    root: PathBuf,
    links: LinkGraph,
    frontmatter: FrontmatterIndex,
}

impl Corpus {
    /// Walks and reads the corpus at `root` through `vfs` once.
    ///
    /// The load is stamped at time 0, so the first [`Corpus::refresh`] with a
    /// real clock walks again; [`Corpus::apply_changes`] works straight away.
    /// A walk error (only possible when a walk in `opts` refuses symlinks or
    /// propagates errors) leaves that cache empty; [`Corpus::try_load`]
    /// returns it instead.
    pub fn load(vfs: &dyn Vfs, root: impl Into<PathBuf>, opts: LoadOptions) -> Corpus {
        let corpus = Corpus::empty(root, opts);
        corpus.refresh_now(vfs, &FixedClock::new(0));
        corpus
    }

    /// [`Corpus::load`] that fails on the first walk error: a folder that
    /// cannot be listed or a file that cannot be statted, when a walk
    /// propagates errors, or a symlink, when a walk refuses them.
    pub fn try_load(
        vfs: &dyn Vfs,
        root: impl Into<PathBuf>,
        opts: LoadOptions,
    ) -> Result<Corpus, WalkError> {
        let corpus = Corpus::empty(root, opts);
        corpus.try_refresh_now(vfs, &FixedClock::new(0))?;
        Ok(corpus)
    }

    /// A corpus at `root` with nothing read yet; the first refresh reads it.
    pub fn empty(root: impl Into<PathBuf>, opts: LoadOptions) -> Corpus {
        let links = match opts.tags {
            Some(tags) => LinkGraph::with_tags(tags),
            None => LinkGraph::new(),
        };
        Corpus {
            root: root.into(),
            links: links.with_walk(opts.link_walk).with_split(opts.split),
            frontmatter: FrontmatterIndex::new()
                .with_walk(opts.frontmatter_walk)
                .with_split(opts.split),
        }
    }

    /// The corpus directory.
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
    pub fn refresh(&self, vfs: &dyn Vfs, clock: &dyn Clock) -> CorpusStats {
        CorpusStats {
            links: self.links.refresh(vfs, clock, &self.root),
            frontmatter: self.frontmatter.refresh(vfs, clock, &self.root),
        }
    }

    /// [`Corpus::refresh`] that always walks.
    pub fn refresh_now(&self, vfs: &dyn Vfs, clock: &dyn Clock) -> CorpusStats {
        CorpusStats {
            links: self.links.refresh_now(vfs, clock, &self.root),
            frontmatter: self.frontmatter.refresh_now(vfs, clock, &self.root),
        }
    }

    /// [`Corpus::refresh`] that returns the first walk error. A cache whose
    /// walk failed is left as it was.
    pub fn try_refresh(&self, vfs: &dyn Vfs, clock: &dyn Clock) -> Result<CorpusStats, WalkError> {
        Ok(CorpusStats {
            links: self.links.try_refresh(vfs, clock, &self.root)?,
            frontmatter: self.frontmatter.try_refresh(vfs, clock, &self.root)?,
        })
    }

    /// [`Corpus::refresh_now`] that returns the first walk error.
    pub fn try_refresh_now(
        &self,
        vfs: &dyn Vfs,
        clock: &dyn Clock,
    ) -> Result<CorpusStats, WalkError> {
        Ok(CorpusStats {
            links: self.links.try_refresh_now(vfs, clock, &self.root)?,
            frontmatter: self.frontmatter.try_refresh_now(vfs, clock, &self.root)?,
        })
    }

    /// Brings both caches up to date for named changed paths, without a walk.
    pub fn apply_changes(&self, vfs: &dyn Vfs, rels: &[String]) {
        self.links.apply_changes(vfs, &self.root, rels);
        self.frontmatter.apply_changes(vfs, &self.root, rels);
    }

    /// Every file a link can resolve to, notes and attachments.
    pub fn paths(&self) -> Vec<String> {
        self.links.paths()
    }

    /// Each note's outgoing body links. See [`LinkGraph::body_links`].
    pub fn body_links(&self) -> BTreeMap<String, Vec<BodyLink>> {
        self.links.body_links()
    }

    /// Each note's frontmatter references. See
    /// [`LinkGraph::frontmatter_links`].
    pub fn frontmatter_links(&self) -> BTreeMap<String, Vec<RawLink>> {
        self.links.frontmatter_links()
    }

    /// Every path, body link and frontmatter link from one sweep. See
    /// [`LinkGraph::snapshot`].
    pub fn snapshot(&self) -> LinkSnapshot {
        self.links.snapshot()
    }

    /// One content note's cached frontmatter.
    pub fn note(&self, rel: &str) -> Option<Arc<IndexedNote>> {
        self.frontmatter.get(rel)
    }

    /// What `target` resolves to as written in `from`.
    pub fn resolve(&self, target: &str, from: &str) -> Option<String> {
        self.links.resolve(target, from)
    }

    /// [`Corpus::resolve`] that refuses an ambiguous target.
    pub fn resolve_strict(&self, target: &str, from: &str) -> Result<String, ResolveError> {
        self.links.resolve_strict(target, from)
    }

    /// The notes whose body links to `path`. See [`LinkGraph::backlinks`].
    pub fn backlinks(&self, path: &str) -> BacklinkPage {
        self.links.backlinks(path)
    }

    /// Fills each backlink context's `text` from its source note. See
    /// [`LinkGraph::fill_contexts`].
    pub fn fill_contexts(&self, vfs: &dyn Vfs, backlinks: &mut [Backlink]) {
        self.links.fill_contexts(vfs, backlinks);
    }

    /// Every edge out of `source`. See [`LinkGraph::outbound`].
    pub fn outbound(&self, source: &str) -> Vec<Edge> {
        self.links.outbound(source)
    }

    /// Reads the note at corpus-relative `rel` without failing on its
    /// frontmatter, split as [`LoadOptions::split`] says. See
    /// [`crate::read_note_with`].
    pub fn read_note(&self, vfs: &dyn Vfs, rel: &str) -> Result<Note, VfsError> {
        let bytes = vfs.read_file(&join_rel(&self.root, rel))?;
        Ok(read_note_with(
            &String::from_utf8_lossy(&bytes),
            self.links.split_mode(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use markdown_vault_fs::HideRules;
    use markdown_vault_fs::walk::{Hide, Visibility};
    use vfs_seam::MemVfs;

    use super::*;
    use crate::links::EdgeKind;

    fn corpus_fs() -> MemVfs {
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
        let d = corpus_fs();
        let v = Corpus::load(&d, "/v", LoadOptions::default());
        assert_eq!(v.paths(), ["Alpha.md", "Bad.md", "Home.md"]);
        assert_eq!(v.backlinks("Alpha.md").total, 1);
        assert_eq!(v.resolve("Alpha", "Home.md").as_deref(), Some("Alpha.md"));
        assert!(v.note("Bad.md").unwrap().parse_error.is_some());
        let kinds: Vec<EdgeKind> = v.outbound("Home.md").iter().map(|e| e.kind).collect();
        assert_eq!(kinds, [EdgeKind::Link, EdgeKind::Frontmatter]);
    }

    #[test]
    fn body_and_frontmatter_links_are_kept_per_note() {
        let d = corpus_fs();
        let v = Corpus::load(&d, "/v", LoadOptions::default());
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
        let d = corpus_fs();
        let v = Corpus::load(&d, "/v", LoadOptions::default());
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
    fn read_note_tolerates_bad_frontmatter() {
        let d = corpus_fs();
        let v = Corpus::empty("/v", LoadOptions::default());
        let note = v.read_note(&d, "Bad.md").unwrap();
        assert!(note.parse_error.is_some());
        assert!(note.body.contains("[[Gone]]"));
        assert!(v.read_note(&d, "Missing.md").is_err());
    }

    fn options_fs() -> MemVfs {
        let d = MemVfs::new();
        for (rel, body) in [
            ("Notes/Home.md", "See [[Alpha]] and [[pkg]].\n"),
            ("Notes/Alpha.md", "---\nstatus: draft\n---\n# Alpha\n"),
            ("Private/Diary.md", "---\nmood: ok\n---\n[[Alpha]]\n"),
            ("node_modules/pkg.md", "# pkg\n"),
            (".config/tool.md", "[[Alpha]]\n"),
        ] {
            d.insert(Path::new("/v").join(rel), body).unwrap();
        }
        d
    }

    #[test]
    fn the_default_options_walk_as_before() {
        let d = options_fs();
        let v = Corpus::load(&d, "/v", LoadOptions::default());
        assert_eq!(
            v.paths(),
            [
                "node_modules/pkg.md",
                "Notes/Alpha.md",
                "Notes/Home.md",
                "Private/Diary.md"
            ]
        );
        assert_eq!(v.frontmatter().len(), 4);
    }

    #[test]
    fn caller_walks_prune_hide_and_show_dot_files() {
        let d = options_fs();
        let (rules, _) = HideRules::parse(&["Private/"]);
        let link_walk = WalkOptions {
            visibility: Visibility::Everything,
            prune_dirs: vec!["node_modules".into()],
            ..LinkGraph::default_walk()
        };
        let frontmatter_walk = WalkOptions {
            hide: Hide::Rules(Arc::new(rules)),
            prune_dirs: vec!["node_modules".into()],
            ..FrontmatterIndex::default_walk()
        };
        let opts = LoadOptions::default()
            .with_link_walk(link_walk)
            .with_frontmatter_walk(frontmatter_walk);
        let v = Corpus::load(&d, "/v", opts);
        // The dot folder is walked, the pruned one is not.
        assert!(v.paths().contains(&".config/tool.md".to_string()));
        assert!(!v.paths().iter().any(|p| p.starts_with("node_modules")));
        assert_eq!(v.resolve("pkg", "Notes/Home.md"), None);
        assert_eq!(v.backlinks("Notes/Alpha.md").total, 3);
        // The index leaves out what the caller's rules hide, in every answer.
        let index = v.frontmatter();
        assert!(v.note("Private/Diary.md").is_none());
        assert_eq!(index.len(), 2);
        assert_eq!(index.page(0, None).1, 2);
        let changes = index.changes();
        v.apply_changes(&d, &["Private/Diary.md".to_string()]);
        assert_eq!(index.changes(), changes, "a hidden path is not the index's");
        assert_eq!(index.len(), 2);
    }

    #[test]
    fn an_apply_drops_a_cached_note_the_walk_would_no_longer_list() {
        let d = MemVfs::new();
        d.insert("/v/A.md", "---\nk: v\n---\n[[B]] and some text\n")
            .unwrap();
        d.insert("/v/B.md", "b").unwrap();
        let opts = LoadOptions::default()
            .with_link_walk(WalkOptions {
                min_bytes: 10,
                ..LinkGraph::default_walk()
            })
            .with_frontmatter_walk(WalkOptions {
                min_bytes: 10,
                ..FrontmatterIndex::default_walk()
            });
        let v = Corpus::load(&d, "/v", opts);
        assert_eq!(v.paths(), ["A.md"]);
        assert!(v.note("A.md").is_some());

        // Too small now: the next sweep would drop it, so the apply does.
        d.insert("/v/A.md", "x").unwrap();
        v.apply_changes(&d, &["A.md".to_string()]);
        assert!(v.paths().is_empty());
        assert!(v.body_links().is_empty());
        assert!(v.note("A.md").is_none());
    }

    #[test]
    fn roots_scope_both_walks() {
        let d = options_fs();
        let notes = vec!["Notes".to_string()];
        let opts = LoadOptions::default()
            .with_link_walk(WalkOptions {
                roots: notes.clone(),
                ..LinkGraph::default_walk()
            })
            .with_frontmatter_walk(WalkOptions {
                roots: notes,
                ..FrontmatterIndex::default_walk()
            });
        let v = Corpus::load(&d, "/v", opts);
        assert_eq!(v.paths(), ["Notes/Alpha.md", "Notes/Home.md"]);
        assert_eq!(v.frontmatter().len(), 2);
        // A change outside the roots is not the corpus's.
        d.insert("/v/Other.md", "[[Alpha]]\n").unwrap();
        v.apply_changes(&d, &["Other.md".to_string()]);
        assert_eq!(v.paths(), ["Notes/Alpha.md", "Notes/Home.md"]);
    }

    #[test]
    fn try_load_returns_the_walk_error_load_leaves_empty() {
        let d = MemVfs::new();
        let strict = WalkOptions {
            propagate_errors: true,
            ..FrontmatterIndex::default_walk()
        };
        let opts = LoadOptions::default().with_frontmatter_walk(strict);
        let err = Corpus::try_load(&d, "/missing", opts.clone()).unwrap_err();
        assert!(
            matches!(err, WalkError::Io(ref e) if e.is_not_found()),
            "{err}"
        );
        let v = Corpus::load(&d, "/missing", opts.clone());
        assert!(v.frontmatter().is_empty());
        // With the folder there, the same options load.
        d.insert("/missing/a.md", "x").unwrap();
        assert_eq!(
            Corpus::try_load(&d, "/missing", opts).unwrap().paths(),
            ["a.md"]
        );
    }

    #[cfg(all(unix, feature = "native"))]
    #[test]
    fn try_load_refuses_a_symlink_when_asked() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("real.md"), "x").unwrap();
        std::os::unix::fs::symlink(dir.path().join("real.md"), dir.path().join("link.md")).unwrap();
        let refuse = WalkOptions {
            refuse_symlinks: true,
            ..LinkGraph::default_walk()
        };
        let opts = LoadOptions::default().with_link_walk(refuse);
        let err = Corpus::try_load(&vfs_seam::NativeVfs, dir.path(), opts).unwrap_err();
        assert!(matches!(err, WalkError::Symlink(_)), "{err}");
        let v = Corpus::load(&vfs_seam::NativeVfs, dir.path(), LoadOptions::default());
        assert_eq!(v.paths(), ["link.md", "real.md"]);
    }

    #[test]
    fn the_lenient_split_reads_a_block_the_strict_one_takes_for_body() {
        let d = MemVfs::new();
        d.insert("/v/A.md", "\n---  \nup: \"[[B]]\"\n---\nBody [[B]].\n")
            .unwrap();
        d.insert("/v/B.md", "b").unwrap();
        let strict = Corpus::load(&d, "/v", LoadOptions::default());
        assert!(strict.note("A.md").unwrap().frontmatter.is_empty());
        assert_eq!(strict.body_links()["A.md"].len(), 2, "the block is body");

        let lenient = Corpus::load(
            &d,
            "/v",
            LoadOptions::default().with_split(SplitMode::Lenient),
        );
        assert!(
            lenient
                .note("A.md")
                .unwrap()
                .frontmatter
                .get("up")
                .is_some()
        );
        assert_eq!(lenient.body_links()["A.md"].len(), 1);
        assert_eq!(lenient.frontmatter_links()["A.md"][0].target, "B");
        let kinds: Vec<EdgeKind> = lenient.outbound("A.md").iter().map(|e| e.kind).collect();
        assert_eq!(kinds, [EdgeKind::Link, EdgeKind::Frontmatter]);
        assert!(lenient.read_note(&d, "A.md").unwrap().parse_error.is_none());
        let mut back = lenient.backlinks("B.md").backlinks;
        lenient.fill_contexts(&d, &mut back);
        assert_eq!(back[0].contexts[0].text, "Body [[B]].");
    }

    #[test]
    fn a_corpus_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Corpus>();
    }
}

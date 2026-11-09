//! markdown-corpus — the one corpus model.
//!
//! A corpus is a folder of Markdown notes and the files they link to; an
//! Obsidian vault is one example. This crate is the model every osdlc tool
//! reads it through, so they agree on what is in it and what links where:
//!
//! - every file and every note, from `markdown-vault-fs`'s walk;
//! - each note's outgoing links, embeds and frontmatter references, typed by
//!   [`EdgeKind`], with spans and lines, and the edges that resolve to
//!   nothing kept;
//! - backlinks, inverted once per sweep, so "what links here" is a lookup;
//! - link resolution through `markdown-link`'s [`LinkIndex`], from the
//!   linking note, with [`LinkGraph::resolve_strict`] for a caller that must
//!   refuse an ambiguous name;
//! - inline tags, through a [`TagLexer`] the caller supplies;
//! - each content note's parsed frontmatter ([`FrontmatterIndex`]), read
//!   tolerantly: a malformed block is an empty mapping and a diagnostic, never
//!   a failed walk ([`read_note`]).
//!
//! A note's document tree (headings, blocks) is not part of the model: a
//! caller that needs one parses the note with `markdown-contract`.
//!
//! # Through a `Vfs`
//!
//! Every read goes through a [`vfs_seam::Vfs`] and every "now" through a
//! [`vfs_seam::Clock`], both passed to each call. There is no `std::fs` and
//! no system clock in the crate, so it runs in a `wasm32-unknown-unknown`
//! host as it runs natively, and the caches stay `Send + Sync`.
//!
//! # One-shot or incremental
//!
//! [`Corpus::load`] reads a corpus once, for a CLI or a wasm page. A long-lived
//! host keeps the [`Corpus`] (or a [`LinkGraph`] and a [`FrontmatterIndex`] of
//! its own) and calls `refresh`, which re-reads only notes whose
//! `(size, mtime)` moved and reuses a sweep for a short time-to-live, or
//! `apply_changes` with the paths it knows changed.
//!
//! # Two walks
//!
//! The link graph walks notes and attachments, `_system/` and the corpus's
//! excluded files included: a link can point at any of them, and Obsidian
//! resolves links to excluded files. The frontmatter index walks the content
//! notes only, excluded files left out.
//!
//! Both walks are the caller's to change ([`LoadOptions::link_walk`],
//! [`LoadOptions::frontmatter_walk`], or `with_walk` on each cache): the
//! roots walked, dot files, pruned folders such as `node_modules`, refused
//! symlinks, read errors ([`Errors`]), and excluded files of the caller's own
//! as [`Hide::Rules`]. [`Corpus::try_load`] returns a walk error that
//! [`Corpus::load`] would leave as an empty cache. Under [`Errors::Report`]
//! a load keeps going past a folder it cannot list or a note it cannot read,
//! and [`Corpus::unreadable`] names each one.
//!
//! ```
//! use markdown_corpus::{Corpus, LoadOptions};
//! use markdown_corpus::vfs_seam::MemVfs;
//!
//! let vfs = MemVfs::new();
//! vfs.insert("/v/Home.md", "See [[Alpha]] and ![[img.png]].\n")?;
//! vfs.insert("/v/Projects/Alpha.md", "---\nstatus: draft\n---\n# Alpha\n")?;
//! vfs.insert("/v/img.png", "png")?;
//!
//! let corpus = Corpus::load(&vfs, "/v", LoadOptions::default());
//! assert_eq!(corpus.backlinks("Alpha").backlinks[0].source_path, "Home.md");
//! assert_eq!(corpus.resolve("Alpha", "Home.md").as_deref(), Some("Projects/Alpha.md"));
//! assert!(corpus.note("Projects/Alpha.md").is_some());
//! # Ok::<(), markdown_corpus::vfs_seam::VfsError>(())
//! ```

mod corpus;
pub mod frontmatter;
pub mod links;
pub mod note;
pub mod tags;

pub use corpus::{Corpus, CorpusStats, LoadOptions};
pub use frontmatter::{FrontmatterIndex, IndexedNote, RefreshStats};
pub use links::{
    Backlink, BacklinkPage, Edge, EdgeKind, GraphStats, LinkContext, LinkGraph, LinkSnapshot,
    MAX_BACKLINK_SOURCES, NoteBody, NoteFacts,
};
pub use markdown_link::{BodyLink, LinkIndex, RawLink, ResolveError};
pub use markdown_vault_fs;
pub use markdown_vault_fs::walk::{Errors, Hide, WalkError, WalkOptions};
pub use note::{Note, SplitMode, note_title, read_note, read_note_with, split_with};
pub use tags::{NoTags, TagCount, TagLexer, census};
pub use vfs_seam;

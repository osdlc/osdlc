//! markdown-vault — the one vault model.
//!
//! A vault is a folder of Markdown notes and the files they link to. This
//! crate is the model every osdlc tool reads it through, so they agree on
//! what is in it and what links where:
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
//!   a failed walk ([`read_note`]);
//! - each note's document tree from `markdown-contract`, for heading and
//!   block selection ([`document`]).
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
//! [`Vault::load`] reads a vault once, for a CLI or a wasm page. A long-lived
//! host keeps the [`Vault`] (or a [`LinkGraph`] and a [`FrontmatterIndex`] of
//! its own) and calls `refresh`, which re-reads only notes whose
//! `(size, mtime)` moved and reuses a sweep for a short time-to-live, or
//! `apply_changes` with the paths it knows changed.
//!
//! # Two walks
//!
//! The link graph walks notes and attachments, `_system/` and the vault's
//! excluded files included: a link can point at any of them, and Obsidian
//! resolves links to excluded files. The frontmatter index walks the content
//! notes only, excluded files left out.
//!
//! ```
//! use markdown_vault::{LoadOptions, Vault};
//! use markdown_vault::vfs_seam::MemVfs;
//!
//! let vfs = MemVfs::new();
//! vfs.insert("/v/Home.md", "See [[Alpha]] and ![[img.png]].\n")?;
//! vfs.insert("/v/Projects/Alpha.md", "---\nstatus: draft\n---\n# Alpha\n")?;
//! vfs.insert("/v/img.png", "png")?;
//!
//! let vault = Vault::load(&vfs, "/v", LoadOptions::default());
//! assert_eq!(vault.backlinks("Alpha").backlinks[0].source_path, "Home.md");
//! assert_eq!(vault.resolve("Alpha", "Home.md").as_deref(), Some("Projects/Alpha.md"));
//! assert!(vault.note("Projects/Alpha.md").is_some());
//! # Ok::<(), markdown_vault::vfs_seam::VfsError>(())
//! ```

pub mod frontmatter;
pub mod links;
pub mod note;
pub mod tags;
mod vault;

pub use frontmatter::{FrontmatterIndex, IndexedNote, RefreshStats};
pub use links::{
    Backlink, BacklinkPage, Edge, EdgeKind, GraphStats, LinkContext, LinkGraph,
    MAX_BACKLINK_SOURCES, NoteBody, NoteFacts, fill_contexts,
};
pub use markdown_link::{BodyLink, LinkIndex, RawLink, ResolveError};
pub use note::{Note, note_title, read_note};
pub use tags::{NoTags, TagCount, TagLexer, census};
pub use vault::{LoadOptions, Vault, VaultStats, document};
pub use vfs_seam;

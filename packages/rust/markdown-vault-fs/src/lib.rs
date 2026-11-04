//! markdown-vault-fs — the vault layer over `vfs-walk`.
//!
//! **Through a `Vfs`.** Every read goes through [`vfs_seam::Vfs`], so the
//! same walk runs on a disk, in a test's in-memory tree and in a wasm host
//! with no filesystem. This is the one vault walk: other vault crates and
//! tools call it rather than keeping their own. [`native`] (the default
//! `native` feature) has one-line forms over the real filesystem.
//!
//! **On `vfs-walk`.** The traversal itself (sorting, symlinks, errors,
//! modification times) is [`vfs_walk`]'s, which knows nothing about vaults.
//! This crate adds the vault rules and passes them in as its filter. Code
//! that walks plain files (assets, scripts) should use `vfs-walk` directly.
//!
//! Five things, all deliberately free of any YAML or markdown knowledge:
//!
//! - [`mod@walk`] — the vault walk: notes versus attachments, visibility as a
//!   POLICY parameter, optional multi-root scoping, and the vault's excluded
//!   files applied by default.
//! - [`hide`] — the vault's excluded files (Obsidian's `userIgnoreFilters`
//!   syntax), read from `.obsidian/app.json` and compiled; the walk applies
//!   them through [`WalkOptions::hide`].
//! - [`path`] — the `_system/` rules, plus the `path-guard` containment guard
//!   every client-supplied vault-relative path goes through, re-exported.
//! - [`stat`] — a file's modification time through a `Vfs`, and node's
//!   `statSync()` millisecond floats for native callers. Re-exported from
//!   `vfs-walk`.
//! - [`native`] — the walk over `std::fs`, one line each.
//!
//! # Small on purpose
//!
//! A program that only needs the walk (to find images and PDFs, say) should
//! not have to pull in a YAML or markdown parser. This crate depends on none;
//! it reads `.obsidian/app.json` with `serde_json`.
//!
//! [`PathError`] has no conversion to an application's error type here:
//! applications convert it with a `From<PathError>` impl on their own error
//! type.
//!
//! The `_system/` predicates ([`path::is_system_path`], [`path::system_route`])
//! live here so that every enforcer of the policy (a writer that validates a
//! write under `_system/`, a rename planner that refuses a rename crossing the
//! boundary) shares one copy without depending on the other.

pub mod hide;
#[cfg(feature = "native")]
pub mod native;
pub mod path;
pub mod walk;

pub use vfs_walk::stat;

pub use hide::{HideList, HideRules};
pub use path::{Guard, PathError, SYSTEM_PREFIX, VfsResolver, is_system_path, system_route};
pub use stat::{created_ms, modified_ms, ms_since_epoch, mtime_ms};
pub use vfs_seam;
pub use vfs_walk;
pub use walk::{
    Entry, Hide, Visibility, WalkError, WalkOptions, WalkOutcome, walk, walk_notes, walk_reporting,
};

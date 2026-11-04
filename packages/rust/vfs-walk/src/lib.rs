//! vfs-walk — walk a folder tree through a [`vfs_seam::Vfs`].
//!
//! [`vfs_seam::Vfs::read_dir`] lists one folder. This crate is the recursion
//! above it, so every host (a disk, a test's in-memory tree, a wasm bridge)
//! walks by the same rules instead of each keeping its own copy.
//!
//! It knows nothing about Markdown or vaults. The caller passes its rules in:
//!
//! - [`WalkOptions::skip_names`] and [`WalkOptions::prune_dirs`] drop entries
//!   by name, such as `.DS_Store` or `node_modules`.
//! - [`WalkOptions::filter`] decides each file and folder by its relative
//!   path, before any stat. A rule such as a vault's excluded files gets in
//!   here.
//! - [`WalkOptions::symlinks`] lists, skips or refuses symlinks. A symlinked
//!   folder is never entered.
//! - [`WalkOptions::errors`] skips, reports or propagates a folder that cannot
//!   be listed and a file that cannot be statted.
//!
//! Each [`Entry`] carries the size and modification time from the one stat
//! the walk makes. [`stat`] has the time helpers, including Node's
//! `statSync()` millisecond floats for native callers.
//!
//! # Order
//!
//! Depth first, and by name within each folder as a `String` (byte order).
//! That is a stability guarantee, not a collation: the same tree always
//! yields the same sequence.
//!
//! # wasm
//!
//! The crate has no features and does no I/O of its own, so it builds for
//! `wasm32-unknown-unknown` as long as `vfs-seam`'s `native` feature is off.

pub mod stat;
pub mod walk;

pub use stat::{created_ms, modified_ms, ms_since_epoch, mtime_ms};
pub use vfs_seam;
pub use walk::{
    Candidate, Entry, Errors, Filter, Symlinks, WalkError, WalkOptions, WalkOutcome, walk,
    walk_subtree,
};

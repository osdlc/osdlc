//! markdown-vault-fs — vault filesystem primitives.
//!
//! **`fs`, not `vfs`.** Nothing here is virtual: this is `walkdir` plus a
//! visibility policy and a path guard, against one real filesystem. There is no
//! trait over a source, so the crate must not be named for one.
//!
//! Four things, all pure filesystem and all deliberately free of any YAML or
//! markdown knowledge:
//!
//! - [`mod@walk`] — the vault walk, with visibility as a POLICY parameter and
//!   optional multi-root scoping.
//! - [`path`] — the `_system/` rules, plus the `path-guard` containment guard
//!   every client-supplied vault-relative path goes through, re-exported.
//! - [`stat`] — file timestamps as node's `statSync()` millisecond floats.
//! - [`hide`] — the vault's excluded files (Obsidian's `userIgnoreFilters`
//!   syntax), compiled; the walk applies them through [`WalkOptions::hide`].
//!
//! # Small on purpose
//!
//! A program that only needs the walk (to find images and PDFs, say) should
//! not have to pull in a YAML or markdown parser. This crate depends on none.
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
pub mod path;
pub mod stat;
pub mod walk;

pub use hide::HideRules;
pub use path::{Guard, PathError, SYSTEM_PREFIX, is_system_path, system_route};
pub use stat::{created_ms, ms_since_epoch, mtime_ms};
pub use walk::{Entry, Visibility, WalkOptions, WalkOutcome, walk, walk_notes, walk_reporting};

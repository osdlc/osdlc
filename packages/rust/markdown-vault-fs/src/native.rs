//! The walk over the real filesystem, one line each.
//!
//! [`mod@crate::walk`] takes a [`vfs_seam::Vfs`]. These pass
//! [`vfs_seam::NativeVfs`] and make a relative vault directory absolute
//! first, so a relative and an absolute vault walk the same.

use std::path::{Path, PathBuf};

use vfs_seam::NativeVfs;

use crate::hide::{self, HideList};
use crate::walk::{self, Entry, WalkError, WalkOptions, WalkOutcome};

fn absolute(vault_dir: &Path) -> PathBuf {
    std::path::absolute(vault_dir).unwrap_or_else(|_| vault_dir.to_path_buf())
}

/// [`walk::walk`] over the real filesystem.
pub fn walk(vault_dir: &Path, opts: &WalkOptions) -> Result<Vec<Entry>, WalkError> {
    walk::walk(&NativeVfs, &absolute(vault_dir), opts)
}

/// [`walk::walk_reporting`] over the real filesystem.
pub fn walk_reporting(vault_dir: &Path, opts: &WalkOptions) -> Result<WalkOutcome, WalkError> {
    walk::walk_reporting(&NativeVfs, &absolute(vault_dir), opts)
}

/// [`walk::walk_notes`] over the real filesystem: the content notes of a
/// vault, as vault-relative paths.
pub fn walk_notes(vault_dir: &Path) -> Vec<String> {
    walk::walk_notes(&NativeVfs, &absolute(vault_dir))
}

/// [`hide::load`] over the real filesystem.
pub fn load_hide(vault_dir: &Path) -> HideList {
    hide::load(&NativeVfs, vault_dir)
}

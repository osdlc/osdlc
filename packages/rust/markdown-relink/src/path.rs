//! Turning a path a shell handed us into the vault-relative string every other
//! entry point in this crate takes.
//!
//! The planner's own surface is vault-relative throughout — the guards in
//! [`markdown_vault_fs::path`] reject anything else — but a CLI is handed whatever the
//! user typed: an absolute path, a relative one against the current directory,
//! a spelling that reaches the vault through a symlink. This is the one place
//! that reduction happens, so every shell front end answers the same.

use std::path::{Path, PathBuf};

use markdown_vault_fs::path::{Guard, PathError, lexical};

use crate::error::TransformError;

/// `path` expressed relative to `vault_dir`, with `/` separators.
///
/// Both sides go through [`Guard::real_path`] first:
/// on macOS a vault under `/tmp` is handed out as `/var/…` and canonicalises to
/// `/private/var/…`, so comparing raw spellings reports a path genuinely inside
/// the vault as outside it, and a rename's destination does not exist yet, so
/// only the part of it that does can be resolved. A path that does not land
/// inside the vault is [`TransformError::Invalid`] — caller input this crate
/// cannot act on, not a filesystem failure.
///
/// A dangling symlink reduces to where its target would land: `x.md -> new.md`
/// gives `new.md`, and a target outside the vault is `Invalid`. A path through
/// a symlink loop is left as written, so it reduces only when spelled under the
/// canonical vault path.
///
/// A relative `path` resolves against the **process** current directory, so a
/// caller that is not a shell front end should pass an absolute path.
pub fn to_vault_relative(vault_dir: &Path, path: &Path) -> Result<String, TransformError> {
    let cwd = || {
        std::env::current_dir()
            .map_err(|e| TransformError::Io(format!("reading the current directory: {e}")))
    };
    let absolute = |p: &Path| -> Result<PathBuf, TransformError> {
        Ok(if p.is_absolute() {
            p.to_path_buf()
        } else {
            cwd()?.join(p)
        })
    };
    let guard = Guard::std();
    let invalid = |e: PathError| {
        TransformError::Invalid(format!(
            "{} is not usable against the vault at {}: {e}",
            path.display(),
            vault_dir.display()
        ))
    };
    let root = guard.real_path(&absolute(vault_dir)?).map_err(invalid)?;
    let abs = guard.real_path(&absolute(path)?).map_err(invalid)?;
    lexical::to_relative(&root, &abs).map_err(invalid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reduces_an_absolute_path_to_a_vault_relative_one() {
        let vault = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(vault.path().join("Notes")).unwrap();
        std::fs::write(vault.path().join("Notes/a.md"), "x").unwrap();

        assert_eq!(
            to_vault_relative(vault.path(), &vault.path().join("Notes/a.md")).unwrap(),
            "Notes/a.md"
        );
    }

    #[test]
    fn a_destination_that_does_not_exist_yet_still_reduces() {
        let vault = tempfile::tempdir().unwrap();
        assert_eq!(
            to_vault_relative(vault.path(), &vault.path().join("Notes/new.md")).unwrap(),
            "Notes/new.md"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_dangling_symlink_reduces_to_where_its_target_lands() {
        let vault = tempfile::tempdir().unwrap();
        let elsewhere = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink("new.md", vault.path().join("x.md")).unwrap();
        std::os::unix::fs::symlink(elsewhere.path().join("a.md"), vault.path().join("out.md"))
            .unwrap();

        assert_eq!(
            to_vault_relative(vault.path(), &vault.path().join("x.md")).unwrap(),
            "new.md"
        );
        let err = to_vault_relative(vault.path(), &vault.path().join("out.md")).unwrap_err();
        assert!(matches!(err, TransformError::Invalid(_)), "{err:?}");
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_loop_is_left_as_written() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = std::fs::canonicalize(tmp.path()).unwrap();
        std::os::unix::fs::symlink("b", vault.join("a")).unwrap();
        std::os::unix::fs::symlink("a", vault.join("b")).unwrap();

        assert_eq!(
            to_vault_relative(&vault, &vault.join("a/x.md")).unwrap(),
            "a/x.md"
        );
    }

    #[test]
    fn a_path_outside_the_vault_is_invalid() {
        let vault = tempfile::tempdir().unwrap();
        let elsewhere = tempfile::tempdir().unwrap();
        let err = to_vault_relative(vault.path(), &elsewhere.path().join("a.md")).unwrap_err();
        assert!(matches!(err, TransformError::Invalid(_)), "{err:?}");
    }
}

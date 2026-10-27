//! Cloning and refreshing a checkout of somebody else's repository.
//!
//! The read-only mirror of [`crate::worktree`]. A worktree is a second
//! working directory over a repository you already have; a clone is the
//! first working directory over one you do not. Both end at "a directory on
//! disk holding a tree at a known commit", which is what a caller reading
//! files out of a repository actually wants.
//!
//! # One entry point, and why it is not just `git clone`
//!
//! [`checkout`] is idempotent over a cache directory: it clones when the
//! directory is empty and fetches when it already holds the repository, so a
//! caller re-reading the same source on a second run pays a fetch rather
//! than a re-clone. A caller that wants the two halves separately has
//! [`clone`] and [`refresh`].
//!
//! The ref may be a branch, a tag, or a commit sha, and the caller does not
//! have to say which — `git clone --branch` accepts the first two and
//! refuses the third, so [`clone`] falls back to a full clone plus a
//! checkout when the shallow attempt is refused. That fallback is the reason
//! this is a function rather than an argv the caller assembles.
//!
//! A URL or reference that begins with `-` is refused before git runs, so
//! it cannot be read as an option.
//!
//! ```
//! use typed_git::{clone, git};
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let dir = tempfile::tempdir()?;
//! let origin = dir.path().join("origin");
//! std::fs::create_dir(&origin)?;
//! git().dir(&origin).args(&["init", "--quiet"]).run()?;
//! git()
//!     .dir(&origin)
//!     .args(&["-c", "user.name=Ex", "-c", "user.email=ex@example.com"])
//!     .args(&["commit", "--quiet", "--allow-empty", "-m", "first"])
//!     .run()?;
//!
//! // A local path works as a URL. `None` takes the remote's default branch.
//! let url = origin.to_str().unwrap();
//! let cache = dir.path().join("cache");
//! let first = clone::checkout(url, &cache, None)?;
//! assert!(first.cloned);
//!
//! // The second call fetches into the existing checkout.
//! let second = clone::checkout(url, &cache, None)?;
//! assert!(!second.cloned);
//! assert_eq!(first.sha, second.sha);
//! # Ok(())
//! # }
//! ```

use std::path::Path;

use crate::{GitError, git};

/// A checkout, as [`checkout`] left it.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Checkout {
    /// The commit `HEAD` resolves to — the full 40-character sha.
    pub sha: String,
    /// Whether this call created the checkout rather than refreshing one.
    pub cloned: bool,
}

/// Clone `url` into `dest`, at `reference` when one is named.
///
/// `dest` must not exist, or must be empty — git's own rule, reported as
/// git's own error.
///
/// A named reference is tried as a shallow clone first (`--depth 1
/// --branch`), which covers a branch or a tag in one round trip. A commit
/// sha is refused by `--branch`, so the fallback is a full clone followed by
/// a checkout: correct for every spelling, and slower only for the spelling
/// that has no faster answer.
pub fn clone(url: &str, dest: &Path, reference: Option<&str>) -> Result<(), GitError> {
    refuse_option("clone", url)?;
    if let Some(reference) = reference {
        refuse_option("clone", reference)?;
    }
    let dest = dest.to_string_lossy().into_owned();

    if let Some(reference) = reference {
        let mut shallow = git();
        shallow
            .args(&["clone", "--depth", "1", "--branch"])
            .arg(reference)
            .arg("--")
            .arg(url)
            .arg(&dest);
        match shallow.run() {
            Ok(_) => return Ok(()),
            // Not fatal on its own: `--branch` refuses a commit sha, and the
            // full clone below reaches one. A genuinely bad URL fails again
            // there, carrying git's own diagnosis rather than this one.
            Err(GitError::Command { .. }) => {}
            Err(e) => return Err(e),
        }
    }

    let mut full = git();
    full.args(&["clone", "--"]).arg(url).arg(&dest);
    full.run()?;

    if let Some(reference) = reference {
        let mut checkout = git();
        checkout.dir(&dest).args(&["checkout"]).arg(reference);
        checkout.run()?;
    }
    Ok(())
}

/// Fetch `reference` into an existing checkout and put the work tree on it,
/// discarding whatever was there.
///
/// A hard reset rather than a merge: this is a cache over somebody else's
/// repository, nothing local is worth keeping, and a merge could leave the
/// tree in a conflicted state a reader would then read.
pub fn refresh(repo: &Path, reference: Option<&str>) -> Result<(), GitError> {
    let reference = reference.unwrap_or("HEAD");
    refuse_option("fetch", reference)?;

    let mut fetch = git();
    fetch
        .dir(repo)
        .args(&["fetch", "--depth", "1", "origin", "--end-of-options"])
        .arg(reference);
    // A shallow fetch of a sha is refused by servers that do not allow it, so
    // an unshallowing fetch is the fallback — the same two-step shape
    // `clone` uses, for the same reason.
    if fetch.run().is_err() {
        let mut deep = git();
        deep.dir(repo)
            .args(&["fetch", "origin", "--end-of-options"])
            .arg(reference);
        deep.run()?;
    }

    let mut reset = git();
    reset.dir(repo).args(&["checkout", "--force", "FETCH_HEAD"]);
    reset.run()?;
    Ok(())
}

/// `url` at `reference`, in `dest` — cloned when `dest` holds nothing,
/// refreshed when it already holds the repository.
///
/// The verb a cache wants: calling it twice with the same arguments leaves
/// the same tree, and the second call does not re-download what the first
/// one already has.
pub fn checkout(url: &str, dest: &Path, reference: Option<&str>) -> Result<Checkout, GitError> {
    let existing = dest.join(".git").exists();
    if existing {
        refresh(dest, reference)?;
    } else {
        clone(url, dest, reference)?;
    }
    Ok(Checkout {
        sha: crate::query::head_sha(dest)?,
        cloned: !existing,
    })
}

/// Refuses a URL or reference that git would read as an option.
fn refuse_option(command: &str, value: &str) -> Result<(), GitError> {
    if value.starts_with('-') {
        return Err(GitError::Command {
            command: command.to_string(),
            stderr: format!("refusing a value that begins with '-': {value}"),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A repository on disk with one commit on `main` and a `v1` tag, plus
    /// its `file:` URL. No network: everything here is local paths.
    fn origin(dir: &Path) -> String {
        let repo = dir.join("origin");
        std::fs::create_dir_all(repo.join("docs")).unwrap();
        std::fs::write(repo.join("docs/notes.md"), "hello\n").unwrap();

        let run = |args: &[&str]| {
            let mut cmd = git();
            cmd.dir(&repo)
                .args(args)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("GIT_CONFIG_GLOBAL", NULL_DEVICE)
                .env("GIT_AUTHOR_NAME", "T")
                .env("GIT_AUTHOR_EMAIL", "t@t")
                .env("GIT_COMMITTER_NAME", "T")
                .env("GIT_COMMITTER_EMAIL", "t@t");
            cmd.run().unwrap()
        };
        run(&["init", "--initial-branch", "main"]);
        run(&["add", "-A"]);
        run(&["commit", "-m", "one"]);
        run(&["tag", "v1"]);

        file_url(&repo)
    }

    const NULL_DEVICE: &str = if cfg!(windows) { "NUL" } else { "/dev/null" };

    /// A `file:` URL, so a shallow clone is really shallow. A Windows path
    /// becomes `file:///C:/...`.
    fn file_url(path: &Path) -> String {
        let path = path.to_string_lossy().replace('\\', "/");
        if path.starts_with('/') {
            format!("file://{path}")
        } else {
            format!("file:///{path}")
        }
    }

    #[test]
    fn a_tag_clones_shallow_and_a_sha_falls_back_to_a_full_clone() {
        let tmp = tempfile::tempdir().unwrap();
        let url = origin(tmp.path());

        let tagged = tmp.path().join("tagged");
        clone(&url, &tagged, Some("v1")).unwrap();
        assert!(tagged.join("docs/notes.md").exists());

        // The sha `--branch` cannot take. It must still land, through the
        // full-clone fallback.
        let sha = crate::query::head_sha(&tagged).unwrap();
        let pinned = tmp.path().join("pinned");
        clone(&url, &pinned, Some(&sha)).unwrap();
        assert_eq!(crate::query::head_sha(&pinned).unwrap(), sha);
    }

    #[test]
    fn a_second_checkout_refreshes_rather_than_recloning() {
        let tmp = tempfile::tempdir().unwrap();
        let url = origin(tmp.path());
        let dest = tmp.path().join("cache");

        let first = checkout(&url, &dest, Some("main")).unwrap();
        assert!(first.cloned);

        let second = checkout(&url, &dest, Some("main")).unwrap();
        assert!(!second.cloned, "the second call must not re-clone");
        assert_eq!(first.sha, second.sha);
    }

    #[test]
    fn a_url_that_is_not_a_repository_reports_gits_own_failure() {
        let tmp = tempfile::tempdir().unwrap();
        let dest = tmp.path().join("nope");
        let err = clone(&file_url(&tmp.path().join("absent")), &dest, Some("main")).unwrap_err();
        assert!(matches!(err, GitError::Command { .. }), "{err:?}");
    }

    #[test]
    fn a_url_or_reference_that_begins_with_a_dash_is_refused() {
        let tmp = tempfile::tempdir().unwrap();
        let dest = tmp.path().join("dest");
        let err = clone("--upload-pack=touch x", &dest, None).unwrap_err();
        assert!(matches!(err, GitError::Command { .. }), "{err:?}");
        let url = origin(tmp.path());
        let err = clone(&url, &dest, Some("-b")).unwrap_err();
        assert!(matches!(err, GitError::Command { .. }), "{err:?}");
        assert!(!dest.exists());
    }
}

//! Find the installed git and its version.
//!
//! ```
//! if typed_git::info::available() {
//!     let info = typed_git::info::get()?;
//!     println!("git {} at {}", info.version.number, info.path.display());
//! }
//! # Ok::<(), typed_git::GitError>(())
//! ```

use std::path::PathBuf;

use crate::{GitError, git};

/// True when a `git` binary is on `PATH`.
pub fn available() -> bool {
    which::which("git").is_ok()
}

/// The path of the `git` binary on `PATH`, or [`GitError::NotAvailable`].
pub fn path() -> Result<PathBuf, GitError> {
    which::which("git").map_err(|_| GitError::NotAvailable)
}

/// The installed git: where it is and which version it reports.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct GitInfo {
    /// The path of the `git` binary.
    pub path: PathBuf,
    /// What `git --version` reports.
    pub version: Version,
}

/// A parsed `git --version`.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Version {
    /// The version number, such as `2.50.1`.
    pub number: String,
    /// The text after the number, such as `(Apple Git-155)`, or `unknown`
    /// when there is none.
    pub platform: String,
}

/// The path and version of the installed git.
///
/// Returns [`GitError::NotAvailable`] when no `git` is on `PATH` or it
/// cannot be run.
pub fn get() -> Result<GitInfo, GitError> {
    let path = path()?;
    let version = match git().arg("--version").run() {
        Ok(output) => parse_version(&output),
        Err(GitError::Exec(_)) => return Err(GitError::NotAvailable),
        Err(e) => return Err(e),
    };
    Ok(GitInfo { path, version })
}

/// Parses `git version 2.50.1 (Apple Git-155)` or `git version 2.50.1`.
/// Text in another shape is kept whole as the number.
fn parse_version(output: &str) -> Version {
    let raw = output.trim();
    let raw = raw.strip_prefix("git version ").unwrap_or(raw);
    let (number, platform) = raw.split_once(' ').unwrap_or((raw, "unknown"));
    Version {
        number: number.to_string(),
        platform: platform.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_reports_the_installed_git() {
        assert!(available());
        let info = get().unwrap();
        assert_eq!(info.path, path().unwrap());
        assert!(!info.version.number.is_empty());
    }

    #[test]
    fn parse_version_handles_standard_output() {
        let v = parse_version("git version 2.50.1 (Apple Git-155)");
        assert_eq!(v.number, "2.50.1");
        assert_eq!(v.platform, "(Apple Git-155)");
    }

    #[test]
    fn parse_version_handles_no_platform() {
        let v = parse_version("git version 2.50.1\n");
        assert_eq!(v.number, "2.50.1");
        assert_eq!(v.platform, "unknown");
    }

    #[test]
    fn parse_version_does_not_panic_on_unexpected_output() {
        // A `git` wrapper on PATH may answer --version with other text.
        let v = parse_version("not-git-output");
        assert_eq!(v.number, "not-git-output");
        assert_eq!(v.platform, "unknown");
    }
}

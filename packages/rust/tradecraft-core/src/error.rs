//! The crate's error type.
//!
//! Deliberately small and host-neutral: each host maps it into its own
//! `AppError` at the `api/v1` adapter seam, so this crate never learns that
//! Tauri or Axum exist. The `Display` strings surface in the UI, so the test
//! at the bottom pins them verbatim — the same discipline
//! other error types in this family use.

use std::path::{Path, PathBuf};

/// Something went wrong locating or reading a skill corpus.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    /// A registered root does not exist, or is not a directory. Recoverable —
    /// the UI shows the root as unavailable rather than failing the whole scan.
    #[error("corpus root not found: {0}")]
    RootNotFound(PathBuf),

    /// A path escaped its corpus root. Always a bug or an attack; never shown
    /// as a routine condition.
    #[error("path escapes its corpus root: {0}")]
    PathEscapesRoot(PathBuf),

    /// The referenced skill is not present under any known root.
    #[error("skill not found: {0}")]
    SkillNotFound(String),

    /// Filesystem failure reading a corpus. Carries the path, because a bare
    /// `io::Error` ("permission denied") is unactionable in a UI.
    #[error("reading {path}: {source}")]
    Io {
        /// The path that could not be read.
        path: PathBuf,
        #[source]
        /// The underlying I/O error.
        source: std::io::Error,
    },

    /// A safety rail said no: publishing into a protected source tree, a
    /// coverage probe finding pre-existing content, or any other guard
    /// decision. Always the rail working, never a bug.
    #[error("refused: {0}")]
    Refused(String),

    /// Two authorities disagree about the same content — a diverged draft on
    /// reimport, a user-modified obsolete file at a destination. Needs an
    /// explicit human decision; nothing here picks a winner silently.
    #[error("conflict: {0}")]
    Conflict(String),

    /// Rendering a skill for a runtime target failed.
    #[error("projection: {0}")]
    Projection(String),

    /// The marketplace commit failed part-way through its root swaps. The
    /// message says what failed and what the rollback restored — the
    /// destination is back to its pre-build state unless the message says
    /// otherwise. Its own variant because no other fits: it is not a rail
    /// refusing and not a plain read failure, and a host has to be able to
    /// tell "nothing happened" from "something happened and was undone".
    #[error("swap failed: {0}")]
    SwapFailed(String),
}

impl CoreError {
    /// Attach a path to an [`std::io::Error`]. Threading the path through
    /// every `?` is the whole reason this helper exists.
    pub fn io(path: impl AsRef<Path>, source: std::io::Error) -> Self {
        Self::Io {
            path: path.as_ref().to_path_buf(),
            source,
        }
    }

    /// A *content* problem in a file we read: frontmatter that will not parse,
    /// a value the wrong shape, bytes that are not UTF-8.
    ///
    /// [`CoreError::Io`] rather than a variant of its own, because it is the
    /// one variant that already carries a path and its `Display` — `reading
    /// <path>: <what>` — is exactly the sentence a user needs. A caller
    /// holding a path it believed was a skill has to be told *which* one was
    /// not.
    pub fn malformed(path: impl AsRef<Path>, message: impl Into<String>) -> Self {
        Self::io(
            path,
            std::io::Error::new(std::io::ErrorKind::InvalidData, message.into()),
        )
    }

    /// A refusal prefixed with one of the publish spec's
    /// closed-set reason tokens — `unknown-kind`, `mixed-frontmatter-shape`,
    /// and the rest.
    ///
    /// The token leads the message so a report, a test, or a later UI can find
    /// it without a second field on the variant; the prose after it names the
    /// path and the fix. Every refusal in this crate goes through here, so a
    /// report never has to render one as bare prose.
    pub fn refused(token: &str, message: impl Into<String>) -> Self {
        Self::Refused(format!("{token}: {}", message.into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_strings_are_stable() {
        // These reach the UI verbatim. Changing one is a user-visible change.
        assert_eq!(
            CoreError::RootNotFound(PathBuf::from("/nope")).to_string(),
            "corpus root not found: /nope"
        );
        assert_eq!(
            CoreError::SkillNotFound("abc".into()).to_string(),
            "skill not found: abc"
        );
        assert_eq!(
            CoreError::PathEscapesRoot(PathBuf::from("/etc/passwd")).to_string(),
            "path escapes its corpus root: /etc/passwd"
        );
    }

    #[test]
    fn a_refusal_leads_with_its_reason_token() {
        // The token is how a report, a test, or a UI identifies the refusal;
        // everything after it is prose for a human.
        assert_eq!(
            CoreError::refused("mixed-frontmatter-shape", "/vault/a.md: keep one shape")
                .to_string(),
            "refused: mixed-frontmatter-shape: /vault/a.md: keep one shape"
        );
    }

    #[test]
    fn malformed_reads_as_a_read_failure_against_the_path() {
        assert_eq!(
            CoreError::malformed("/vault/a.md", "`sw-kind` must be a string, not a list")
                .to_string(),
            "reading /vault/a.md: `sw-kind` must be a string, not a list"
        );
    }

    #[test]
    fn io_helper_keeps_the_path_in_the_message() {
        let err = CoreError::io(
            "/tmp/SKILL.md",
            std::io::Error::new(std::io::ErrorKind::PermissionDenied, "permission denied"),
        );
        assert_eq!(err.to_string(), "reading /tmp/SKILL.md: permission denied");
    }
}

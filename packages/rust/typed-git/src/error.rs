//! The error every function in the crate returns.

/// Why a git call failed.
///
/// The enum is `#[non_exhaustive]`, so a `match` on it needs a `_` arm.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum GitError {
    /// No `git` binary was found.
    #[error("Git not available")]
    NotAvailable,

    /// The `git` process could not be started or waited on.
    #[error("failed to execute git: {0}")]
    Exec(#[from] std::io::Error),

    /// git ran and exited non-zero, or the crate refused the call before
    /// running git (for example, a commit with no paths).
    #[error("git {command} failed: {stderr}")]
    Command {
        /// The command line, such as `git log --oneline`.
        command: String,
        /// git's stderr, trimmed, or the reason the call was refused.
        stderr: String,
    },
}

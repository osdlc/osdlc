//! This crate's error type.
//!
//! The planner sits below any application and must not name one, so it
//! returns its own [`TransformError`]. An application converts it with a
//! `From<TransformError>` impl on its own error type, which keeps its call
//! sites a plain `?`.

/// Everything a plan or an apply can fail with.
#[derive(Debug, thiserror::Error)]
pub enum TransformError {
    /// A path was not vault-relative, escaped the vault, or was not UTF-8.
    #[error(transparent)]
    Path(#[from] markdown_vault_fs::PathError),

    /// A filesystem operation failed.
    #[error("io error: {0}")]
    Io(String),

    /// Bad input the path guard does not cover.
    #[error("invalid request: {0}")]
    Invalid(String),
}

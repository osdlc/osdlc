//! Unified error type for `agent-adapt`.
//!
//! Every fallible operation in the crate — capability rendering, the
//! naming layer, the filesystem install layer, the TOML/JSON
//! (de)serializers used by [`crate::mcp::render`] — funnels its failure
//! into this single enum. Callers match once at the boundary.

use std::io;

use thiserror::Error as ThisError;

/// All errors the crate can produce.
#[derive(Debug, ThisError)]
#[non_exhaustive]
pub enum Error {
    /// Filesystem I/O failed. Primarily produced by the helpers in
    /// [`crate::install`]; kept at the top level so the [`crate::Result`]
    /// alias is usable from any layer.
    #[error("io error: {0}")]
    Io(#[from] io::Error),

    /// A JSON (de)serialize failed.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    /// TOML parsing failed.
    #[error("toml deserialize error: {0}")]
    TomlDe(#[from] toml::de::Error),

    /// TOML serialization failed.
    #[error("toml serialize error: {0}")]
    TomlSer(#[from] toml::ser::Error),

    /// A capability implementation could not render the requested entity.
    #[error("render error: {0}")]
    Render(String),

    /// Plugin validation found problems that prevent export.
    #[error("validation error: {0}")]
    Validation(String),

    /// A structural invariant was violated while reading or merging a
    /// config file — e.g. "root is not an object". The static string
    /// points at the specific invariant so tests can match on it.
    #[error("invalid config format: {0}")]
    InvalidFormat(&'static str),

    /// A non-JSON/TOML serialization step failed.
    #[error("serialization error: {0}")]
    Serialization(String),

    /// A caller-supplied relative path was refused because joining it onto
    /// its destination directory would not land inside that directory.
    ///
    /// Raised by [`crate::paths::join_within`] — see that module for the
    /// containment rule. The path is carried verbatim, unnormalised, so the
    /// message names exactly what the caller supplied.
    #[error("refused unsafe path {path:?}: {reason}")]
    UnsafePath {
        /// The offending path, exactly as supplied.
        path: String,
        /// Why it was refused, from the closed set the containment check
        /// defines.
        reason: &'static str,
    },
}

impl Error {
    /// Convenience constructor for a render failure with a formatted message.
    pub fn render(msg: impl Into<String>) -> Self {
        Error::Render(msg.into())
    }

    /// Convenience constructor for a validation failure with a formatted message.
    pub fn validation(msg: impl Into<String>) -> Self {
        Error::Validation(msg.into())
    }

    /// Convenience constructor for a path refusal.
    pub fn unsafe_path(path: impl Into<String>, reason: &'static str) -> Self {
        Error::UnsafePath {
            path: path.into(),
            reason,
        }
    }
}

//! The one error a [`crate::Vfs`] returns.

use std::io;
use std::path::{Path, PathBuf};

/// A file operation that failed, with the path it failed on.
///
/// One shape for every implementation, so a caller matches on
/// [`VfsError::kind`] the same way whether the host is a disk, a tree in
/// memory or a JavaScript bridge. A host that has no `io::Error` of its own
/// builds one from an [`io::ErrorKind`] with [`VfsError::new`].
#[derive(Debug, thiserror::Error)]
#[error("{}: {source}", path.display())]
pub struct VfsError {
    path: PathBuf,
    #[source]
    source: io::Error,
}

impl VfsError {
    /// Wraps an `io::Error` with the path it happened on.
    pub fn io(path: impl AsRef<Path>, source: io::Error) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
            source,
        }
    }

    /// An error of `kind` on `path`, with a message for people.
    pub fn new(path: impl AsRef<Path>, kind: io::ErrorKind, message: impl Into<String>) -> Self {
        Self::io(path, io::Error::new(kind, message.into()))
    }

    /// The path the operation was on.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// What went wrong, as `std::io` names it. `NotFound` is the one most
    /// callers branch on.
    pub fn kind(&self) -> io::ErrorKind {
        self.source.kind()
    }

    /// Whether the path was not there.
    pub fn is_not_found(&self) -> bool {
        self.kind() == io::ErrorKind::NotFound
    }

    /// The underlying `io::Error`.
    pub fn io_error(&self) -> &io::Error {
        &self.source
    }
}

/// `Result` with a [`VfsError`].
pub type Result<T, E = VfsError> = std::result::Result<T, E>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_message_names_the_path_and_the_cause() {
        let e = VfsError::new("/v/a.md", io::ErrorKind::NotFound, "no such file");
        assert_eq!(e.to_string(), "/v/a.md: no such file");
        assert!(e.is_not_found());
        assert_eq!(e.path(), Path::new("/v/a.md"));
    }
}

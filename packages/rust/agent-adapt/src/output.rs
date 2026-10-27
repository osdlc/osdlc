//! The virtual filesystem produced by capability renderers.
//!
//! Capability methods return [`ExportedFile`] values rather than writing
//! to disk. Callers (or the helpers in [`crate::install`]) decide whether
//! to materialize them, bundle them, or inspect them in memory.
//!
//! [`ExportedFile::content`] is `Vec<u8>` so binary assets work; the
//! [`ExportedFile::text`] accessor handles the common UTF-8 case.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::Error;

/// Classifies an [`ExportedFile`] by its role in an export.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportedFileType {
    /// A rendered skill (typically `SKILL.md`).
    Skill,
    /// A rendered role body.
    Role,
    /// A rendered agent persona file.
    Agent,
    /// A rendered slash command file.
    Command,
    /// A hooks configuration file (e.g. `hooks.json`).
    Hook,
    /// An executable script.
    Script,
    /// A skill's peer file, rendered beside its `SKILL.md`.
    Resource,
    /// A runtime configuration file (e.g. `.mcp.json`).
    Config,
    /// A plugin manifest (e.g. `MANIFEST.md`).
    Manifest,
    /// A README or other documentation.
    Readme,
    /// Any other file type.
    Other,
}

/// One file in a virtual tree — relative path, raw bytes, and a type tag.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportedFile {
    /// Relative path within the export tree.
    pub path: PathBuf,
    /// Raw bytes. Use [`ExportedFile::text`] to decode as UTF-8.
    pub content: Vec<u8>,
    /// Classification of what this file represents.
    pub kind: ExportedFileType,
    /// Whether install layers should set the executable bit when
    /// materializing this file.
    #[serde(default)]
    pub executable: bool,
}

impl ExportedFile {
    /// Construct from a UTF-8 string body. Not executable.
    pub fn text_file(
        path: impl Into<PathBuf>,
        text: impl Into<String>,
        kind: ExportedFileType,
    ) -> Self {
        Self {
            path: path.into(),
            content: text.into().into_bytes(),
            kind,
            executable: false,
        }
    }

    /// Interpret the content as UTF-8. Returns [`Error::Render`] on failure.
    pub fn text(&self) -> Result<&str, Error> {
        std::str::from_utf8(&self.content)
            .map_err(|e| Error::render(format!("exported file {:?} is not utf-8: {e}", self.path)))
    }
}

/// Ordered collection of [`ExportedFile`]s produced by a render function.
///
/// Insertion order is preserved so snapshot tests are deterministic.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ExportedTree {
    files: Vec<ExportedFile>,
}

impl ExportedTree {
    /// Create an empty tree.
    pub fn new() -> Self {
        Self::default()
    }

    /// Append a single file.
    pub fn push(&mut self, file: ExportedFile) {
        self.files.push(file);
    }

    /// Append multiple files.
    pub fn extend(&mut self, files: impl IntoIterator<Item = ExportedFile>) {
        self.files.extend(files);
    }

    /// Borrow the files as a slice.
    pub fn as_slice(&self) -> &[ExportedFile] {
        &self.files
    }

    /// Consume the tree and return its files.
    pub fn into_files(self) -> Vec<ExportedFile> {
        self.files
    }

    /// Number of files.
    pub fn len(&self) -> usize {
        self.files.len()
    }

    /// Whether the tree is empty.
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    /// Iterate over the files.
    pub fn iter(&self) -> std::slice::Iter<'_, ExportedFile> {
        self.files.iter()
    }
}

impl IntoIterator for ExportedTree {
    type Item = ExportedFile;
    type IntoIter = std::vec::IntoIter<ExportedFile>;

    fn into_iter(self) -> Self::IntoIter {
        self.files.into_iter()
    }
}

impl<'a> IntoIterator for &'a ExportedTree {
    type Item = &'a ExportedFile;
    type IntoIter = std::slice::Iter<'a, ExportedFile>;

    fn into_iter(self) -> Self::IntoIter {
        self.files.iter()
    }
}

impl FromIterator<ExportedFile> for ExportedTree {
    fn from_iter<I: IntoIterator<Item = ExportedFile>>(iter: I) -> Self {
        Self {
            files: iter.into_iter().collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_file_roundtrips() {
        let f = ExportedFile::text_file("skills/x.md", "hello", ExportedFileType::Skill);
        assert_eq!(f.text().unwrap(), "hello");
        assert_eq!(f.kind, ExportedFileType::Skill);
    }

    #[test]
    fn text_errors_on_invalid_utf8() {
        let f = ExportedFile {
            path: "bad.bin".into(),
            content: vec![0xff, 0xfe, 0xfd],
            kind: ExportedFileType::Other,
            executable: false,
        };
        assert!(f.text().is_err());
    }

    #[test]
    fn tree_preserves_insertion_order() {
        let mut t = ExportedTree::new();
        t.push(ExportedFile::text_file("a", "1", ExportedFileType::Skill));
        t.push(ExportedFile::text_file("b", "2", ExportedFileType::Skill));
        t.push(ExportedFile::text_file("c", "3", ExportedFileType::Skill));
        let paths: Vec<_> = t.iter().map(|f| f.path.to_str().unwrap()).collect();
        assert_eq!(paths, vec!["a", "b", "c"]);
    }

    #[test]
    fn tree_extend_works() {
        let mut t = ExportedTree::new();
        t.extend([
            ExportedFile::text_file("a", "1", ExportedFileType::Skill),
            ExportedFile::text_file("b", "2", ExportedFileType::Skill),
        ]);
        assert_eq!(t.len(), 2);
    }

    #[test]
    fn tree_from_iter() {
        let t: ExportedTree = vec![
            ExportedFile::text_file("a", "1", ExportedFileType::Skill),
            ExportedFile::text_file("b", "2", ExportedFileType::Skill),
        ]
        .into_iter()
        .collect();
        assert_eq!(t.len(), 2);
    }
}

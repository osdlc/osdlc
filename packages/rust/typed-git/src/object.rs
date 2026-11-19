//! Many objects at once, byte-exact: `git cat-file --batch`.
//!
//! [`cat_file_batch`] reads a list of names (`rev:path`, a sha) in a few
//! processes, not one `git show` per name. It runs `--batch-check` first for
//! the sizes, so a blob over [`max_bytes`](CatFileBatchOptions::max_bytes) is
//! reported without being read, then `--batch` for the rest, in groups of
//! about [`chunk_bytes`](CatFileBatchOptions::chunk_bytes).
//!
//! ```
//! use std::fs;
//! use typed_git::object::{self, CatFileBatchOptions, CatFileEntry};
//! use typed_git::{commit, git};
//!
//! # fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let dir = tempfile::tempdir()?;
//! let repo = dir.path();
//! git().dir(repo).args(&["init", "--quiet"]).run()?;
//! git().dir(repo).args(&["config", "user.name", "Ex"]).run()?;
//! git().dir(repo).args(&["config", "user.email", "ex@example.com"]).run()?;
//! fs::write(repo.join("a.md"), "a\n")?;
//! let paths = vec!["a.md".to_string()];
//! commit::add_intent(repo, &paths)?;
//! commit::commit_only(repo, &paths, "Add a", None)?;
//!
//! let got = object::cat_file_batch(repo, &["HEAD:a.md", "HEAD:nope"], &CatFileBatchOptions::new())?;
//! assert!(matches!(&got[0].1, CatFileEntry::Text { bytes, .. } if bytes == b"a\n"));
//! assert_eq!(got[1].1, CatFileEntry::Missing);
//! # Ok(())
//! # }
//! ```

use std::collections::HashSet;
use std::path::Path;

use crate::{GitError, git};

/// What one name resolved to. `bytes` are git's, never decoded.
///
/// The enum is `#[non_exhaustive]`, so a `match` on it needs a `_` arm.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum CatFileEntry {
    /// A blob with no NUL in its first 8000 bytes (git's own text test).
    Text {
        /// The object's sha.
        sha: String,
        /// Its size in bytes.
        size: u64,
        /// Its content.
        bytes: Vec<u8>,
    },
    /// A blob with a NUL in its first 8000 bytes.
    Binary {
        /// The object's sha.
        sha: String,
        /// Its size in bytes.
        size: u64,
        /// Its content.
        bytes: Vec<u8>,
    },
    /// A blob larger than `max_bytes`. Its content was not read.
    TooLarge {
        /// The object's sha.
        sha: String,
        /// Its size in bytes.
        size: u64,
    },
    /// A tree, commit or tag, such as `rev:dir`. Its content was not read.
    NotBlob {
        /// The object's type, such as `tree`.
        object_type: String,
        /// The object's sha.
        sha: String,
        /// Its size in bytes.
        size: u64,
    },
    /// No such object, or a short sha that names more than one.
    Missing,
}

/// Options for [`cat_file_batch`] and [`cat_file_batch_chunks`].
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct CatFileBatchOptions {
    max_bytes: Option<u64>,
    chunk_bytes: u64,
}

impl Default for CatFileBatchOptions {
    fn default() -> Self {
        Self {
            max_bytes: None,
            chunk_bytes: 64 * 1024 * 1024,
        }
    }
}

impl CatFileBatchOptions {
    /// No size cap, and groups of about 64 MiB.
    pub fn new() -> Self {
        Self::default()
    }

    /// A blob larger than `bytes` comes back as
    /// [`TooLarge`](CatFileEntry::TooLarge), and its content is not read.
    pub fn max_bytes(mut self, bytes: u64) -> Self {
        self.max_bytes = Some(bytes);
        self
    }

    /// The most blob bytes one git process is asked for (0 is read as 1). A
    /// blob larger than this still gets a process of its own, so set
    /// [`max_bytes`](Self::max_bytes) to bound it.
    pub fn chunk_bytes(mut self, bytes: u64) -> Self {
        self.chunk_bytes = bytes.max(1);
        self
    }
}

/// An entry's name and what it resolved to.
pub type NamedEntry = (String, CatFileEntry);

/// Git's binary test: a NUL in the first 8000 bytes.
const BINARY_WINDOW: usize = 8000;
/// Names per `--batch-check` run: its output is a short line per name.
const CHECK_NAMES: usize = 10_000;

struct Found {
    name: String,
    sha: String,
    size: u64,
}

fn refuse(reason: String) -> GitError {
    GitError::Command {
        command: "git cat-file --batch".to_string(),
        stderr: reason,
    }
}

fn unique_names(names: &[&str]) -> Result<Vec<String>, GitError> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for name in names {
        if name.is_empty() || name.contains(['\n', '\0']) || name.ends_with('\r') {
            return Err(refuse(format!(
                "a name must be non-empty with no newline, NUL or trailing CR (got {name:?})"
            )));
        }
        if seen.insert(*name) {
            out.push(name.to_string());
        }
    }
    Ok(out)
}

fn input_of(names: impl Iterator<Item = impl AsRef<str>>) -> Vec<u8> {
    let mut input = String::new();
    for name in names {
        input.push_str(name.as_ref());
        input.push('\n');
    }
    input.into_bytes()
}

/// Reads the objects of `names` byte for byte, in a few git processes. The
/// result is in the order of `names`, with a repeated name once.
///
/// A name that is empty, or holds a newline, a NUL or a trailing CR, is refused with a
/// [`GitError::Command`] before git runs, as is a git failure.
pub fn cat_file_batch(
    repo: &Path,
    names: &[&str],
    opts: &CatFileBatchOptions,
) -> Result<Vec<NamedEntry>, GitError> {
    let mut all = Vec::new();
    cat_file_batch_chunks(repo, names, opts, |chunk| all.extend(chunk))?;
    let order: std::collections::HashMap<&str, usize> = names
        .iter()
        .enumerate()
        .rev()
        .map(|(i, n)| (*n, i))
        .collect();
    all.sort_by_key(|(name, _)| order[name.as_str()]);
    Ok(all)
}

/// [`cat_file_batch`] one group of blobs at a time: `sink` gets each group as
/// it is read, so a caller can use the bytes and drop them before the next
/// read. The first group also holds every entry that needed no content read.
pub fn cat_file_batch_chunks(
    repo: &Path,
    names: &[&str],
    opts: &CatFileBatchOptions,
    mut sink: impl FnMut(Vec<NamedEntry>),
) -> Result<(), GitError> {
    let unique = unique_names(names)?;
    let mut settled: Vec<NamedEntry> = Vec::new();
    let mut wanted: Vec<Found> = Vec::new();
    for part in unique.chunks(CHECK_NAMES) {
        let stdout = git()
            .dir(repo)
            .args(&["cat-file", "--batch-check"])
            .stdin(input_of(part.iter()))
            .run_bytes()?;
        let text = String::from_utf8_lossy(&stdout);
        let lines: Vec<&str> = text.lines().collect();
        if lines.len() != part.len() {
            return Err(refuse(format!(
                "git answered {} lines for {} names",
                lines.len(),
                part.len()
            )));
        }
        for (name, line) in part.iter().zip(lines) {
            if line.ends_with(" missing") || line.ends_with(" ambiguous") {
                settled.push((name.clone(), CatFileEntry::Missing));
                continue;
            }
            let mut f = line.split(' ');
            let (Some(sha), Some(kind), Some(size), None) =
                (f.next(), f.next(), f.next(), f.next())
            else {
                return Err(refuse(format!(
                    "cannot read git's answer for {name}: {line}"
                )));
            };
            let size: u64 = size
                .parse()
                .map_err(|_| refuse(format!("cannot read git's answer for {name}: {line}")))?;
            let sha = sha.to_string();
            if kind != "blob" {
                let entry = CatFileEntry::NotBlob {
                    object_type: kind.to_string(),
                    sha,
                    size,
                };
                settled.push((name.clone(), entry));
            } else if opts.max_bytes.is_some_and(|max| size > max) {
                settled.push((name.clone(), CatFileEntry::TooLarge { sha, size }));
            } else {
                wanted.push(Found {
                    name: name.clone(),
                    sha,
                    size,
                });
            }
        }
    }

    let mut groups: Vec<Vec<Found>> = Vec::new();
    let mut bytes_in_group = 0u64;
    for f in wanted {
        match groups.last_mut() {
            Some(g) if bytes_in_group + f.size <= opts.chunk_bytes => {
                bytes_in_group += f.size;
                g.push(f);
            }
            _ => {
                bytes_in_group = f.size;
                groups.push(vec![f]);
            }
        }
    }
    if groups.is_empty() {
        sink(settled);
        return Ok(());
    }
    let mut settled = Some(settled);
    for group in groups {
        // By sha, so a ref that moves after the size check cannot change the
        // object.
        let stdout = git()
            .dir(repo)
            .args(&["cat-file", "--batch"])
            .stdin(input_of(group.iter().map(|f| &f.sha)))
            .run_bytes()?;
        let mut entries = parse_content(&stdout, group)?;
        if let Some(first) = settled.take() {
            entries.extend(first);
        }
        sink(entries);
    }
    Ok(())
}

/// Reads each blob's header and content, in order, from one `--batch` stdout.
fn parse_content(stdout: &[u8], blobs: Vec<Found>) -> Result<Vec<NamedEntry>, GitError> {
    let mut out = Vec::with_capacity(blobs.len());
    let mut at = 0usize;
    for b in blobs {
        let eol = stdout[at..]
            .iter()
            .position(|&c| c == b'\n')
            .map(|i| at + i)
            .ok_or_else(|| refuse(format!("git's output for {} is cut short", b.name)))?;
        let header = String::from_utf8_lossy(&stdout[at..eol]);
        let expected = format!("{} blob {}", b.sha, b.size);
        if header != expected {
            return Err(refuse(format!(
                "{} changed while it was read (expected {expected:?}, got {header:?})",
                b.name
            )));
        }
        let start = eol + 1;
        let end = start + b.size as usize;
        if end >= stdout.len() {
            return Err(refuse(format!("git's output for {} is cut short", b.name)));
        }
        let bytes = stdout[start..end].to_vec();
        let binary = bytes[..bytes.len().min(BINARY_WINDOW)].contains(&0);
        let (sha, size) = (b.sha, b.size);
        let entry = if binary {
            CatFileEntry::Binary { sha, size, bytes }
        } else {
            CatFileEntry::Text { sha, size, bytes }
        };
        out.push((b.name, entry));
        at = end + 1;
    }
    Ok(out)
}

//! The `std::fs` layer over the runner core (the `native` feature, on by default; build
//! with `default-features = false` for wasm32): the directory walker and the
//! run-a-directory convenience, mirroring the TS `walkSync` and `runCorpus`.

use std::borrow::Cow;
use std::io;
use std::path::{Path, PathBuf};

use super::corpus::{CorpusConfig, GlobError, RunOptions, RunOutcome, run_lazy};

/// Directories the walk never enters, as in the TS `walkSync`.
const SKIPPED_DIRS: &[&str] = &[".git", "node_modules"];

/// What a directory run can fail on.
#[derive(Debug, thiserror::Error)]
pub enum NativeRunError {
    /// Listing a directory failed.
    #[error("failed to read directory '{}': {source}", path.display())]
    Walk {
        /// the directory
        path: PathBuf,
        /// the I/O error
        source: io::Error,
    },
    /// Reading a routed file failed.
    #[error("failed to read '{}': {source}", path.display())]
    Read {
        /// the file
        path: PathBuf,
        /// the I/O error
        source: io::Error,
    },
    /// A glob did not compile.
    #[error(transparent)]
    Glob(#[from] GlobError),
}

/// Every file under `root`, as paths relative to `root` with `/` separators. Directory
/// entries are sorted by name (in UTF-16 order, as JS compares strings) before
/// recursion, so the order matches the TS `walkSync`. `.git` and `node_modules` are
/// skipped.
pub fn walk_dir(root: &Path) -> Result<Vec<String>, NativeRunError> {
    fn recur(abs: &Path, rel: &str, out: &mut Vec<String>) -> Result<(), NativeRunError> {
        let walk_err = |source| NativeRunError::Walk {
            path: abs.to_path_buf(),
            source,
        };
        let mut entries = std::fs::read_dir(abs)
            .and_then(|dir| dir.collect::<io::Result<Vec<_>>>())
            .map_err(walk_err)?
            .into_iter()
            .map(|e| (e.file_name().to_string_lossy().into_owned(), e))
            .collect::<Vec<_>>();
        entries.sort_by(|(a, _), (b, _)| a.encode_utf16().cmp(b.encode_utf16()));
        for (name, entry) in entries {
            let child_rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            let file_type = entry.file_type().map_err(walk_err)?;
            if file_type.is_dir() {
                if !SKIPPED_DIRS.contains(&name.as_str()) {
                    recur(&entry.path(), &child_rel, out)?;
                }
            } else if file_type.is_file() {
                out.push(child_rel);
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    recur(root, "", &mut out)?;
    Ok(out)
}

/// Walk `root` and run the config over its files, reading only the files a rule
/// routes. Invalid UTF-8 is replaced with U+FFFD, as Node's `utf8` read does.
pub fn run_corpus_dir(
    config: &CorpusConfig,
    root: &Path,
    opts: &RunOptions,
) -> Result<RunOutcome, NativeRunError> {
    let paths = walk_dir(root)?;
    let files = paths.iter().map(|rel| {
        let rel = rel.as_str();
        let read = move || {
            let path = root.join(rel);
            std::fs::read(&path)
                .map(|bytes| Cow::Owned(String::from_utf8_lossy(&bytes).into_owned()))
                .map_err(|source| NativeRunError::Read { path, source })
        };
        (rel, read)
    });
    run_lazy(config, files, opts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{Contract, LevelOpts, section, sections};
    use crate::runner::corpus::CorpusRule;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "markdown-contract-native-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn md_rule() -> CorpusConfig {
        CorpusConfig {
            rules: vec![CorpusRule {
                include: vec!["**/*.md".into()],
                exclude: vec![],
                contract: Contract::new()
                    .body(sections(LevelOpts::default(), vec![section("Overview")])),
                name: None,
            }],
        }
    }

    // The walk is sorted per directory, yields posix-relative paths, and skips `.git`
    // and `node_modules`.
    #[test]
    fn walk_is_deterministic_and_relative() {
        let dir = scratch("walk");
        for d in ["b", ".git", "node_modules/x"] {
            std::fs::create_dir_all(dir.join(d)).unwrap();
        }
        for f in [
            "b/inner.md",
            "a.md",
            "c.md",
            ".git/HEAD",
            "node_modules/x/r.md",
        ] {
            std::fs::write(dir.join(f), "x").unwrap();
        }
        assert_eq!(walk_dir(&dir).unwrap(), vec!["a.md", "b/inner.md", "c.md"]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn run_corpus_dir_reads_routes_and_reports() {
        let dir = scratch("run");
        std::fs::write(dir.join("good.md"), "## Overview\n\nfine\n").unwrap();
        std::fs::write(dir.join("bad.md"), "## Wrong\n\nprose\n").unwrap();
        let out = run_corpus_dir(&md_rule(), &dir, &RunOptions::default()).unwrap();
        assert_eq!(out.exit_code, 1);
        assert_eq!(out.stats.files_matched, 2);
        assert_eq!(out.findings.len(), 1);
        assert_eq!(out.findings[0].path, "bad.md");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    // A file no rule routes is never read, so a binary file beside the documents is
    // fine; a routed file with invalid UTF-8 is read lossily.
    #[test]
    fn only_routed_files_are_read_and_bad_utf8_is_replaced() {
        let dir = scratch("lossy");
        std::fs::write(dir.join("image.png"), [0x89, 0x50, 0xff, 0xfe]).unwrap();
        std::fs::write(dir.join("doc.md"), b"## Overview\n\nbad \xff byte\n").unwrap();
        let out = run_corpus_dir(&md_rule(), &dir, &RunOptions::default()).unwrap();
        assert_eq!(out.stats.files_scanned, 2);
        assert_eq!(out.stats.files_matched, 1);
        assert_eq!(out.findings, vec![]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_missing_root_names_the_directory() {
        let missing = std::env::temp_dir().join("markdown-contract-native-missing-dir");
        let err = run_corpus_dir(&md_rule(), &missing, &RunOptions::default()).unwrap_err();
        assert!(matches!(err, NativeRunError::Walk { .. }));
        assert!(
            err.to_string()
                .contains("markdown-contract-native-missing-dir")
        );
    }
}

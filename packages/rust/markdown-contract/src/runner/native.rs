//! The thin std::fs layer over the fs-free runner core (feature `native`, default on;
//! excluded from wasm builds): the deterministic directory walker and the
//! run-a-directory convenience, mirroring the TS `runCorpus` file traversal.

use std::io;
use std::path::Path;

use super::corpus::{CorpusConfig, RunOptions, RunOutcome};
use crate::declarative::DeclarativeError;

/// Everything a directory run can fail on: the walk/read (io), a bad glob (config).
#[derive(Debug, thiserror::Error)]
pub enum NativeRunError {
    #[error(transparent)]
    /// A directory walk or file read failed.
    Io(#[from] io::Error),
    #[error(transparent)]
    /// A glob did not compile.
    Glob(#[from] super::corpus::GlobError),
    #[error(transparent)]
    /// A config or contract file did not load.
    Config(#[from] DeclarativeError),
}

/// Recursively collect every file under `root`, as paths RELATIVE to `root` with POSIX
/// separators. The walk is deterministic and matches the TS `walkSync`: directory
/// entries are sorted by name before recursion (so a directory's subtree is emitted
/// where the directory sorts, not where its files would sort as full paths).
pub fn walk_dir(root: &Path) -> io::Result<Vec<String>> {
    fn recur(abs: &Path, rel: &str, out: &mut Vec<String>) -> io::Result<()> {
        let mut entries: Vec<_> = std::fs::read_dir(abs)?.collect::<io::Result<_>>()?;
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            let child_rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            let file_type = entry.file_type()?;
            if file_type.is_dir() {
                recur(&entry.path(), &child_rel, out)?;
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

/// Walk `root`, read every file, and run the config over the set — the disk-backed
/// [`run_corpus`](super::corpus::run_corpus). Exit code `0` / `1` rides on the outcome;
/// a config error (bad glob) or io error is the hosting layer's exit-code `2`.
pub fn run_corpus_dir(
    config: &CorpusConfig,
    root: &Path,
    opts: &RunOptions,
) -> Result<RunOutcome, NativeRunError> {
    let paths = walk_dir(root)?;
    let mut files = Vec::with_capacity(paths.len());
    for rel in &paths {
        files.push((rel.as_str(), std::fs::read_to_string(root.join(rel))?));
    }
    let outcome =
        super::corpus::run_corpus(config, files.iter().map(|(p, s)| (*p, s.as_str())), opts)?;
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::{Contract, LevelOpts, section, sections};
    use crate::runner::corpus::CorpusRule;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("mc-engine-native-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // Contract first: the walk is sorted per directory and yields posix-relative paths.
    #[test]
    fn walk_is_deterministic_and_relative() {
        let dir = scratch("walk");
        std::fs::create_dir_all(dir.join("b")).unwrap();
        std::fs::write(dir.join("b/inner.md"), "x").unwrap();
        std::fs::write(dir.join("a.md"), "x").unwrap();
        std::fs::write(dir.join("c.md"), "x").unwrap();
        assert_eq!(walk_dir(&dir).unwrap(), vec!["a.md", "b/inner.md", "c.md"]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn run_corpus_dir_reads_routes_and_reports() {
        let dir = scratch("run");
        std::fs::write(dir.join("good.md"), "## Overview\n\nfine\n").unwrap();
        std::fs::write(dir.join("bad.md"), "## Wrong\n\nprose\n").unwrap();
        let config = CorpusConfig {
            rules: vec![CorpusRule {
                include: vec!["**/*.md".into()],
                exclude: vec![],
                contract: Contract::new()
                    .body(sections(LevelOpts::default(), vec![section("Overview")])),
                name: None,
            }],
        };
        let out = run_corpus_dir(&config, &dir, &RunOptions::default()).unwrap();
        assert_eq!(out.exit_code, 1);
        assert_eq!(out.stats.files_matched, 2);
        assert_eq!(out.findings.len(), 1);
        assert_eq!(out.findings[0].path, "bad.md");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

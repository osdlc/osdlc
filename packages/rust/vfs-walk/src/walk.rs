//! The walk.
//!
//! For each folder: list it, sort the names, and for each name in turn:
//!
//! 1. drop it if it is in [`WalkOptions::skip_names`];
//! 2. drop a folder in [`WalkOptions::prune_dirs`];
//! 3. ask [`WalkOptions::filter`]; a folder it refuses is not entered;
//! 4. enter a folder; stat a file, apply [`WalkOptions::symlinks`] and list
//!    it.
//!
//! The starting folder's own name is never judged: the caller chose it.

use std::fmt;
use std::path::{Path, PathBuf};

use vfs_seam::{Metadata, Vfs, VfsError};

/// What the walk does with a symlink.
///
/// A [`Vfs`] lists a symlinked folder as a file, so under every policy the
/// walk never enters one and never follows a link.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Symlinks {
    /// List it like a file, with [`Entry::is_symlink`] set. Its size and time
    /// describe the link, not its target.
    #[default]
    List,
    /// Leave it out.
    Skip,
    /// Fail the walk with [`WalkError::Symlink`].
    Refuse,
}

/// What the walk does when a folder cannot be listed or a file cannot be
/// statted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Errors {
    /// Carry on. A folder that cannot be listed yields nothing; a file that
    /// cannot be statted is listed with size 0 and no time.
    #[default]
    Skip,
    /// As [`Errors::Skip`], and record each error in
    /// [`WalkOutcome::errors`].
    Report,
    /// Fail the walk with [`WalkError::Io`].
    Propagate,
}

/// A file or folder the walk is about to take, as the filter sees it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Candidate<'a> {
    /// Relative to the walk's root, `/`-separated.
    pub rel: &'a str,
    /// The last segment of `rel`.
    pub name: &'a str,
    /// A folder, not a file. A symlinked folder is a file here.
    pub is_dir: bool,
}

/// The caller's test on each entry: `true` keeps it. Asked before any stat,
/// so it costs no I/O.
pub type Filter<'f> = &'f dyn Fn(&Candidate<'_>) -> bool;

/// How to walk. The default walks everything, lists symlinks and skips
/// errors.
#[derive(Clone, Default)]
pub struct WalkOptions<'f> {
    /// File and folder names dropped wherever they appear, such as
    /// `.DS_Store`. Exact, case-sensitive matches on the name alone.
    pub skip_names: Vec<String>,
    /// Folder names never entered, such as `.git` or `node_modules`. Exact,
    /// case-sensitive matches on the name alone. A file of that name stays.
    pub prune_dirs: Vec<String>,
    /// The caller's own rule, asked of every file and folder that passes the
    /// two lists. A folder it refuses is not entered.
    pub filter: Option<Filter<'f>>,
    /// What to do with a symlink.
    pub symlinks: Symlinks,
    /// What to do with an I/O error.
    pub errors: Errors,
}

impl fmt::Debug for WalkOptions<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("WalkOptions")
            .field("skip_names", &self.skip_names)
            .field("prune_dirs", &self.prune_dirs)
            .field("filter", &self.filter.map(|_| "Fn"))
            .field("symlinks", &self.symlinks)
            .field("errors", &self.errors)
            .finish()
    }
}

/// One file the walk found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// Relative to the walk's root, `/`-separated.
    pub rel: String,
    /// The root joined with each segment of `rel`.
    pub abs: PathBuf,
    /// Size in bytes.
    pub size: u64,
    /// Last modification in milliseconds since the Unix epoch, from the same
    /// [`Vfs::metadata`] call that produced `size`. `None` when the host could
    /// not supply one, which a cache must treat as never fresh.
    pub mtime_ms: Option<i64>,
    /// The entry is a symlink. `size` and `mtime_ms` describe the link; a
    /// cache that stamps file contents must re-stat through it.
    pub is_symlink: bool,
}

/// A walk and the errors it skipped.
#[derive(Debug, Default)]
pub struct WalkOutcome {
    /// The files found, in walk order.
    pub entries: Vec<Entry>,
    /// The errors skipped, in the order met. Only filled under
    /// [`Errors::Report`].
    pub errors: Vec<VfsError>,
}

/// Why a walk stopped. Only returned under [`Symlinks::Refuse`] or
/// [`Errors::Propagate`].
#[derive(Debug, thiserror::Error)]
pub enum WalkError {
    /// A symlink, under [`Symlinks::Refuse`].
    #[error("{}: a symlink, and this walk refuses them", .0.display())]
    Symlink(PathBuf),
    /// A folder that could not be listed or a file that could not be
    /// statted, under [`Errors::Propagate`].
    #[error(transparent)]
    Io(#[from] VfsError),
}

/// Every file under `root` through `vfs`, in walk order.
///
/// With the default options nothing fails. [`Symlinks::Refuse`] and
/// [`Errors::Propagate`] turn a symlink or an I/O error into an error.
pub fn walk(vfs: &dyn Vfs, root: &Path, opts: &WalkOptions<'_>) -> Result<Vec<Entry>, WalkError> {
    Ok(walk_subtree(vfs, root, "", opts)?.entries)
}

/// Every file under the folder `sub` (relative to `root`, `/`-separated; empty
/// for `root` itself), with each entry named relative to `root`, and the
/// errors skipped under [`Errors::Report`].
///
/// Naming entries from `root` lets a caller walk several subtrees of one
/// tree and key them all the same way, and lets the filter judge the whole
/// path, folders above `sub` included.
pub fn walk_subtree(
    vfs: &dyn Vfs,
    root: &Path,
    sub: &str,
    opts: &WalkOptions<'_>,
) -> Result<WalkOutcome, WalkError> {
    let mut walker = Walker {
        vfs,
        opts,
        out: WalkOutcome::default(),
    };
    let rel: String = sub
        .split('/')
        .filter(|seg| !seg.is_empty())
        .collect::<Vec<_>>()
        .join("/");
    walker.dir(&join_rel(root, &rel), &rel)?;
    Ok(walker.out)
}

/// One walk's state.
struct Walker<'a, 'f> {
    vfs: &'a dyn Vfs,
    opts: &'a WalkOptions<'f>,
    out: WalkOutcome,
}

impl Walker<'_, '_> {
    /// Lists `dir` (relative `rel`, empty for the root) and visits its
    /// entries in name order.
    fn dir(&mut self, dir: &Path, rel: &str) -> Result<(), WalkError> {
        let mut entries = match self.vfs.read_dir(dir) {
            Ok(entries) => entries,
            Err(e) => return self.error(e),
        };
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        for entry in entries {
            let name = entry.name;
            if self.opts.skip_names.contains(&name) {
                continue;
            }
            if entry.is_dir && self.opts.prune_dirs.contains(&name) {
                continue;
            }
            let child_rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            if let Some(filter) = self.opts.filter {
                let candidate = Candidate {
                    rel: &child_rel,
                    name: &name,
                    is_dir: entry.is_dir,
                };
                if !filter(&candidate) {
                    continue;
                }
            }
            let path = dir.join(&name);
            if entry.is_dir {
                self.dir(&path, &child_rel)?;
            } else {
                self.file(path, child_rel)?;
            }
        }
        Ok(())
    }

    fn file(&mut self, path: PathBuf, rel: String) -> Result<(), WalkError> {
        let meta = match self.vfs.metadata(&path) {
            Ok(m) => Some(m),
            Err(e) => {
                self.error(e)?;
                None
            }
        };
        let (size, mtime_ms, is_symlink) = meta
            .map(|m: Metadata| (m.len, m.modified_ms, m.is_symlink))
            .unwrap_or((0, None, false));
        if is_symlink {
            match self.opts.symlinks {
                Symlinks::List => {}
                Symlinks::Skip => return Ok(()),
                Symlinks::Refuse => return Err(WalkError::Symlink(path)),
            }
        }
        self.out.entries.push(Entry {
            rel,
            abs: path,
            size,
            mtime_ms,
            is_symlink,
        });
        Ok(())
    }

    /// Applies the error policy: `Err` under [`Errors::Propagate`], `Ok`
    /// otherwise.
    fn error(&mut self, e: VfsError) -> Result<(), WalkError> {
        match self.opts.errors {
            Errors::Skip => Ok(()),
            Errors::Report => {
                self.out.errors.push(e);
                Ok(())
            }
            Errors::Propagate => Err(e.into()),
        }
    }
}

/// `root` joined with each segment of a `/`-separated relative path.
fn join_rel(root: &Path, rel: &str) -> PathBuf {
    let mut path = root.to_path_buf();
    for seg in rel.split('/').filter(|s| !s.is_empty()) {
        path.push(seg);
    }
    path
}

#[cfg(test)]
mod tests {
    use super::*;
    use vfs_seam::MemVfs;

    const R: &str = "/r";

    fn tree(files: &[&str]) -> MemVfs {
        let d = MemVfs::new();
        for rel in files {
            d.insert(Path::new(R).join(rel), "x").unwrap();
        }
        d
    }

    fn rels(entries: Vec<Entry>) -> Vec<String> {
        entries.into_iter().map(|e| e.rel).collect()
    }

    fn w(d: &MemVfs, opts: &WalkOptions<'_>) -> Vec<String> {
        rels(walk(d, Path::new(R), opts).unwrap())
    }

    #[test]
    fn the_default_walk_lists_every_file_in_tree_order() {
        // Names sort as `String`s, by bytes, so `Zed` precedes `apple` and `z`
        // precedes `é`. Dot names are ordinary names here.
        let d = tree(&["apple/note.md", "Zed/note.md", "é.md", "z.md", ".hidden"]);
        assert_eq!(
            w(&d, &WalkOptions::default()),
            vec![".hidden", "Zed/note.md", "apple/note.md", "z.md", "é.md"]
        );
    }

    #[test]
    fn skip_names_and_prune_dirs_drop_entries_by_name() {
        let d = tree(&[
            "a/.DS_Store",
            "a/b.txt",
            "node_modules/pkg/readme.md",
            ".git/HEAD",
        ]);
        let opts = WalkOptions {
            skip_names: vec![".DS_Store".into()],
            prune_dirs: vec!["node_modules".into(), ".git".into()],
            ..Default::default()
        };
        assert_eq!(w(&d, &opts), vec!["a/b.txt"]);
        // A pruned name is a folder rule: a file of that name stays.
        d.insert(Path::new(R).join("a/node_modules"), "x").unwrap();
        assert_eq!(w(&d, &opts), vec!["a/b.txt", "a/node_modules"]);
    }

    #[test]
    fn the_filter_drops_files_and_prunes_folders() {
        let d = tree(&["keep/a.md", "keep/b.png", "drop/c.md"]);
        let asked = std::cell::RefCell::new(Vec::new());
        let filter = |c: &Candidate<'_>| {
            asked.borrow_mut().push((c.rel.to_owned(), c.is_dir));
            c.rel != "drop" && !c.name.ends_with(".png")
        };
        let opts = WalkOptions {
            filter: Some(&filter),
            ..Default::default()
        };
        assert_eq!(w(&d, &opts), vec!["keep/a.md"]);
        // A refused folder is not entered, so nothing below it is asked.
        assert!(!asked.borrow().iter().any(|(rel, _)| rel == "drop/c.md"));
        assert!(asked.borrow().contains(&("keep".to_owned(), true)));
    }

    #[test]
    fn a_subtree_walk_names_entries_from_the_root() {
        let d = tree(&["a/b/c.md", "a/d.md", "e.md"]);
        let filter = |c: &Candidate<'_>| c.rel.starts_with("a/b");
        let opts = WalkOptions {
            filter: Some(&filter),
            ..Default::default()
        };
        let out = walk_subtree(&d, Path::new(R), "a/b", &opts).unwrap();
        assert_eq!(rels(out.entries.clone()), vec!["a/b/c.md"]);
        assert_eq!(
            out.entries[0].abs,
            Path::new(R).join("a").join("b").join("c.md")
        );
        // Empty segments are dropped, so `a//b/` is `a/b`.
        let same = walk_subtree(&d, Path::new(R), "a//b/", &opts).unwrap();
        assert_eq!(rels(same.entries), vec!["a/b/c.md"]);
    }

    #[test]
    fn entries_carry_the_vfs_size_and_time() {
        let d = MemVfs::new();
        d.insert(Path::new(R).join("a.md"), "abc").unwrap();
        d.set_modified(&Path::new(R).join("a.md"), Some(1234))
            .unwrap();
        let entry = walk(&d, Path::new(R), &WalkOptions::default())
            .unwrap()
            .remove(0);
        assert_eq!(entry.size, 3);
        assert_eq!(entry.mtime_ms, Some(1234));
        assert_eq!(entry.abs, Path::new(R).join("a.md"));
        assert!(!entry.is_symlink);
    }

    #[test]
    fn a_missing_root_is_empty_reported_or_an_error_as_asked() {
        let d = MemVfs::new();
        assert!(w(&d, &WalkOptions::default()).is_empty());

        let report = WalkOptions {
            errors: Errors::Report,
            ..Default::default()
        };
        let out = walk_subtree(&d, Path::new(R), "", &report).unwrap();
        assert!(out.entries.is_empty());
        assert_eq!(out.errors.len(), 1);
        assert!(out.errors[0].is_not_found());

        let strict = WalkOptions {
            errors: Errors::Propagate,
            ..Default::default()
        };
        assert!(matches!(
            walk(&d, Path::new(R), &strict),
            Err(WalkError::Io(e)) if e.is_not_found()
        ));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_is_listed_skipped_or_refused() {
        use vfs_seam::NativeVfs;

        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("real.md"), "x").unwrap();
        std::os::unix::fs::symlink(d.path().join("real.md"), d.path().join("link.md")).unwrap();
        std::fs::create_dir(d.path().join("dir")).unwrap();
        std::fs::write(d.path().join("dir/inner.md"), "x").unwrap();
        std::os::unix::fs::symlink(d.path().join("dir"), d.path().join("dirlink")).unwrap();

        let listed = walk(&NativeVfs, d.path(), &WalkOptions::default()).unwrap();
        let link = listed.iter().find(|e| e.rel == "link.md").unwrap();
        assert!(link.is_symlink);
        // A linked folder is listed as a file and never entered.
        assert!(listed.iter().any(|e| e.rel == "dirlink" && e.is_symlink));
        assert!(!listed.iter().any(|e| e.rel.starts_with("dirlink/")));

        let skip = WalkOptions {
            symlinks: Symlinks::Skip,
            ..Default::default()
        };
        assert_eq!(
            rels(walk(&NativeVfs, d.path(), &skip).unwrap()),
            vec!["dir/inner.md", "real.md"]
        );

        let refuse = WalkOptions {
            symlinks: Symlinks::Refuse,
            ..Default::default()
        };
        let err = walk(&NativeVfs, d.path(), &refuse).unwrap_err();
        assert!(matches!(err, WalkError::Symlink(_)), "{err}");
    }
}

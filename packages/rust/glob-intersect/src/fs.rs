//! L2 — filesystem (the `fs` feature).
//!
//! The only layer that reads disk and the only one carrying a dependency (a
//! directory walker). It enumerates real files, then filters via the pure path
//! API — it does not re-implement matching. This is where "which files exist and
//! fall in this scope" lives; L0/L1 stay pure questions about patterns.
//!
//! Semantics are IDENTICAL to the pure layer: the walker is used only to
//! enumerate the tree; every include/exclude decision is made by the path API's
//! [`crate::matches`]. So a bare path is an exact match and a subtree needs
//! `**`, exactly as at L1 — no walker dialect leaks into the result.
//!
//! The walked names are FILENAMES; the arguments are GLOBS. The path API reads
//! each walked name as the literal name it is, so a file really called
//! `pages/[id].vue` is compared as that name and not as a character class. The
//! corollary binds callers: to reach such a file you must escape the
//! metacharacters in your pattern too (`pages/\[id\].vue`) — a literal path fed
//! in verbatim silently matches nothing.
//!
//! The walk lists the WHOLE tree under `cwd` before it filters; it is not pruned
//! by the patterns. Symbolic links are neither followed nor listed, even with
//! `only_files` off. A `cwd` that is missing or not a directory, and any
//! directory the walk cannot read, is an [`Error::Io`] (`IO_ERROR`). `ignore`
//! follows the same rules as the patterns: `["node_modules"]` excludes only a
//! path named exactly `node_modules` (write `node_modules/**`), a pattern with a
//! leading `./` or `/` matches no file, and `!` is not negation.
//!
//! The walk always sees dotfiles, so they reach the post-filter; whether `*`/`**`
//! actually match a dot segment is then [`Options::dot`]'s call, keeping the
//! decision in one place (L1). Results are sorted by code point.

use std::path::{Component, Path, PathBuf};

use walkdir::WalkDir;

use crate::{Error, Matcher, Options};

/// Options for the filesystem layer — matching semantics plus on-disk
/// resolution controls.
#[derive(Debug, Clone)]
pub struct FsOptions {
    /// Matching semantics, handed straight to the path API.
    pub options: Options,
    /// Directory the patterns resolve against. Default: the process cwd. A
    /// directory that is missing, is not a directory, or cannot be read is an
    /// [`Error::Io`].
    pub cwd: Option<PathBuf>,
    /// Patterns to exclude from results, with the same rules as the patterns.
    pub ignore: Vec<String>,
    /// Return files only (skip directories). Default `true`.
    pub only_files: bool,
    /// Return absolute paths — the `cwd` resolved against the process cwd when
    /// it is relative, then joined with each path. Default `false`.
    pub absolute: bool,
}

impl Default for FsOptions {
    fn default() -> Self {
        Self {
            options: Options::default(),
            cwd: None,
            ignore: Vec::new(),
            only_files: true,
            absolute: false,
        }
    }
}

impl FsOptions {
    /// The directory to resolve against, falling back to the process cwd.
    fn root(&self) -> Result<PathBuf, Error> {
        match &self.cwd {
            Some(cwd) => Ok(cwd.clone()),
            None => Ok(std::env::current_dir()?),
        }
    }
}

/// Lexically resolve `rel` against `base`: `.` is dropped and `..` pops a
/// component, as the peer's `path.resolve` does. No filesystem access.
fn resolve(base: &Path, rel: &str) -> PathBuf {
    let mut out = PathBuf::new();
    for component in base.components().chain(Path::new(rel).components()) {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// A walked entry's path relative to `root`, with `/` separators — the form the
/// pure API's patterns are written in. `None` when the entry is the root itself
/// or sits outside it.
fn relative(root: &Path, entry: &Path) -> Option<String> {
    let rel = entry.strip_prefix(root).ok()?;
    let joined = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

/// Enumerate every entry under `cwd`, then keep those the path API says fall in
/// `patterns` (and in `also`, when given) and not in `ignore`. Returns
/// cwd-relative paths, sorted by code point.
fn files_matching(
    include: &Matcher,
    also: Option<&Matcher>,
    opts: &FsOptions,
) -> Result<Vec<String>, Error> {
    let ignore = if opts.ignore.is_empty() {
        None
    } else {
        Some(Matcher::new(&opts.ignore, opts.options)?)
    };
    let root = opts.root()?;
    // `WalkDir` on a file yields nothing, so a non-directory `cwd` is caught here.
    if !std::fs::metadata(&root)?.is_dir() {
        return Err(Error::Io(std::io::Error::new(
            std::io::ErrorKind::NotADirectory,
            format!("cwd '{}' is not a directory", root.display()),
        )));
    }
    let mut survivors: Vec<String> = Vec::new();
    for entry in WalkDir::new(&root).min_depth(1) {
        let entry = entry?;
        // Links are neither followed nor listed, whatever `only_files` says.
        if entry.file_type().is_symlink() {
            continue;
        }
        if opts.only_files && !entry.file_type().is_file() {
            continue;
        }
        let Some(rel) = relative(&root, entry.path()) else {
            continue;
        };
        if !include.matches(&rel) {
            continue;
        }
        if also.is_some_and(|m| !m.matches(&rel)) {
            continue;
        }
        if ignore.as_ref().is_some_and(|m| m.matches(&rel)) {
            continue;
        }
        survivors.push(rel);
    }
    // `String` orders by UTF-8 bytes, which is code point order.
    survivors.sort();
    Ok(survivors)
}

/// Absolutize cwd-relative paths when `opts.absolute` is set; otherwise pass
/// them through.
fn absolutize(rel: Vec<String>, opts: &FsOptions) -> Result<Vec<String>, Error> {
    if !opts.absolute {
        return Ok(rel);
    }
    let root = std::path::absolute(opts.root()?)?;
    Ok(rel
        .into_iter()
        .map(|r| resolve(&root, &r).to_string_lossy().into_owned())
        .collect())
}

/// The concrete on-disk files matching `patterns` — a scope's context slice.
///
/// Pure-layer semantics throughout; see the module docs. Returns the files
/// sorted by code point, cwd-relative unless [`FsOptions::absolute`].
///
/// # Errors
///
/// [`Error::UnsupportedSyntax`] or [`Error::PatternTooDeep`] for a refused
/// pattern, checked before the walk starts. [`Error::Io`] if the cwd is missing,
/// is not a directory, or a directory under it cannot be read.
pub fn files_in_scope<P: AsRef<str>>(
    patterns: &[P],
    opts: &FsOptions,
) -> Result<Vec<String>, Error> {
    // Compile first: a bad pattern must fail before the walk starts.
    let include = Matcher::new(patterns, opts.options)?;
    let rel = files_matching(&include, None, opts)?;
    absolutize(rel, opts)
}

/// The concrete on-disk files that fall in BOTH `a` and `b`.
///
/// # Errors
///
/// As [`files_in_scope`].
pub fn resolve_intersection<A: AsRef<str>, B: AsRef<str>>(
    a: &[A],
    b: &[B],
    opts: &FsOptions,
) -> Result<Vec<String>, Error> {
    // Resolve in relative space (regardless of `opts.absolute`) so the relative
    // patterns match, then absolutize once at the boundary.
    let also = Matcher::new(b, opts.options)?;
    let include = Matcher::new(a, opts.options)?;
    let rel = files_matching(&include, Some(&also), opts)?;
    absolutize(rel, opts)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The corpus's three `fs.*` cases cover the default shape. These pin the
    /// resolution controls it does not reach — `absolute`, `only_files`, and a
    /// dotfile's trip through the walk to the L1 `dot` decision.
    fn tree(files: &[&str]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("temp dir");
        for rel in files {
            let target = dir.path().join(rel);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).expect("create dirs");
            }
            std::fs::write(&target, "").expect("create file");
        }
        dir
    }

    fn opts(dir: &tempfile::TempDir) -> FsOptions {
        FsOptions {
            cwd: Some(dir.path().to_path_buf()),
            ..FsOptions::default()
        }
    }

    #[test]
    fn absolute_prefixes_the_cwd_and_relative_is_the_default() {
        let dir = tree(&["src/api/user.ts"]);
        let rel = files_in_scope(&["src/**"], &opts(&dir)).expect("walk");
        assert_eq!(rel, ["src/api/user.ts"]);

        let abs = files_in_scope(
            &["src/**"],
            &FsOptions {
                absolute: true,
                ..opts(&dir)
            },
        )
        .expect("walk");
        assert_eq!(abs, [dir.path().join("src/api/user.ts").to_string_lossy()]);
    }

    #[test]
    fn only_files_false_lets_directories_through_the_filter() {
        let dir = tree(&["src/api/user.ts"]);
        let with_dirs = files_in_scope(
            &["src/**"],
            &FsOptions {
                only_files: false,
                ..opts(&dir)
            },
        )
        .expect("walk");
        // `src` itself is in scope: a globstar spans zero segments by default,
        // so `src/**` is satisfied by the directory as well as its contents.
        assert_eq!(with_dirs, ["src", "src/api", "src/api/user.ts"]);
    }

    #[test]
    fn a_dotfile_reaches_the_walk_and_the_dot_option_decides() {
        let dir = tree(&[".env", "src/app.ts"]);
        // The walk always sees `.env`; `*` excludes it by default…
        assert_eq!(
            files_in_scope(&["*"], &opts(&dir)).expect("walk"),
            [] as [String; 0]
        );
        // …and `dot: true` lets it through, without the walk changing.
        let dotted = files_in_scope(
            &["*"],
            &FsOptions {
                options: Options {
                    dot: true,
                    ..Options::default()
                },
                ..opts(&dir)
            },
        )
        .expect("walk");
        assert_eq!(dotted, [".env"]);
    }

    #[test]
    fn resolve_intersection_keeps_only_what_both_scopes_hold() {
        let dir = tree(&["src/api/user.ts", "src/api/README.md", "src/db/pool.ts"]);
        let both =
            resolve_intersection(&["src/**/*.ts"], &["src/api/**"], &opts(&dir)).expect("walk");
        assert_eq!(both, ["src/api/user.ts"]);
    }
}

//! The shared conformance fixture, `tests/fixtures/parity.json`.
//!
//! This file is the contract between this crate and its TypeScript twin in
//! `packages/ts/path-guard`, which reads it in place: same input, same result.
//! A case added on either side goes in the fixture, never in one twin's own
//! suite.
//!
//! The `resolve` and `contains` cases run under a resolver for which no path
//! exists, so they pin the lexical fold and the component-wise comparison
//! without touching the filesystem. The `lexical_absolute` and `to_relative`
//! cases are pure too: every `lexical_absolute` input is absolute, so the
//! current directory never enters. The `resolve_on_disk` and
//! `contains_on_disk` cases build a tree of directories, files and symlinks in
//! a scratch directory and run [`path_guard::resolve`] or
//! [`path_guard::contains`] against it.
//!
//! The fixture pins the POSIX rule, where `link/..` is the parent of the
//! link's target. Windows folds `..` as text before it follows a link, so
//! there an on-disk case with a `..` is checked against where the filesystem
//! puts the path instead of the fixture's answer, as the TypeScript suite
//! does. The `lexical_absolute` cases are POSIX absolute paths, which take
//! the working directory's drive on Windows, so they run on Unix only.
//!
//! Compiled in with `include_str!` rather than read at run time, so the test
//! binary carries the fixture and a moved or deleted fixture is a build error,
//! not a late panic.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

use path_guard::{
    PathError, Resolver, contains, contains_with, lexical_absolute, resolve, resolve_with,
    to_relative, validate_relative,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    validate_relative: Vec<LexicalCase>,
    resolve: Vec<ResolveCase>,
    contains: Vec<ContainsCase>,
    lexical_absolute: Vec<LexicalCase>,
    to_relative: Vec<ResolveCase>,
    resolve_on_disk: Vec<OnDiskCase>,
    contains_on_disk: Vec<ContainsOnDiskCase>,
}

#[derive(Deserialize)]
struct LexicalCase {
    name: String,
    input: String,
    ok: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct ResolveCase {
    name: String,
    root: String,
    input: String,
    ok: Option<String>,
    error: Option<String>,
}

/// The tree a case builds in a scratch directory.
#[derive(Deserialize)]
struct Tree {
    #[serde(default)]
    dirs: Vec<String>,
    #[serde(default)]
    files: Vec<String>,
    /// Link path to target text. A target starting with `/` is rooted at the
    /// scratch directory.
    #[serde(default)]
    links: BTreeMap<String, String>,
}

/// A resolve case run against a tree built in a scratch directory.
#[derive(Deserialize)]
struct OnDiskCase {
    name: String,
    #[serde(flatten)]
    tree: Tree,
    root: String,
    input: String,
    ok: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct ContainsCase {
    name: String,
    outer: String,
    inner: String,
    expected: bool,
}

/// A contains case run against a tree built in a scratch directory. `outer`
/// and `inner` are relative to it.
#[derive(Deserialize)]
struct ContainsOnDiskCase {
    name: String,
    #[serde(flatten)]
    tree: Tree,
    outer: String,
    inner: String,
    expected: bool,
}

/// A filesystem in which nothing exists.
struct Nothing;

impl Resolver for Nothing {
    fn canonicalize(&self, _: &Path) -> io::Result<PathBuf> {
        Err(io::Error::from(io::ErrorKind::NotFound))
    }

    fn read_link(&self, _: &Path) -> io::Result<PathBuf> {
        Err(io::Error::from(io::ErrorKind::NotFound))
    }
}

/// The fixture's name for each error.
fn kind(e: &PathError) -> &'static str {
    match e {
        PathError::Empty => "empty",
        PathError::Absolute(_) => "absolute",
        PathError::ParentSegment(_) => "parent_segment",
        PathError::DegenerateSegment(_) => "degenerate_segment",
        PathError::Nul => "nul",
        PathError::Tilde(_) => "tilde",
        PathError::WindowsPath(_) => "windows_path",
        PathError::Escapes(..) => "escapes",
        PathError::NotUtf8 => "not_utf8",
        // `PathError` is `#[non_exhaustive]`, so a wildcard is required here.
        _ => "unknown",
    }
}

/// `Ok(want)` or `Err(kind)` as the fixture spells a case's outcome.
fn expected(name: &str, ok: &Option<String>, error: &Option<String>) -> Result<String, String> {
    match (ok, error) {
        (Some(ok), None) => Ok(ok.clone()),
        (None, Some(error)) => Err(error.clone()),
        _ => panic!("case {name:?} must set exactly one of `ok` and `error`"),
    }
}

/// Does the case spell a `..` anywhere: in a path, a link or a link's target?
/// Such a case pins the POSIX rule, which Windows does not follow.
fn has_dotdot(tree: &Tree, paths: &[&str]) -> bool {
    let dotdot = |s: &String| s.contains("..");
    paths.iter().any(|p| p.contains(".."))
        || tree.dirs.iter().any(dotdot)
        || tree.files.iter().any(dotdot)
        || tree.links.iter().any(|(l, t)| dotdot(l) || dotdot(t))
}

/// Does the fixture's answer for a case with these paths hold on this
/// platform? On Windows a case with a `..` is checked against the filesystem
/// instead.
fn pins_this_platform(tree: &Tree, paths: &[&str]) -> bool {
    !(cfg!(windows) && has_dotdot(tree, paths))
}

/// A path the guard returned, in the fixture's `/` spelling. Windows answers
/// with `\`.
fn slashed(p: &Path) -> String {
    let s = p.to_string_lossy();
    if cfg!(windows) {
        s.replace('\\', "/")
    } else {
        s.into_owned()
    }
}

/// A symlink at `link` to `target`, as `ln -s` makes one. On Windows it is a
/// directory link when the target is a directory that exists, else a file
/// link, and `/` in the target becomes `\`, as Node's `symlinkSync` does there.
fn symlink(target: &Path, link: &Path) {
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link).unwrap();
    #[cfg(windows)]
    {
        let target = PathBuf::from(target.to_str().unwrap().replace('/', "\\"));
        if link.parent().unwrap().join(&target).is_dir() {
            std::os::windows::fs::symlink_dir(&target, link).unwrap();
        } else {
            std::os::windows::fs::symlink_file(&target, link).unwrap();
        }
    }
}

/// Is the real path of `path` the real path of `root`, or beneath it? Both
/// must exist.
fn lands_in(root: &Path, path: &Path) -> bool {
    std::fs::canonicalize(path)
        .unwrap()
        .starts_with(std::fs::canonicalize(root).unwrap())
}

/// Builds `tree` under `base`.
fn build(base: &Path, tree: &Tree) {
    for dir in &tree.dirs {
        std::fs::create_dir_all(base.join(dir)).unwrap();
    }
    for file in &tree.files {
        std::fs::write(base.join(file), b"").unwrap();
    }
    for (link, target) in &tree.links {
        let target = match target.strip_prefix('/') {
            Some(rooted) => base.join(rooted),
            None => PathBuf::from(target),
        };
        symlink(&target, &base.join(link));
    }
}

/// Builds `c`'s tree under a fresh scratch directory and resolves `c.input`
/// on the real filesystem. An `Ok` path is given relative to the scratch
/// directory, as the fixture spells it.
fn resolve_on_disk(c: &OnDiskCase) -> Result<String, String> {
    let scratch = tempfile::tempdir().unwrap();
    let base = scratch.path();
    build(base, &c.tree);
    resolve(&base.join(&c.root), &c.input)
        .map(|p| {
            slashed(
                p.strip_prefix(base)
                    .expect("the joined path starts with the scratch directory"),
            )
        })
        .map_err(|e| kind(&e).to_string())
}

/// Builds `c`'s tree under a fresh scratch directory and asks
/// [`path_guard::resolve`] about `c.input`. Then writes a file there. Returns
/// whether the guard accepted it and whether the filesystem put it inside
/// `c.root`.
fn resolve_and_write(c: &OnDiskCase) -> (bool, bool) {
    let scratch = tempfile::tempdir().unwrap();
    let base = scratch.path();
    build(base, &c.tree);
    let root = base.join(&c.root);
    let inside = resolve(&root, &c.input).is_ok();
    let path = root.join(&c.input);
    std::fs::write(&path, b"").unwrap();
    (inside, lands_in(&root, &path))
}

/// Builds `c`'s tree under a fresh scratch directory and answers `contains`
/// on the real filesystem. Then creates `c.inner`. Returns the answer and
/// whether the filesystem put `c.inner` inside `c.outer`, so a case cannot
/// pin a wrong answer.
fn contains_on_disk(c: &ContainsOnDiskCase) -> (bool, bool) {
    let scratch = tempfile::tempdir().unwrap();
    let base = scratch.path();
    build(base, &c.tree);
    let (outer, inner) = (base.join(&c.outer), base.join(&c.inner));
    let got = contains(&outer, &inner);
    std::fs::create_dir_all(&inner).unwrap();
    (got, lands_in(&outer, &inner))
}

/// Compiled in rather than read at runtime: the test binary then carries the
/// fixture, and a moved or deleted fixture is a build error, not a late panic.
const FIXTURE_JSON: &str = include_str!("fixtures/parity.json");

fn load() -> Fixture {
    serde_json::from_str(FIXTURE_JSON).expect("parity.json is valid")
}

#[test]
fn shared_fixture() {
    let fixture = load();
    assert!(
        !fixture.validate_relative.is_empty()
            && !fixture.resolve.is_empty()
            && !fixture.contains.is_empty()
            && !fixture.lexical_absolute.is_empty()
            && !fixture.to_relative.is_empty()
            && !fixture.resolve_on_disk.is_empty()
            && !fixture.contains_on_disk.is_empty(),
        "every section of the fixture has cases"
    );
    let mut failures = Vec::new();

    for c in &fixture.validate_relative {
        let want = expected(&c.name, &c.ok, &c.error);
        let got = validate_relative(&c.input).map_err(|e| kind(&e).to_string());
        if got != want {
            failures.push(format!(
                "validate_relative [{}] {:?}: got {got:?}, want {want:?}",
                c.name, c.input
            ));
        }
    }

    for c in &fixture.resolve {
        let want = expected(&c.name, &c.ok, &c.error);
        let got = resolve_with(&Nothing, Path::new(&c.root), &c.input)
            .map(|p| slashed(&p))
            .map_err(|e| kind(&e).to_string());
        if got != want {
            failures.push(format!(
                "resolve [{}] {:?} under {:?}: got {got:?}, want {want:?}",
                c.name, c.input, c.root
            ));
        }
    }

    for c in &fixture.contains {
        let got = contains_with(&Nothing, Path::new(&c.outer), Path::new(&c.inner));
        if got != c.expected {
            failures.push(format!(
                "contains [{}] {:?} in {:?}: got {got}, want {}",
                c.name, c.inner, c.outer, c.expected
            ));
        }
    }

    for c in fixture.lexical_absolute.iter().filter(|_| cfg!(unix)) {
        let want = expected(&c.name, &c.ok, &c.error);
        let got = lexical_absolute(Path::new(&c.input))
            .map(|p| p.to_string_lossy().into_owned())
            .map_err(|e| e.to_string());
        if got != want {
            failures.push(format!(
                "lexical_absolute [{}] {:?}: got {got:?}, want {want:?}",
                c.name, c.input
            ));
        }
    }

    for c in &fixture.to_relative {
        let want = expected(&c.name, &c.ok, &c.error);
        let got =
            to_relative(Path::new(&c.root), Path::new(&c.input)).map_err(|e| kind(&e).to_string());
        if got != want {
            failures.push(format!(
                "to_relative [{}] {:?} under {:?}: got {got:?}, want {want:?}",
                c.name, c.input, c.root
            ));
        }
    }

    for c in &fixture.resolve_on_disk {
        if !pins_this_platform(&c.tree, &[&c.root, &c.input]) {
            let (inside, landed) = resolve_and_write(c);
            if inside != landed {
                failures.push(format!(
                    "resolve_on_disk [{}] {:?} under {:?}: accepted {inside}, the filesystem puts it inside: {landed}",
                    c.name, c.input, c.root
                ));
            }
            continue;
        }
        let want = expected(&c.name, &c.ok, &c.error);
        let got = resolve_on_disk(c);
        if got != want {
            failures.push(format!(
                "resolve_on_disk [{}] {:?} under {:?}: got {got:?}, want {want:?}",
                c.name, c.input, c.root
            ));
        }
    }

    for c in &fixture.contains_on_disk {
        let (got, landed) = contains_on_disk(c);
        if got != landed {
            failures.push(format!(
                "contains_on_disk [{}] {:?} in {:?}: got {got}, the filesystem puts it inside: {landed}",
                c.name, c.inner, c.outer
            ));
        }
        if pins_this_platform(&c.tree, &[&c.outer, &c.inner]) && got != c.expected {
            failures.push(format!(
                "contains_on_disk [{}] {:?} in {:?}: got {got}, want {}",
                c.name, c.inner, c.outer, c.expected
            ));
        }
    }

    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

//! The shared conformance fixture, `tests/fixtures/parity.json`.
//!
//! This file is the contract between this crate and its TypeScript twin in
//! `packages/ts/path-guard`, which reads it in place: same input, same result.
//! A case added on either side goes in the fixture, never in one twin's own
//! suite. Every section is read here, and an unknown section fails the run.
//!
//! The `resolve`, `resolve_windows_names` and `contains` cases run under a
//! resolver for which no path exists, so they pin the lexical fold and the
//! component-wise comparison without touching the filesystem. The
//! `validate_relative`, `windows_names`, `absolute`, `is_under` and
//! `to_relative` cases are pure text. The `resolve_on_disk`,
//! `contains_on_disk` and `real_path` cases build a tree of directories,
//! files and symlinks in a scratch directory and run [`Guard::std`] against
//! it.
//!
//! The guard reads "absolute" as the platform does. On Windows a `/v` root is
//! not absolute, so there the runner maps each fixture path that starts with
//! `/` in the guard sections onto the drive of a real absolute root (`/v`
//! becomes `C:/v`), and maps the expected paths the same way. The lexical
//! sections read POSIX paths on every host and run unmapped.
//!
//! `resolve_windows_names` has a column per platform: `windows`, and `other`
//! for every other host. The runner checks the column for its host.
//!
//! The fixture pins the POSIX rule, where `link/..` is the parent of the
//! link's target. Windows folds `..` as text before it follows a link, so
//! there a `resolve_on_disk` or `contains_on_disk` case with a `..` is
//! checked against where the filesystem puts the path instead of the
//! fixture's answer, as the TypeScript suite does.
//!
//! Compiled in with `include_str!` rather than read at run time, so the test
//! binary carries the fixture and a moved or deleted fixture is a build error,
//! not a late panic.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use path_guard::{Guard, PathError, PathWarning, PathWarningKind, Resolver, lexical};
use serde::Deserialize;

/// Every section. A key that starts with `_` is a note, not a section; any
/// other key is a section this runner must read.
#[derive(Deserialize)]
struct Fixture {
    validate_relative: Vec<LexicalCase>,
    windows_names: Vec<WindowsNamesCase>,
    resolve: Vec<ResolveCase>,
    resolve_windows_names: Vec<ResolveNamesCase>,
    contains: Vec<ContainsCase>,
    absolute: Vec<AbsoluteCase>,
    is_under: Vec<IsUnderCase>,
    to_relative: Vec<ResolveCase>,
    resolve_on_disk: Vec<OnDiskCase>,
    contains_on_disk: Vec<ContainsOnDiskCase>,
    real_path: Vec<RealPathCase>,
}

#[derive(Deserialize)]
struct LexicalCase {
    name: String,
    input: String,
    ok: Option<String>,
    error: Option<String>,
}

/// A warning as the fixture spells it.
#[derive(Deserialize, Debug, PartialEq)]
struct Warning {
    kind: String,
    segment: String,
}

#[derive(Deserialize)]
struct WindowsNamesCase {
    name: String,
    input: String,
    /// The kind `validate_relative` refuses the input with, if it does.
    error: Option<String>,
    warnings: Vec<Warning>,
}

#[derive(Deserialize)]
struct ResolveCase {
    name: String,
    root: String,
    input: String,
    ok: Option<String>,
    error: Option<String>,
}

/// One platform's column of a `resolve_windows_names` case.
#[derive(Deserialize)]
struct NamesOutcome {
    ok: Option<String>,
    error: Option<String>,
    #[serde(default)]
    warnings: Vec<Warning>,
}

#[derive(Deserialize)]
struct ResolveNamesCase {
    name: String,
    input: String,
    windows: NamesOutcome,
    other: NamesOutcome,
}

#[derive(Deserialize)]
struct ContainsCase {
    name: String,
    outer: String,
    inner: String,
    expected: Option<bool>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct AbsoluteCase {
    name: String,
    input: String,
    cwd: String,
    ok: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct IsUnderCase {
    name: String,
    root: String,
    input: String,
    expected: Option<bool>,
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

/// A `real_path` case run against a tree built in a scratch directory.
#[derive(Deserialize)]
struct RealPathCase {
    name: String,
    #[serde(flatten)]
    tree: Tree,
    input: String,
    ok: Option<String>,
    error: Option<String>,
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
        PathError::Unresolvable(_) => "unresolvable",
        PathError::EmptyRoot => "empty_root",
        PathError::NotUnderRoot(..) => "not_under_root",
        PathError::NotAbsolute(_) => "not_absolute",
        PathError::ReservedName(_) => "reserved_name",
        PathError::AlternateStream(_) => "alternate_stream",
        PathError::NotUtf8 => "not_utf8",
        // `PathError` is `#[non_exhaustive]`, so a wildcard is required here.
        _ => "unknown",
    }
}

/// The fixture's spelling of a warning.
fn warning(w: &PathWarning) -> Warning {
    let kind = match w.kind {
        PathWarningKind::ReservedName => "reserved_name",
        PathWarningKind::AlternateStream => "alternate_stream",
        _ => "unknown",
    };
    Warning {
        kind: kind.to_string(),
        segment: w.segment.clone(),
    }
}

/// `Ok(want)` or `Err(kind)` as the fixture spells a case's outcome.
fn expected<T: Clone>(name: &str, ok: &Option<T>, error: &Option<String>) -> Result<T, String> {
    match (ok, error) {
        (Some(ok), None) => Ok(ok.clone()),
        (None, Some(error)) => Err(error.clone()),
        _ => panic!("case {name:?} must set exactly one outcome"),
    }
}

/// A fixture path for a guard section, on this host. On Windows a path that
/// starts with `/` is put on a drive, so the guard reads it as absolute; every
/// other path is passed as written.
fn host(p: &str) -> String {
    if cfg!(windows) && p.starts_with('/') {
        format!("C:{p}")
    } else {
        p.to_string()
    }
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

/// `base` with each `/`-separated name of `rel` pushed onto it. A `/` is not
/// a separator after a verbatim `\\?\` prefix, so it is never left in a path.
fn under(base: &Path, rel: &str) -> PathBuf {
    let mut p = base.to_path_buf();
    p.extend(rel.split('/').filter(|s| !s.is_empty()));
    p
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
    Guard::std()
        .resolve(&base.join(&c.root), &c.input)
        .map(|p| {
            slashed(
                p.strip_prefix(base)
                    .expect("the joined path starts with the scratch directory"),
            )
        })
        .map_err(|e| kind(&e).to_string())
}

/// Builds `c`'s tree under a fresh scratch directory and asks the guard about
/// `c.input`. Then writes a file there. Returns whether the guard accepted it
/// and whether the filesystem put it inside `c.root`.
fn resolve_and_write(c: &OnDiskCase) -> (bool, bool) {
    let scratch = tempfile::tempdir().unwrap();
    let base = scratch.path();
    build(base, &c.tree);
    let root = base.join(&c.root);
    let inside = Guard::std().resolve(&root, &c.input).is_ok();
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
    let got = Guard::std().contains(&outer, &inner).unwrap();
    std::fs::create_dir_all(&inner).unwrap();
    (got, lands_in(&outer, &inner))
}

/// Builds `c`'s tree under a fresh scratch directory and asks for the real
/// path of `c.input`. Returns the answer and the path the fixture expects,
/// each rooted at the real path of the scratch directory.
fn real_path(c: &RealPathCase) -> (Result<PathBuf, String>, Result<PathBuf, String>) {
    let scratch = tempfile::tempdir().unwrap();
    let base = scratch.path();
    build(base, &c.tree);
    let real = std::fs::canonicalize(base).unwrap();
    let rooted = |p: &str| match p.strip_prefix('/') {
        Some(rel) => under(&real, rel),
        None => PathBuf::from(p),
    };
    let got = Guard::std()
        .real_path(&rooted(&c.input))
        .map_err(|e| kind(&e).to_string());
    let want = expected(&c.name, &c.ok, &c.error).map(|ok| rooted(&ok));
    (got, want)
}

/// Compiled in rather than read at runtime: the test binary then carries the
/// fixture, and a moved or deleted fixture is a build error, not a late panic.
const FIXTURE_JSON: &str = include_str!("fixtures/parity.json");

/// The sections [`Fixture`] reads.
const SECTIONS: &[&str] = &[
    "validate_relative",
    "windows_names",
    "resolve",
    "resolve_windows_names",
    "contains",
    "absolute",
    "is_under",
    "to_relative",
    "resolve_on_disk",
    "contains_on_disk",
    "real_path",
];

fn load() -> Fixture {
    let value: serde_json::Value =
        serde_json::from_str(FIXTURE_JSON).expect("parity.json is valid");
    let unread: Vec<&String> = value
        .as_object()
        .expect("the fixture is an object")
        .keys()
        .filter(|k| !k.starts_with('_') && !SECTIONS.contains(&k.as_str()))
        .collect();
    assert!(
        unread.is_empty(),
        "sections this runner does not read: {unread:?}"
    );
    serde_json::from_value(value).expect("parity.json has every section")
}

#[test]
fn shared_fixture() {
    let fixture = load();
    assert!(
        !fixture.validate_relative.is_empty()
            && !fixture.windows_names.is_empty()
            && !fixture.resolve.is_empty()
            && !fixture.resolve_windows_names.is_empty()
            && !fixture.contains.is_empty()
            && !fixture.absolute.is_empty()
            && !fixture.is_under.is_empty()
            && !fixture.to_relative.is_empty()
            && !fixture.resolve_on_disk.is_empty()
            && !fixture.contains_on_disk.is_empty()
            && !fixture.real_path.is_empty(),
        "every section of the fixture has cases"
    );
    let mut failures = Vec::new();
    let nothing = Guard::new(Nothing);

    for c in &fixture.validate_relative {
        let want = expected(&c.name, &c.ok, &c.error);
        let got = lexical::validate_relative(&c.input).map_err(|e| kind(&e).to_string());
        if got != want {
            failures.push(format!(
                "validate_relative [{}] {:?}: got {got:?}, want {want:?}",
                c.name, c.input
            ));
        }
    }

    for c in &fixture.windows_names {
        let refused = lexical::validate_relative(&c.input)
            .err()
            .map(|e| kind(&e).to_string());
        let got: Vec<Warning> = lexical::windows_names(&c.input)
            .iter()
            .map(warning)
            .collect();
        if refused != c.error || got != c.warnings {
            failures.push(format!(
                "windows_names [{}] {:?}: got {refused:?} {got:?}, want {:?} {:?}",
                c.name, c.input, c.error, c.warnings
            ));
        }
    }

    for c in &fixture.resolve {
        let want = expected(&c.name, &c.ok, &c.error).map(|ok| host(&ok));
        let got = nothing
            .resolve(Path::new(&host(&c.root)), &c.input)
            .map(|p| slashed(&p))
            .map_err(|e| kind(&e).to_string());
        if got != want {
            failures.push(format!(
                "resolve [{}] {:?} under {:?}: got {got:?}, want {want:?}",
                c.name, c.input, c.root
            ));
        }
    }

    let names_root = PathBuf::from(host("/v"));
    for c in &fixture.resolve_windows_names {
        let column = if cfg!(windows) { &c.windows } else { &c.other };
        let want = expected(&c.name, &column.ok, &column.error);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&seen);
        let guard = Guard::new(Nothing).with_warning_handler(move |w| {
            log.lock().unwrap().push(warning(w));
        });
        let got = guard
            .resolve(&names_root, &c.input)
            .map(|p| {
                slashed(
                    p.strip_prefix(&names_root)
                        .expect("the joined path starts with the root"),
                )
            })
            .map_err(|e| kind(&e).to_string());
        let warnings = std::mem::take(&mut *seen.lock().unwrap());
        if got != want || warnings != column.warnings {
            failures.push(format!(
                "resolve_windows_names [{}] {:?}: got {got:?} {warnings:?}, want {want:?} {:?}",
                c.name, c.input, column.warnings
            ));
        }
    }

    for c in &fixture.contains {
        let want = expected(&c.name, &c.expected, &c.error);
        let got = nothing
            .contains(Path::new(&host(&c.outer)), Path::new(&host(&c.inner)))
            .map_err(|e| kind(&e).to_string());
        if got != want {
            failures.push(format!(
                "contains [{}] {:?} in {:?}: got {got:?}, want {want:?}",
                c.name, c.inner, c.outer
            ));
        }
    }

    for c in &fixture.absolute {
        let want = expected(&c.name, &c.ok, &c.error);
        let got = lexical::absolute(Path::new(&c.input), Path::new(&c.cwd))
            .map(|p| p.to_str().unwrap().to_string())
            .map_err(|e| kind(&e).to_string());
        if got != want {
            failures.push(format!(
                "absolute [{}] {:?} in {:?}: got {got:?}, want {want:?}",
                c.name, c.input, c.cwd
            ));
        }
    }

    for c in &fixture.is_under {
        let want = expected(&c.name, &c.expected, &c.error);
        let got = lexical::is_under(Path::new(&c.root), Path::new(&c.input))
            .map_err(|e| kind(&e).to_string());
        if got != want {
            failures.push(format!(
                "is_under [{}] {:?} under {:?}: got {got:?}, want {want:?}",
                c.name, c.input, c.root
            ));
        }
    }

    for c in &fixture.to_relative {
        let want = expected(&c.name, &c.ok, &c.error);
        let got = lexical::to_relative(Path::new(&c.root), Path::new(&c.input))
            .map_err(|e| kind(&e).to_string());
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

    for c in &fixture.real_path {
        let (got, want) = real_path(c);
        if got != want {
            failures.push(format!(
                "real_path [{}] {:?}: got {got:?}, want {want:?}",
                c.name, c.input
            ));
        }
    }

    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

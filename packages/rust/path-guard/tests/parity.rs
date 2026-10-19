//! The shared conformance fixture, `tests/fixtures/parity.json`.
//!
//! This file is the contract between this crate and its TypeScript twin, which
//! carries a byte-identical copy and a test that fails when the copies differ:
//! same input, same result. A case added on either side goes in the fixture,
//! never in one twin's own suite.
//!
//! The `resolve` and `contains` cases run under a resolver for which no path
//! exists, so they pin the lexical fold and the component-wise comparison
//! without touching the filesystem. The `resolve_on_disk` and
//! `contains_on_disk` cases build a tree of directories, files and symlinks in
//! a scratch directory and run [`path_guard::resolve`] or
//! [`path_guard::contains`] against it.
//!
//! Compiled in with `include_str!` rather than read at run time, so the test
//! binary carries the fixture and a moved or deleted fixture is a build error,
//! not a late panic.

// The suite is `#[cfg(unix)]`; its helpers and imports are then unused on
// other platforms.
#![cfg_attr(not(unix), allow(dead_code, unused_imports))]

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

use path_guard::{
    PathError, Resolver, contains, contains_with, resolve, resolve_with, validate_relative,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    validate_relative: Vec<LexicalCase>,
    resolve: Vec<ResolveCase>,
    contains: Vec<ContainsCase>,
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

/// Builds `tree` under `base`.
#[cfg(unix)]
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
        std::os::unix::fs::symlink(target, base.join(link)).unwrap();
    }
}

/// Builds `c`'s tree under a fresh scratch directory and resolves `c.input`
/// on the real filesystem. An `Ok` path is given relative to the scratch
/// directory, as the fixture spells it.
#[cfg(unix)]
fn resolve_on_disk(c: &OnDiskCase) -> Result<String, String> {
    let scratch = tempfile::tempdir().unwrap();
    let base = scratch.path();
    build(base, &c.tree);
    resolve(&base.join(&c.root), &c.input)
        .map(|p| {
            p.strip_prefix(base)
                .expect("the joined path starts with the scratch directory")
                .to_string_lossy()
                .into_owned()
        })
        .map_err(|e| kind(&e).to_string())
}

/// Builds `c`'s tree under a fresh scratch directory and answers `contains`
/// on the real filesystem. Then creates `c.inner` and checks that where the
/// filesystem put it agrees with `c.expected`, so a case cannot pin a wrong
/// answer.
#[cfg(unix)]
fn contains_on_disk(c: &ContainsOnDiskCase) -> Result<bool, String> {
    let scratch = tempfile::tempdir().unwrap();
    let base = scratch.path();
    build(base, &c.tree);
    let (outer, inner) = (base.join(&c.outer), base.join(&c.inner));
    let got = contains(&outer, &inner);
    std::fs::create_dir_all(&inner).unwrap();
    let landed = std::fs::canonicalize(&inner)
        .unwrap()
        .starts_with(std::fs::canonicalize(&outer).unwrap());
    if landed != c.expected {
        return Err(format!("the filesystem puts it inside: {landed}"));
    }
    Ok(got)
}

/// Compiled in rather than read at runtime: the test binary then carries the
/// fixture, and a moved or deleted fixture is a build error, not a late panic.
const FIXTURE_JSON: &str = include_str!("fixtures/parity.json");

fn load() -> Fixture {
    serde_json::from_str(FIXTURE_JSON).expect("parity.json is valid")
}

// The suite builds symlink trees and pins symlink-resolution semantics, so it
// runs on Unix only — the platform the crate's containment layer is tested on.
// On other platforms the helpers above are unused; allow that rather than
// duplicate the gate on each one.
#[test]
#[cfg(unix)]
fn shared_fixture() {
    let fixture = load();
    assert!(
        !fixture.validate_relative.is_empty()
            && !fixture.resolve.is_empty()
            && !fixture.contains.is_empty()
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
            .map(|p| p.to_string_lossy().into_owned())
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

    for c in &fixture.resolve_on_disk {
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
        let got = contains_on_disk(c);
        if got != Ok(c.expected) {
            failures.push(format!(
                "contains_on_disk [{}] {:?} in {:?}: got {got:?}, want {}",
                c.name, c.inner, c.outer, c.expected
            ));
        }
    }

    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

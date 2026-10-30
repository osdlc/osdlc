//! Runs the path-guard conformance suite, `packages/conformance/path-guard/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript `@osdlc/path-guard`
//! package must agree on: same input, same result. The TypeScript package is
//! the family's reference: its generator writes every `expect` and `error`. A
//! case added on either side goes in the suite, never in one package's own
//! tests. Every section and every case runs here, unless the case names
//! another platform, and a section, case key or input key this test does not
//! know fails it.
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
//! not absolute, so there the runner puts each path that starts with `/` in
//! the guard sections on drive `C:`, and takes the drive off the answer. The
//! lexical sections read POSIX paths on every host.
//!
//! An on-disk case with a `..` pins the POSIX rule, where `link/..` is the
//! parent of the link's target, and runs on `unix` only. Windows folds `..`
//! as text before it follows a link, so there this test checks such a case
//! against where the filesystem puts the path instead, as the TypeScript
//! tests do.
//!
//! An integration test, not a unit test, so it uses only the public API.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use path_guard::{Guard, PathError, PathWarning, PathWarningKind, Resolver, lexical};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

/// Compiled in rather than read at runtime: the test binary then carries the
/// suite, and a moved or deleted suite is a build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/path-guard/suite.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Suite {
    family: String,
    reference: String,
    #[allow(
        dead_code,
        reason = "the suite format carries it; this test reads none"
    )]
    reference_version: String,
    sections: BTreeMap<String, Section>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Section {
    #[allow(dead_code, reason = "prose for the reader")]
    description: String,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    name: String,
    input: Value,
    #[serde(default)]
    expect: Option<Value>,
    #[serde(default)]
    error: Option<ErrorKind>,
    #[serde(default)]
    platforms: Option<Vec<String>>,
    #[serde(default)]
    skip: BTreeMap<String, String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ErrorKind {
    kind: String,
}

/// What a case gives: its `expect`, or the kind of its `error`.
type Outcome = Result<Value, String>;

const HOST: &str = if cfg!(windows) { "windows" } else { "unix" };

impl Case {
    /// Whether the case names this host, or names no platform.
    fn for_this_host(&self) -> bool {
        self.platforms
            .as_ref()
            .is_none_or(|platforms| platforms.iter().any(|p| p == HOST))
    }

    fn input<T: DeserializeOwned>(&self) -> T {
        serde_json::from_value(self.input.clone())
            .unwrap_or_else(|err| panic!("{}: input: {err}", self.name))
    }

    fn want(&self) -> Outcome {
        match (&self.expect, &self.error) {
            (Some(expect), None) => Ok(expect.clone()),
            (None, Some(error)) => Err(error.kind.clone()),
            _ => panic!("{}: a case sets exactly one of expect and error", self.name),
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PathInput {
    path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RootInput {
    root: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ContainsInput {
    outer: String,
    inner: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AbsoluteInput {
    path: String,
    cwd: String,
}

/// The tree a case builds in a scratch directory. `serde(flatten)` does not
/// combine with `deny_unknown_fields`, so each on-disk input carries the three
/// fields and lends them here.
struct Tree<'a> {
    dirs: &'a [String],
    files: &'a [String],
    /// Link path to target text. A target starting with `/` is rooted at the
    /// scratch directory.
    links: &'a BTreeMap<String, String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OnDiskInput {
    #[serde(default)]
    dirs: Vec<String>,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    links: BTreeMap<String, String>,
    root: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ContainsOnDiskInput {
    #[serde(default)]
    dirs: Vec<String>,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    links: BTreeMap<String, String>,
    outer: String,
    inner: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RealPathInput {
    #[serde(default)]
    dirs: Vec<String>,
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    links: BTreeMap<String, String>,
    path: String,
}

impl OnDiskInput {
    fn tree(&self) -> Tree<'_> {
        Tree {
            dirs: &self.dirs,
            files: &self.files,
            links: &self.links,
        }
    }
}

impl ContainsOnDiskInput {
    fn tree(&self) -> Tree<'_> {
        Tree {
            dirs: &self.dirs,
            files: &self.files,
            links: &self.links,
        }
    }
}

impl RealPathInput {
    fn tree(&self) -> Tree<'_> {
        Tree {
            dirs: &self.dirs,
            files: &self.files,
            links: &self.links,
        }
    }
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

/// The `kind` the suite spells for this crate's error. `PathError` is
/// `#[non_exhaustive]`, so a match outside the crate needs a wildcard: a new
/// variant panics here, until it has a kind and a case.
fn kind(e: &PathError) -> String {
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
        PathError::EmptyRoot { .. } => "empty_root",
        PathError::NotUnderRoot(..) => "not_under_root",
        PathError::NotAbsolute { .. } => "not_absolute",
        PathError::ReservedName(_) => "reserved_name",
        PathError::AlternateStream(_) => "alternate_stream",
        PathError::NotUtf8 => "not_utf8",
        other => panic!("a PathError the suite has no kind for: {other:?}"),
    }
    .to_string()
}

/// The suite's spelling of a warning. A new `PathWarningKind` panics here,
/// as a new `PathError` does in [`kind`].
fn warning(w: &PathWarning) -> Value {
    let kind = match w.kind {
        PathWarningKind::ReservedName => "reserved_name",
        PathWarningKind::AlternateStream => "alternate_stream",
        other => panic!("a PathWarningKind the suite has no kind for: {other:?}"),
    };
    json!({ "kind": kind, "segment": w.segment })
}

/// A suite path for a guard section, on this host. On Windows a path that
/// starts with `/` is put on a drive, so the guard reads it as absolute;
/// every other path is passed as written.
fn host(p: &str) -> String {
    if cfg!(windows) && p.starts_with('/') {
        format!("C:{p}")
    } else {
        p.to_string()
    }
}

/// A path the guard returned, in the suite's `/` spelling. Windows answers
/// with `\`.
fn slashed(p: &Path) -> String {
    let s = p.to_string_lossy();
    if cfg!(windows) {
        s.replace('\\', "/")
    } else {
        s.into_owned()
    }
}

/// [`slashed`], with the drive [`host`] put on taken off again.
fn from_host(p: &Path) -> String {
    let s = slashed(p);
    match s.strip_prefix("C:") {
        Some(rest) if cfg!(windows) && rest.starts_with('/') => rest.to_string(),
        _ => s,
    }
}

/// `base` with each `/`-separated name of `rel` pushed onto it. A `/` is not
/// a separator after a verbatim `\\?\` prefix, so it is never left in a path.
fn under(base: &Path, rel: &str) -> PathBuf {
    let mut p = base.to_path_buf();
    p.extend(rel.split('/').filter(|s| !s.is_empty()));
    p
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

/// Builds `tree` under a fresh scratch directory. The directory goes when the
/// returned value drops.
fn scratch(tree: &Tree) -> tempfile::TempDir {
    let scratch = tempfile::tempdir().unwrap();
    let base = scratch.path();
    for dir in tree.dirs {
        std::fs::create_dir_all(base.join(dir)).unwrap();
    }
    for file in tree.files {
        std::fs::write(base.join(file), b"").unwrap();
    }
    for (link, target) in tree.links {
        let target = match target.strip_prefix('/') {
            Some(rooted) => base.join(rooted),
            None => PathBuf::from(target),
        };
        symlink(&target, &base.join(link));
    }
    scratch
}

fn path(p: impl Into<String>) -> Value {
    json!({ "path": p.into() })
}

/// A refusal comes with no warning: the suite cannot say otherwise, so a
/// warning fails the case.
fn no_warnings(got: Outcome, warnings: &[Value]) -> Result<Outcome, String> {
    match &got {
        Err(_) if !warnings.is_empty() => Err(format!("refused, yet warned {warnings:?}")),
        _ => Ok(got),
    }
}

/// The outcome this crate gives for one case of a section, on this host. An
/// `Err` is a failure the suite's values cannot express.
fn run(section: &str, case: &Case) -> Result<Outcome, String> {
    Ok(match section {
        "validate_relative" => {
            let PathInput { path: p } = case.input();
            lexical::validate_relative(&p)
                .map(path)
                .map_err(|e| kind(&e))
        }
        "windows_names" => {
            let PathInput { path: p } = case.input();
            let warnings: Vec<Value> = lexical::windows_names(&p).iter().map(warning).collect();
            let got = lexical::validate_relative(&p)
                .map(|_| json!({ "warnings": warnings }))
                .map_err(|e| kind(&e));
            return no_warnings(got, &warnings);
        }
        "resolve" => {
            let RootInput { root, path: p } = case.input();
            Guard::new(Nothing)
                .resolve(Path::new(&host(&root)), &p)
                .map(|p| path(from_host(&p)))
                .map_err(|e| kind(&e))
        }
        "resolve_windows_names" => {
            let PathInput { path: p } = case.input();
            let root = PathBuf::from(host("/v"));
            let seen = Arc::new(Mutex::new(Vec::new()));
            let log = Arc::clone(&seen);
            let guard = Guard::new(Nothing).with_warning_handler(move |w| {
                log.lock().unwrap().push(warning(w));
            });
            let got = guard.resolve(&root, &p);
            let warnings = std::mem::take(&mut *seen.lock().unwrap());
            let got = got
                .map(|joined| {
                    let rel = joined
                        .strip_prefix(&root)
                        .expect("the joined path starts with the root");
                    json!({ "path": slashed(rel), "warnings": warnings })
                })
                .map_err(|e| kind(&e));
            return no_warnings(got, &warnings);
        }
        "contains" => {
            let ContainsInput { outer, inner } = case.input();
            Guard::new(Nothing)
                .contains(Path::new(&host(&outer)), Path::new(&host(&inner)))
                .map(|contains| json!({ "contains": contains }))
                .map_err(|e| kind(&e))
        }
        "absolute" => {
            let AbsoluteInput { path: p, cwd } = case.input();
            lexical::absolute(Path::new(&p), Path::new(&cwd))
                .map(|p| path(p.to_str().unwrap()))
                .map_err(|e| kind(&e))
        }
        "is_under" => {
            let RootInput { root, path: p } = case.input();
            lexical::is_under(Path::new(&root), Path::new(&p))
                .map(|under| json!({ "under": under }))
                .map_err(|e| kind(&e))
        }
        "to_relative" => {
            let RootInput { root, path: p } = case.input();
            lexical::to_relative(Path::new(&root), Path::new(&p))
                .map(path)
                .map_err(|e| kind(&e))
        }
        "resolve_on_disk" => {
            let input: OnDiskInput = case.input();
            let dir = scratch(&input.tree());
            let base = dir.path();
            Guard::std()
                .resolve(&base.join(&input.root), &input.path)
                .map(|p| {
                    path(slashed(
                        p.strip_prefix(base)
                            .expect("the joined path starts with the scratch directory"),
                    ))
                })
                .map_err(|e| kind(&e))
        }
        "contains_on_disk" => {
            let input: ContainsOnDiskInput = case.input();
            let (got, landed) = contains_and_create(&input);
            let got = got.map_err(|e| kind(&e))?;
            if got != landed {
                return Err(format!(
                    "contains {got}, but the filesystem puts it inside: {landed}"
                ));
            }
            Ok(json!({ "contains": got }))
        }
        "real_path" => {
            let input: RealPathInput = case.input();
            let dir = scratch(&input.tree());
            let real = std::fs::canonicalize(dir.path()).unwrap();
            let rooted = match input.path.strip_prefix('/') {
                Some(rel) => under(&real, rel),
                None => PathBuf::from(&input.path),
            };
            Guard::std()
                .real_path(&rooted)
                .map(|p| match p.strip_prefix(&real) {
                    Ok(rel) => path(format!("/{}", slashed(rel))),
                    Err(_) => path(slashed(&p)),
                })
                .map_err(|e| kind(&e))
        }
        other => panic!("the suite has a section this crate does not run: {other}"),
    })
}

/// Builds the case's tree and answers `contains` on the real filesystem. Then
/// creates `inner`. Returns the answer and whether the filesystem put `inner`
/// inside `outer`, so a case cannot pin a wrong answer.
fn contains_and_create(input: &ContainsOnDiskInput) -> (Result<bool, PathError>, bool) {
    let dir = scratch(&input.tree());
    let base = dir.path();
    // Joined as text, so a `..` is not folded first.
    let (outer, inner) = (base.join(&input.outer), base.join(&input.inner));
    let got = Guard::std().contains(&outer, &inner);
    std::fs::create_dir_all(&inner).unwrap();
    (got, lands_in(&outer, &inner))
}

/// An on-disk case for `unix` only, on Windows: the guard must agree with
/// where the filesystem puts the path.
fn check_against_the_filesystem(section: &str, case: &Case) -> Result<(), String> {
    let (accepted, landed) = match section {
        "resolve_on_disk" => {
            let input: OnDiskInput = case.input();
            let dir = scratch(&input.tree());
            let root = dir.path().join(&input.root);
            let accepted = Guard::std().resolve(&root, &input.path).is_ok();
            // Then writes a file there and sees where it lands.
            let path = root.join(&input.path);
            std::fs::write(&path, b"").unwrap();
            (accepted, lands_in(&root, &path))
        }
        "contains_on_disk" => {
            let (got, landed) = contains_and_create(&case.input());
            (got.map_err(|e| kind(&e))?, landed)
        }
        _ => return Ok(()),
    };
    if accepted == landed {
        Ok(())
    } else {
        Err(format!(
            "the guard says {accepted}, the filesystem puts it inside: {landed}"
        ))
    }
}

#[test]
fn every_case_in_the_suite_conforms() {
    let suite: Suite =
        serde_json::from_str(SUITE_JSON).expect("the suite is valid JSON in the suite format");
    assert_eq!(suite.family, "path-guard");
    assert_eq!(suite.reference, "ts");
    let mut failures = Vec::new();
    let mut ran = 0;
    for (section, body) in &suite.sections {
        assert!(!body.cases.is_empty(), "{section} has no cases");
        for case in &body.cases {
            let at = format!("{section} [{}] {}", case.name, case.input);
            if case.skip.contains_key("rust") {
                continue;
            }
            if !case.for_this_host() {
                if cfg!(windows)
                    && let Err(failure) = check_against_the_filesystem(section, case)
                {
                    failures.push(format!("{at}: {failure}"));
                }
                continue;
            }
            ran += 1;
            let want = case.want();
            match run(section, case) {
                Ok(got) if got == want => {}
                Ok(got) => failures.push(format!("{at}: got {got:?}, want {want:?}")),
                Err(failure) => failures.push(format!("{at}: {failure}")),
            }
        }
    }
    assert!(ran > 0, "no case ran");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

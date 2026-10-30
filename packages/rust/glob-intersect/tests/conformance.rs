//! Runs the intersect conformance suite, `packages/conformance/intersect/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript `@osdlc/intersect`
//! package must agree on. The TypeScript package is the family's reference:
//! its generator writes every `expect` and `error`. Every section and every
//! case runs here. A section, a case key, an input key or an option this test
//! does not know fails it, and so does a case it cannot run, unless the case's
//! `platforms` or `skip` rule this host out, with two exceptions:
//!
//! - Without the `fs` feature, [`every_fs_case_conforms`] is compiled but
//!   ignored, so `cargo test` reports it as `ignored` rather than passing it.
//! - A case with `unreadable` directories is not run where mode 000 does not
//!   stop a read, which is when running as root. The test prints those cases
//!   to stderr, which `cargo test` shows with `--nocapture`.
//!
//! The tests:
//!
//! - [`every_pure_case_conforms`] checks the shape of every case in every
//!   section, and runs the pure sections (L0 segments, L1 path, L1 registry).
//!   It runs with or without the `fs` feature.
//! - [`every_fs_case_conforms`] checks the same shapes, and runs the `fs_*`
//!   sections, which build each case's `tree`, `symlinks` and `unreadable`
//!   directories under a temp dir.
//! - The tests after them add what a case cannot state: the compiled `Matcher`
//!   agrees with the free functions, and overlap is symmetric with a witness
//!   both sides match.

use glob_intersect::{Error, Labeled, Matcher, Options, segments};
use serde_json::{Value as Json, json};

/// Compiled in rather than read at runtime: the test binary then carries the
/// suite, and a moved or deleted suite is a build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/intersect/suite.json");

const SUITE_KEYS: &[&str] = &["family", "reference", "referenceVersion", "sections"];
/// The suite's sections, exactly: one missing from the suite fails as surely as
/// one this crate does not know.
const SECTIONS: &[&str] = &[
    "fs_files_in_scope",
    "fs_resolve_intersection",
    "intersects",
    "matches",
    "overlapping",
    "parse",
    "registry_applicable_to",
    "registry_matching",
    "segments_intersects",
    "segments_matches",
    "segments_witness",
    "which_match",
    "witness",
];
const CASE_KEYS: &[&str] = &["name", "input", "expect", "error", "platforms", "skip"];
const MATCH_OPTS: &[&str] = &["dot", "caseInsensitive", "globstarMatchesZero"];
const FS_SETUP: &[&str] = &["tree", "symlinks", "unreadable", "cwd", "cwdRelative"];
const FS_OPTS: &[&str] = &[
    "dot",
    "caseInsensitive",
    "globstarMatchesZero",
    "ignore",
    "onlyFiles",
    "absolute",
];

/// The input a section's cases take: the keys they must carry, the keys they
/// may carry besides `opts`, and the keys `opts` may carry.
struct Shape {
    required: &'static [&'static str],
    optional: &'static [&'static str],
    opts: &'static [&'static str],
}

const fn pure(required: &'static [&'static str]) -> Shape {
    Shape {
        required,
        optional: &[],
        opts: MATCH_OPTS,
    }
}

/// Every section this crate runs, with its input.
fn shape(section: &str) -> Option<Shape> {
    Some(match section {
        "parse" => Shape {
            required: &["path"],
            optional: &[],
            opts: &["separator"],
        },
        "segments_intersects" | "segments_witness" | "intersects" | "witness" => pure(&["a", "b"]),
        "segments_matches" => pure(&["path", "pattern"]),
        "matches" | "which_match" => pure(&["path", "patterns"]),
        "overlapping" => pure(&["query", "candidates"]),
        "registry_applicable_to" => pure(&["entries", "scope"]),
        "registry_matching" => pure(&["entries", "path"]),
        "fs_files_in_scope" => Shape {
            required: &["tree", "patterns"],
            optional: FS_SETUP,
            opts: FS_OPTS,
        },
        "fs_resolve_intersection" => Shape {
            required: &["tree", "a", "b"],
            optional: FS_SETUP,
            opts: FS_OPTS,
        },
        _ => return None,
    })
}

fn keys(value: &Json) -> Vec<&str> {
    value
        .as_object()
        .map(|o| o.keys().map(String::as_str).collect())
        .unwrap_or_default()
}

/// Panics unless `input` has exactly the shape its section takes.
fn check_input(section: &str, name: &str, input: &Json) {
    let shape = shape(section).expect("a known section");
    assert!(input.is_object(), "{name}: input is not an object");
    for key in keys(input) {
        assert!(
            shape.required.contains(&key) || shape.optional.contains(&key) || key == "opts",
            "{name}: unknown input key {key:?}"
        );
    }
    for key in shape.required {
        assert!(
            input.get(key).is_some(),
            "{name}: missing input key {key:?}"
        );
    }
    if let Some(opts) = input.get("opts") {
        assert!(opts.is_object(), "{name}: opts is not an object");
        for key in keys(opts) {
            assert!(
                shape.opts.contains(&key),
                "{name}: unknown opts key {key:?}"
            );
        }
    }
}

/// Whether a case runs on this host, by its `skip` and `platforms`.
fn runs_here(case: &Json) -> bool {
    if case.get("skip").and_then(|s| s.get("rust")).is_some() {
        return false;
    }
    let host = if cfg!(windows) { "windows" } else { "unix" };
    case.get("platforms")
        .and_then(Json::as_array)
        .is_none_or(|platforms| platforms.iter().any(|p| p == host))
}

// --- Reading a case's inputs ----------------------------------------------

/// `Patterns` — a single string is a one-element set; an array is the set.
fn patterns(input: &Json, key: &str) -> Vec<String> {
    match input.get(key) {
        Some(Json::String(s)) => vec![s.clone()],
        Some(Json::Array(items)) => items
            .iter()
            .map(|i| {
                i.as_str()
                    .unwrap_or_else(|| panic!("input {key:?} holds a non-string {i}"))
                    .to_string()
            })
            .collect(),
        other => panic!("input {key:?} must be a string or string[], got {other:?}"),
    }
}

fn text(input: &Json, key: &str) -> String {
    input
        .get(key)
        .and_then(Json::as_str)
        .unwrap_or_else(|| panic!("input {key:?} must be a string"))
        .to_string()
}

fn opt<'a>(input: &'a Json, key: &str) -> Option<&'a Json> {
    input.get("opts").and_then(|o| o.get(key))
}

fn flag(input: &Json, key: &str) -> Option<bool> {
    opt(input, key).map(|v| {
        v.as_bool()
            .unwrap_or_else(|| panic!("opts.{key} must be a boolean, got {v}"))
    })
}

fn options(input: &Json) -> Options {
    let d = Options::default();
    Options {
        case_insensitive: flag(input, "caseInsensitive").unwrap_or(d.case_insensitive),
        dot: flag(input, "dot").unwrap_or(d.dot),
        globstar_matches_zero: flag(input, "globstarMatchesZero")
            .unwrap_or(d.globstar_matches_zero),
    }
}

fn labeled_entries(input: &Json) -> Vec<Labeled> {
    input
        .get("entries")
        .and_then(Json::as_array)
        .unwrap_or_else(|| panic!("input \"entries\" must be an array"))
        .iter()
        .map(|e| {
            let mut keys = keys(e);
            keys.sort_unstable();
            assert_eq!(keys, ["id", "patterns"], "an entry is {{ id, patterns }}");
            Labeled {
                id: text(e, "id"),
                patterns: patterns(e, "patterns"),
            }
        })
        .collect()
}

fn strings(list: Vec<String>) -> Json {
    Json::Array(list.into_iter().map(Json::String).collect())
}

// --- Running a case --------------------------------------------------------

/// Run one case of a pure section, its result as JSON.
fn run_pure(section: &str, input: &Json) -> Result<Json, Error> {
    let opts = options(input);
    Ok(match section {
        "parse" => strings(match opt(input, "separator") {
            Some(sep) => glob_intersect::parse_with(
                &text(input, "path"),
                sep.as_str().expect("opts.separator is a string"),
            ),
            None => glob_intersect::parse(&text(input, "path")),
        }),
        "segments_intersects" => json!(segments::intersects(
            &patterns(input, "a"),
            &patterns(input, "b"),
            opts
        )?),
        "segments_matches" => json!(segments::matches(
            &patterns(input, "path"),
            &patterns(input, "pattern"),
            opts
        )?),
        "segments_witness" => {
            match segments::witness(&patterns(input, "a"), &patterns(input, "b"), opts)? {
                Some(w) => strings(w),
                None => Json::Null,
            }
        }
        "intersects" => json!(glob_intersect::intersects(
            &patterns(input, "a"),
            &patterns(input, "b"),
            opts
        )?),
        "matches" => json!(glob_intersect::matches(
            &text(input, "path"),
            &patterns(input, "patterns"),
            opts
        )?),
        "which_match" => strings(glob_intersect::which_match(
            &text(input, "path"),
            &patterns(input, "patterns"),
            opts,
        )?),
        "overlapping" => strings(glob_intersect::overlapping(
            &patterns(input, "query"),
            &patterns(input, "candidates"),
            opts,
        )?),
        "witness" => {
            match glob_intersect::witness(&patterns(input, "a"), &patterns(input, "b"), opts)? {
                Some(w) => Json::String(w),
                None => Json::Null,
            }
        }
        "registry_applicable_to" => {
            let registry = glob_intersect::index(labeled_entries(input), opts)?;
            strings(registry.applicable_to(&patterns(input, "scope"))?)
        }
        "registry_matching" => {
            let registry = glob_intersect::index(labeled_entries(input), opts)?;
            strings(registry.matching(&text(input, "path")))
        }
        other => panic!("not a pure section: {other}"),
    })
}

/// What a case gives, as the suite writes it: `{ "expect": ... }` or
/// `{ "error": { "kind": ... } }`. The kind is the error's code in lower case.
fn outcome(result: Result<Json, Error>) -> Json {
    match result {
        Ok(value) => json!({ "expect": value }),
        Err(err) => json!({ "error": { "kind": err.code().to_lowercase() } }),
    }
}

/// What the case says it gives, in the same shape as [`outcome`].
fn wanted(name: &str, case: &Json) -> Json {
    match (case.get("expect"), case.get("error")) {
        (Some(expect), None) => json!({ "expect": expect }),
        (None, Some(error)) => {
            // The two implementations' messages differ, so a case compares
            // the kind alone.
            assert_eq!(keys(error), ["kind"], "{name}: error holds only kind");
            json!({ "error": error })
        }
        _ => panic!("{name}: give exactly one of expect and error"),
    }
}

// --- The fs sections -------------------------------------------------------

/// Without the `fs` feature [`every_fs_case_conforms`], the only caller, is
/// ignored, so this never runs.
#[cfg(not(feature = "fs"))]
fn run_fs(_section: &str, _input: &Json) -> Option<Json> {
    unreachable!("the fs cases are ignored without the fs feature")
}

/// Where `to` is, written relative to `from`. Both must be absolute.
#[cfg(feature = "fs")]
fn relative_path(from: &std::path::Path, to: &std::path::Path) -> std::path::PathBuf {
    let from: Vec<_> = from.components().collect();
    let to: Vec<_> = to.components().collect();
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    let mut out = std::path::PathBuf::new();
    for _ in common..from.len() {
        out.push("..");
    }
    for component in &to[common..] {
        out.push(component.as_os_str());
    }
    out
}

/// Create the case's symbolic links, `{ link: target }`, the target written as
/// given. The suite keeps a case with links to `unix`.
#[cfg(feature = "fs")]
fn link_all(root: &std::path::Path, links: &serde_json::Map<String, Json>) {
    #[cfg(unix)]
    for (link, target) in links {
        let abs = root.join(link);
        if let Some(parent) = abs.parent() {
            std::fs::create_dir_all(parent).expect("create link dirs");
        }
        std::os::unix::fs::symlink(target.as_str().expect("a link target is a string"), &abs)
            .expect("create symlink");
    }
    #[cfg(not(unix))]
    assert!(
        links.is_empty(),
        "a case with symlinks runs on unix only; mark it so"
    );
    let _ = root;
}

/// Set each directory's mode. The suite keeps a case with `unreadable` to
/// `unix`.
#[cfg(feature = "fs")]
fn set_modes(root: &std::path::Path, dirs: &[String], mode: u32) {
    #[cfg(unix)]
    for dir in dirs {
        use std::os::unix::fs::PermissionsExt;
        let set = std::fs::set_permissions(root.join(dir), std::fs::Permissions::from_mode(mode));
        // Locking must succeed, or the case would run against a readable
        // directory. Unlocking is best effort: the temp dir goes either way.
        if mode == 0o000 {
            set.unwrap_or_else(|e| panic!("lock {dir}: {e}"));
        }
    }
    #[cfg(not(unix))]
    assert!(
        dirs.is_empty(),
        "a case with unreadable runs on unix only; mark it so"
    );
    let _ = (root, mode);
}

/// Run one case of an `fs_*` section: build its tree under a temp dir, run the
/// op there, and give the paths as the suite states them, `/`-separated and
/// relative to the temp dir. With `opts.absolute` each path must be absolute
/// and under the temp dir. `None`, not run, when the case locks a directory and
/// mode 000 does not stop a read here, as when running as root.
#[cfg(feature = "fs")]
fn run_fs(section: &str, input: &Json) -> Option<Json> {
    use glob_intersect::fs::{FsOptions, files_in_scope, resolve_intersection};

    let dir = tempfile::tempdir().expect("temp dir");
    let root = dir.path();
    for rel in patterns(input, "tree") {
        let target = root.join(&rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).expect("create tree dirs");
        }
        std::fs::write(&target, "").expect("create tree file");
    }
    let no_links = serde_json::Map::new();
    link_all(
        root,
        input
            .get("symlinks")
            .map_or(&no_links, |l| l.as_object().expect("symlinks is an object")),
    );
    let locked = input
        .get("unreadable")
        .map(|_| patterns(input, "unreadable"))
        .unwrap_or_default();
    set_modes(root, &locked, 0o000);
    if locked
        .iter()
        .any(|d| std::fs::read_dir(root.join(d)).is_ok())
    {
        set_modes(root, &locked, 0o755);
        return None;
    }

    let mut cwd = match input.get("cwd") {
        Some(sub) => root.join(sub.as_str().expect("cwd is a string")),
        None => root.to_path_buf(),
    };
    if input.get("cwdRelative").is_some_and(|v| v == &json!(true)) {
        cwd = relative_path(&std::env::current_dir().expect("process cwd"), &cwd);
    }
    let absolute = flag(input, "absolute").unwrap_or(false);
    let opts = FsOptions {
        options: options(input),
        cwd: Some(cwd),
        ignore: opt(input, "ignore")
            .map(|i| patterns(&json!({ "ignore": i }), "ignore"))
            .unwrap_or_default(),
        only_files: flag(input, "onlyFiles").unwrap_or(true),
        absolute,
    };
    let result = match section {
        "fs_files_in_scope" => files_in_scope(&patterns(input, "patterns"), &opts),
        "fs_resolve_intersection" => {
            resolve_intersection(&patterns(input, "a"), &patterns(input, "b"), &opts)
        }
        other => panic!("not an fs section: {other}"),
    };
    set_modes(root, &locked, 0o755);
    let result = result.map(|paths| {
        if !absolute {
            return strings(paths);
        }
        strings(
            paths
                .into_iter()
                .map(|p| {
                    let rel = std::path::Path::new(&p)
                        .strip_prefix(root)
                        .unwrap_or_else(|_| panic!("{p} is not under {}", root.display()));
                    assert!(
                        std::path::Path::new(&p).is_absolute(),
                        "{p} is not absolute"
                    );
                    rel.components()
                        .map(|c| c.as_os_str().to_string_lossy().into_owned())
                        .collect::<Vec<_>>()
                        .join("/")
                })
                .collect(),
        )
    });
    Some(outcome(result))
}

// --- The suite -------------------------------------------------------------

/// Check every case in the suite, then run those of the `fs_*` sections when
/// `fs`, else those of the pure sections. Both tests check every case, so a
/// malformed `fs_*` case fails even where the fs test is ignored. A failure
/// lists every offending case by section and name rather than stopping at the
/// first.
fn conform(fs: bool) {
    let suite: Json = serde_json::from_str(SUITE_JSON).expect("the suite is valid JSON");
    let mut top = keys(&suite);
    top.sort_unstable();
    let mut want = SUITE_KEYS.to_vec();
    want.sort_unstable();
    assert_eq!(top, want, "the suite's top-level keys");
    assert_eq!(suite["family"], "intersect");
    assert_eq!(suite["reference"], "ts");
    let sections = suite["sections"]
        .as_object()
        .expect("sections is an object");
    let mut names: Vec<&str> = sections.keys().map(String::as_str).collect();
    names.sort_unstable();
    let mut known = SECTIONS.to_vec();
    known.sort_unstable();
    assert_eq!(names, known, "the suite's sections are not the ones this crate runs");

    let mut failures: Vec<String> = Vec::new();
    let mut not_run: Vec<String> = Vec::new();
    let mut ran = 0;
    for (section, body) in sections {
        assert!(
            shape(section).is_some(),
            "the suite has a section this crate does not run: {section}"
        );
        let cases = body["cases"].as_array().expect("cases is an array");
        for case in cases {
            let name = case["name"].as_str().expect("a case has a name");
            for key in keys(case) {
                assert!(CASE_KEYS.contains(&key), "{name}: unknown case key {key:?}");
            }
            let want = wanted(name, case);
            check_input(section, name, &case["input"]);
            if section.starts_with("fs_") != fs || !runs_here(case) {
                continue;
            }
            let got = if fs {
                let Some(got) = run_fs(section, &case["input"]) else {
                    not_run.push(format!("[{section}: {name}]"));
                    continue;
                };
                got
            } else {
                outcome(run_pure(section, &case["input"]))
            };
            if got == want {
                ran += 1;
            } else {
                failures.push(format!("  [{section}: {name}] got {got}, want {want}"));
            }
        }
    }

    // Mode 000 stops a read everywhere but as root. Anywhere else, a case that
    // could not run is a failure.
    if !not_run.is_empty() {
        if running_as_root() {
            eprintln!(
                "conformance suite: {} not run as root: {}",
                not_run.len(),
                not_run.join(" ")
            );
        } else {
            failures.push(format!("  could not run: {}", not_run.join(" ")));
        }
    }
    assert!(ran > 0, "no case ran");
    assert!(
        failures.is_empty(),
        "conformance failures:\n{}",
        failures.join("\n")
    );
}

/// Every case of the pure sections, with or without the `fs` feature.
#[test]
fn every_pure_case_conforms() {
    conform(false);
}

/// Every case of the `fs_*` sections. Without the `fs` feature it is ignored,
/// so `cargo test` reports it as ignored rather than passing it.
#[test]
#[cfg_attr(not(feature = "fs"), ignore = "needs the fs feature")]
fn every_fs_case_conforms() {
    conform(true);
}

/// Is this process root? Detected by whether mode 000 stops a read of a probe
/// directory, since the crate takes no libc dependency.
fn running_as_root() -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let probe = tempfile::tempdir().expect("probe dir");
        let sub = probe.path().join("p");
        std::fs::create_dir(&sub).expect("probe subdir");
        std::fs::set_permissions(&sub, std::fs::Permissions::from_mode(0o000)).expect("lock");
        let readable = std::fs::read_dir(&sub).is_ok();
        let _ = std::fs::set_permissions(&sub, std::fs::Permissions::from_mode(0o755));
        readable
    }
    #[cfg(not(unix))]
    {
        false
    }
}

// --- What a case cannot state --------------------------------------------

/// The compiled `Matcher` is an amortization, not a second dialect: it must
/// answer exactly what the free functions answer. (A caller testing one claim
/// against many uses the compiled form; the suite exercises the free one.)
#[test]
fn the_compiled_matcher_agrees_with_the_free_functions() {
    let opts = Options::default();
    let claim = ["src/api/**", "src/db/schema.ts"];
    let other = ["src/api/routes/*.ts", "docs/**"];
    let compiled = Matcher::new(&claim, opts).expect("supported patterns");

    assert_eq!(
        compiled.intersects(&other).unwrap(),
        glob_intersect::intersects(&claim, &other, opts).unwrap()
    );
    assert_eq!(
        compiled.matches("src/api/user.ts"),
        glob_intersect::matches("src/api/user.ts", &claim, opts).unwrap()
    );
    assert_eq!(
        compiled.witness(&other).unwrap(),
        glob_intersect::witness(&claim, &other, opts).unwrap()
    );
    // The two `overlapping` conventions filter opposite sides — the free
    // function returns a subset of its FIRST argument, the method a subset of
    // ITS argument.
    assert_eq!(
        compiled.overlapping(&other).unwrap(),
        ["src/api/routes/*.ts"]
    );
    assert_eq!(
        glob_intersect::overlapping(&claim, &other, opts).unwrap(),
        ["src/api/**"]
    );
}

/// Overlap is symmetric, and a witness is a real path both sides match — the
/// two properties a scheduler leans on when it reports "task A conflicts with
/// task B at X". Checked across every pure pattern pair the suite mentions,
/// not just the pairs it happens to assert.
#[test]
fn overlap_is_symmetric_and_every_witness_matches_both_sides() {
    let opts = Options::default();
    let corpus = [
        "src/api/**",
        "src/**/*.ts",
        "src/api/handler.ts",
        "src/web/**",
        "**/*.{vue,html,jsx}",
        "**/*.vue",
        "src/siteA/components",
        "src/siteA/components/**",
        "a/**/b",
        "a/b",
        "file?.ts",
        "file[0-9].ts",
        "file[!0-9].ts",
        "*.env",
        ".env",
        "docs/**",
    ];
    for a in corpus {
        for b in corpus {
            let ab = glob_intersect::intersects(&[a], &[b], opts).unwrap();
            let ba = glob_intersect::intersects(&[b], &[a], opts).unwrap();
            assert_eq!(ab, ba, "{a} vs {b}: overlap is not symmetric");

            let w = glob_intersect::witness(&[a], &[b], opts).unwrap();
            assert_eq!(
                w.is_some(),
                ab,
                "{a} vs {b}: witness disagrees with overlap"
            );
            if let Some(w) = w {
                assert!(
                    glob_intersect::matches(&w, &[a], opts).unwrap(),
                    "{a} vs {b}: witness {w:?} does not match {a}"
                );
                assert!(
                    glob_intersect::matches(&w, &[b], opts).unwrap(),
                    "{a} vs {b}: witness {w:?} does not match {b}"
                );
            }
        }
    }
}

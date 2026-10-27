//! The shared intersect conformance corpus, run against the Rust twin.
//!
//! The corpus is the data-driven spec for the library: each `*.cases.json` file
//! specifies one area's intended behavior as a list of cases. It is
//! language-neutral. Its home is the `@osdlc/intersect` package
//! (`packages/ts/intersect/fixtures/`), and this file reads it there, in place,
//! at run time, so the two twins can never test against different copies.
//!
//! Both halves also schema-lint the corpus, so a malformed case is caught by
//! whichever tier runs first rather than silently skipped.
//!
//! - [`shared_conformance_corpus`] runs every pure case (L0 segments, L1 path,
//!   L1 registry) — the same set the TypeScript `tests/fixtures.test.ts` runs.
//! - [`filesystem_corpus`] runs the `fs.*` namespace as integration tests,
//!   materializing each case's `tree`, `symlinks` and `unreadable` directories
//!   under a temp dir exactly as the TypeScript `tests/fs.test.ts` harness does,
//!   and comparing results in order.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use glob_intersect::{Error, Labeled, Matcher, Options, segments};
use serde_json::{Value as Json, json};

/// The `@osdlc/intersect` corpus directory, read in place.
fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ts/intersect/fixtures")
}

/// The case files the corpus holds. The harness reads every `*.cases.json` in
/// the directory; this list guards against one going missing unnoticed.
const EXPECTED_FILES: &[&str] = &[
    "fs.cases.json",
    "options.cases.json",
    "overlapping-witness.cases.json",
    "parse.cases.json",
    "path.cases.json",
    "registry.cases.json",
    "segments.cases.json",
];

/// Every `*.cases.json` in the corpus, as (basename, contents), sorted by name.
fn read_corpus() -> Vec<(String, String)> {
    let dir = corpus_dir();
    let mut files: Vec<(String, String)> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("corpus dir {} unreadable: {e}", dir.display()))
        .map(|entry| entry.expect("corpus dir entry").path())
        .filter(|p| p.to_string_lossy().ends_with(".cases.json"))
        .map(|p| {
            let name = p
                .file_name()
                .expect("file name")
                .to_string_lossy()
                .into_owned();
            let text = std::fs::read_to_string(&p)
                .unwrap_or_else(|e| panic!("corpus file {} unreadable: {e}", p.display()));
            (name, text)
        })
        .collect();
    files.sort();
    for want in EXPECTED_FILES {
        assert!(
            files.iter().any(|(name, _)| name == want),
            "corpus file {want} missing from {}",
            dir.display()
        );
    }
    files
}

/// Every operation a case may target, across all three layers plus the registry.
const OP_NAMES: &[&str] = &[
    "parse",
    "segments.intersects",
    "segments.matches",
    "segments.witness",
    "intersects",
    "matches",
    "whichMatch",
    "overlapping",
    "witness",
    "registry.applicableTo",
    "registry.matching",
    "fs.filesInScope",
    "fs.resolveIntersection",
];

/// The input fields each operation reads off a case. The shape guard requires
/// them.
fn op_inputs(op: &str) -> &'static [&'static str] {
    match op {
        "parse" => &["path"],
        "segments.intersects"
        | "segments.witness"
        | "intersects"
        | "witness"
        | "fs.resolveIntersection" => &["a", "b"],
        "segments.matches" => &["path", "pattern"],
        "matches" | "whichMatch" => &["path", "patterns"],
        "overlapping" => &["query", "candidates"],
        "registry.applicableTo" => &["entries", "scope"],
        "registry.matching" => &["entries", "path"],
        "fs.filesInScope" => &["patterns"],
        _ => &[],
    }
}

// --- Loading + the shape guard --------------------------------------------

struct CaseFile {
    file: String,
    op: String,
    cases: Vec<Json>,
}

/// The op a case actually exercises: its own `op` override, else the file
/// default.
fn effective_op(file: &CaseFile, case: &Json) -> String {
    case.get("op")
        .and_then(Json::as_str)
        .unwrap_or(&file.op)
        .to_string()
}

/// Parse and validate every case file, panicking (naming the file) on a
/// malformed one. A port of the TypeScript `assertCaseFile`, so the corpus is
/// linted identically from both sides.
fn load_case_files() -> Vec<CaseFile> {
    read_corpus()
        .into_iter()
        .map(|(file, source)| {
            let where_ = format!("fixture {file}");
            let parsed: Json = serde_json::from_str(&source)
                .unwrap_or_else(|e| panic!("{where_}: not valid JSON: {e}"));
            let root = parsed
                .as_object()
                .unwrap_or_else(|| panic!("{where_}: top level must be an object"));

            let op = root
                .get("op")
                .and_then(Json::as_str)
                .filter(|o| OP_NAMES.contains(o))
                .unwrap_or_else(|| {
                    panic!(
                        "{where_}: \"op\" must be one of {{{}}}",
                        OP_NAMES.join(", ")
                    )
                })
                .to_string();
            let cases = root
                .get("cases")
                .and_then(Json::as_array)
                .unwrap_or_else(|| panic!("{where_}: \"cases\" must be an array"))
                .clone();

            let mut seen: HashSet<&str> = HashSet::new();
            for (i, case) in cases.iter().enumerate() {
                let at = format!("{where_} case[{i}]");
                assert!(case.is_object(), "{at}: must be an object");
                let name = case
                    .get("name")
                    .and_then(Json::as_str)
                    .filter(|n| !n.is_empty())
                    .unwrap_or_else(|| panic!("{at}: \"name\" must be a non-empty string"));
                let at = format!("{at} ({name})");
                assert!(seen.insert(name), "{at}: duplicate case name");

                if let Some(o) = case.get("op") {
                    assert!(
                        o.as_str().is_some_and(|o| OP_NAMES.contains(&o)),
                        "{at}: \"op\" override must be a known op name (got {o})",
                    );
                }
                for flag in ["throws", "pending", "cwdRelative"] {
                    if let Some(v) = case.get(flag) {
                        assert!(v.is_boolean(), "{at}: \"{flag}\" must be a boolean");
                    }
                }
                for field in ["code", "cwd"] {
                    if let Some(v) = case.get(field) {
                        assert!(v.is_string(), "{at}: \"{field}\" must be a string");
                    }
                }
                assert!(
                    case.get("code").is_none() || case.get("throws") == Some(&json!(true)),
                    "{at}: \"code\" needs \"throws\": true",
                );
                if let Some(v) = case.get("symlinks") {
                    assert!(
                        v.is_object(),
                        "{at}: \"symlinks\" must be an object of link to target",
                    );
                }
                if let Some(v) = case.get("unreadable") {
                    assert!(
                        v.is_array(),
                        "{at}: \"unreadable\" must be an array of directory paths",
                    );
                }
                assert!(
                    case.get("expect").is_some() || case.get("throws") == Some(&json!(true)),
                    "{at}: needs an \"expect\" value or \"throws\": true",
                );

                let op2 = case.get("op").and_then(Json::as_str).unwrap_or(&op);
                for field in op_inputs(op2) {
                    assert!(
                        case.get(field).is_some(),
                        "{at}: op {op2} requires input field \"{field}\"",
                    );
                }
            }

            CaseFile {
                file,
                op,
                cases: cases.clone(),
            }
        })
        .collect()
}

// --- Reading a case's inputs ----------------------------------------------

/// `Patterns` — a single string is a one-element set; an array is the set.
fn patterns(case: &Json, key: &str) -> Vec<String> {
    match case.get(key) {
        Some(Json::String(s)) => vec![s.clone()],
        Some(Json::Array(items)) => items
            .iter()
            .map(|i| i.as_str().unwrap_or_default().to_string())
            .collect(),
        other => panic!("input {key:?} must be a string or string[], got {other:?}"),
    }
}

fn text(case: &Json, key: &str) -> String {
    case.get(key)
        .and_then(Json::as_str)
        .unwrap_or_else(|| panic!("input {key:?} must be a string"))
        .to_string()
}

fn options(case: &Json) -> Options {
    let d = Options::default();
    let Some(o) = case.get("opts") else { return d };
    Options {
        case_insensitive: o
            .get("caseInsensitive")
            .and_then(Json::as_bool)
            .unwrap_or(d.case_insensitive),
        dot: o.get("dot").and_then(Json::as_bool).unwrap_or(d.dot),
        globstar_matches_zero: o
            .get("globstarMatchesZero")
            .and_then(Json::as_bool)
            .unwrap_or(d.globstar_matches_zero),
    }
}

fn labeled_entries(case: &Json) -> Vec<Labeled> {
    case.get("entries")
        .and_then(Json::as_array)
        .unwrap_or_else(|| panic!("input \"entries\" must be an array"))
        .iter()
        .map(|e| Labeled {
            id: text(e, "id"),
            patterns: patterns(e, "patterns"),
        })
        .collect()
}

fn strings(list: Vec<String>) -> Json {
    Json::Array(list.into_iter().map(Json::String).collect())
}

// --- Dispatch --------------------------------------------------------------

/// Run one pure case and return its result as JSON, ready for a deep-equality
/// comparison against the case's `expect`. `Err` is the corpus's `throws: true`.
fn run_pure(op: &str, case: &Json) -> Result<Json, Error> {
    let opts = options(case);
    Ok(match op {
        "parse" => {
            let separator = case
                .get("opts")
                .and_then(|o| o.get("separator"))
                .and_then(Json::as_str);
            strings(match separator {
                Some(sep) => glob_intersect::parse_with(&text(case, "path"), sep),
                None => glob_intersect::parse(&text(case, "path")),
            })
        }
        "segments.intersects" => json!(segments::intersects(
            &patterns(case, "a"),
            &patterns(case, "b"),
            opts
        )?),
        "segments.matches" => json!(segments::matches(
            &patterns(case, "path"),
            &patterns(case, "pattern"),
            opts
        )?),
        "segments.witness" => {
            match segments::witness(&patterns(case, "a"), &patterns(case, "b"), opts)? {
                Some(w) => strings(w),
                None => Json::Null,
            }
        }
        "intersects" => json!(glob_intersect::intersects(
            &patterns(case, "a"),
            &patterns(case, "b"),
            opts
        )?),
        "matches" => json!(glob_intersect::matches(
            &text(case, "path"),
            &patterns(case, "patterns"),
            opts
        )?),
        "whichMatch" => strings(glob_intersect::which_match(
            &text(case, "path"),
            &patterns(case, "patterns"),
            opts,
        )?),
        "overlapping" => strings(glob_intersect::overlapping(
            &patterns(case, "query"),
            &patterns(case, "candidates"),
            opts,
        )?),
        "witness" => {
            match glob_intersect::witness(&patterns(case, "a"), &patterns(case, "b"), opts)? {
                Some(w) => Json::String(w),
                None => Json::Null,
            }
        }
        "registry.applicableTo" => {
            let registry = glob_intersect::index(labeled_entries(case), opts)?;
            strings(registry.applicable_to(&patterns(case, "scope"))?)
        }
        "registry.matching" => {
            let registry = glob_intersect::index(labeled_entries(case), opts)?;
            strings(registry.matching(&text(case, "path")))
        }
        other => panic!("unknown op {other:?}"),
    })
}

/// Compare an actual result against the case's stated expectation. A
/// `throws: true` case needs an error, and, when it names a `code`, that one.
fn check(case: &Json, actual: Result<Json, Error>) -> Result<(), String> {
    let wants_throw = case.get("throws") == Some(&json!(true));
    match (actual, wants_throw) {
        (Err(e), true) => match case.get("code").and_then(Json::as_str) {
            Some(code) if code != e.code() => Err(format!(
                "expected error code {code}, got {} ({e})",
                e.code()
            )),
            _ => Ok(()),
        },
        (Err(e), false) => Err(format!("unexpected error: {e}")),
        (Ok(got), true) => Err(format!("expected a refusal, got {got}")),
        (Ok(got), false) => {
            let want = case.get("expect").unwrap_or(&Json::Null);
            if &got == want {
                Ok(())
            } else {
                Err(format!("got {got}, want {want}"))
            }
        }
    }
}

// --- The pure corpus -------------------------------------------------------

/// Every pure case in the shared corpus, one test. A failure aggregates every
/// offending case by file and name rather than stopping at the first, so a drift
/// shows its full blast radius.
#[test]
fn shared_conformance_corpus() {
    let files = load_case_files();
    let mut failures: Vec<String> = Vec::new();
    let mut summary: Vec<String> = Vec::new();

    for file in &files {
        let (mut passed, mut skipped, mut failed) = (0, 0, 0);
        for case in &file.cases {
            let op = effective_op(file, case);
            let name = case
                .get("name")
                .and_then(Json::as_str)
                .unwrap_or("<unnamed>");
            // The `fs.*` namespace reads disk; it runs in `filesystem_corpus`,
            // mirroring the TypeScript harness's split.
            if op.starts_with("fs.") || case.get("pending") == Some(&json!(true)) {
                skipped += 1;
                continue;
            }
            match check(case, run_pure(&op, case)) {
                Ok(()) => passed += 1,
                Err(msg) => {
                    failed += 1;
                    failures.push(format!("  [{}: {name}] {msg}", file.file));
                }
            }
        }
        summary.push(format!(
            "{:>32}  {passed} passed, {failed} failed, {skipped} not run here",
            file.file
        ));
    }

    println!(
        "shared conformance corpus (pure ops):\n{}",
        summary.join("\n")
    );
    assert!(
        failures.is_empty(),
        "conformance corpus failures:\n{}",
        failures.join("\n")
    );
}

// --- The filesystem corpus -------------------------------------------------

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

/// Is this process root? Detected by whether mode 000 stops a read of a probe
/// directory, since the crate takes no libc dependency.
#[cfg(feature = "fs")]
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

/// Create the case's symbolic links, `{ link: target }`, the target written as
/// given. Returns `false` when the platform cannot (Windows), so the case skips.
#[cfg(feature = "fs")]
fn link_all(root: &std::path::Path, links: &serde_json::Map<String, Json>) -> bool {
    if links.is_empty() {
        return true;
    }
    #[cfg(unix)]
    {
        for (link, target) in links {
            let abs = root.join(link);
            if let Some(parent) = abs.parent() {
                std::fs::create_dir_all(parent).expect("create link dirs");
            }
            std::os::unix::fs::symlink(target.as_str().unwrap_or_default(), &abs)
                .expect("create symlink");
        }
        true
    }
    #[cfg(not(unix))]
    {
        false
    }
}

/// Make the case's directories unreadable (mode 000). Returns `false` when that
/// does not stop a read (Windows, or running as root), so the case skips.
#[cfg(feature = "fs")]
fn lock_all(root: &std::path::Path, dirs: &[Json]) -> bool {
    if dirs.is_empty() {
        return true;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for dir in dirs {
            let abs = root.join(dir.as_str().unwrap_or_default());
            std::fs::set_permissions(&abs, std::fs::Permissions::from_mode(0o000))
                .expect("lock directory");
        }
        dirs.iter()
            .all(|dir| std::fs::read_dir(root.join(dir.as_str().unwrap_or_default())).is_err())
    }
    #[cfg(not(unix))]
    {
        false
    }
}

/// Give the locked directories their permissions back so the temp dir can be
/// removed.
#[cfg(feature = "fs")]
fn unlock_all(root: &std::path::Path, dirs: &[Json]) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for dir in dirs {
            let abs = root.join(dir.as_str().unwrap_or_default());
            let _ = std::fs::set_permissions(&abs, std::fs::Permissions::from_mode(0o755));
        }
    }
    #[cfg(not(unix))]
    let _ = (root, dirs);
}

/// The `fs.*` namespace, run as integration tests: each case's `tree` is
/// materialized (files created empty) under a fresh temp dir, then its
/// `symlinks` are created and its `unreadable` directories locked, the op runs
/// with `cwd` set as the case asks, and the result is compared IN ORDER (results
/// are sorted by code point; with `opts.absolute` each `expect` entry resolves
/// against the temp dir). A case the platform cannot run is skipped and
/// reported. This is the contract `fixtures/README.md` states and the
/// TypeScript `tests/fs.test.ts` harness implements.
#[cfg(feature = "fs")]
#[test]
fn filesystem_corpus() {
    use glob_intersect::fs::{FsOptions, files_in_scope, resolve_intersection};

    let files = load_case_files();
    let mut failures: Vec<String> = Vec::new();
    let mut passed = 0;
    let mut skipped: Vec<String> = Vec::new();

    for file in &files {
        for case in &file.cases {
            let op = effective_op(file, case);
            if !op.starts_with("fs.") || case.get("pending") == Some(&json!(true)) {
                continue;
            }
            let name = case
                .get("name")
                .and_then(Json::as_str)
                .unwrap_or("<unnamed>");
            let tree = case
                .get("tree")
                .and_then(Json::as_array)
                .unwrap_or_else(|| panic!("{name}: every fs case must declare a \"tree\""));

            let dir = tempfile::tempdir().expect("temp dir");
            let root = dir.path();
            for rel in tree {
                let rel = rel.as_str().unwrap_or_default();
                let target = root.join(rel);
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent).expect("create tree dirs");
                }
                std::fs::write(&target, "").expect("create tree file");
            }
            let empty_links = serde_json::Map::new();
            let links = case
                .get("symlinks")
                .and_then(Json::as_object)
                .unwrap_or(&empty_links);
            let locked: &[Json] = case
                .get("unreadable")
                .and_then(Json::as_array)
                .map_or(&[], Vec::as_slice);
            let runnable = link_all(root, links) && lock_all(root, locked);
            if !runnable {
                unlock_all(root, locked);
                // Only Windows and root may skip; elsewhere a skip is a failure.
                if cfg!(unix) && !running_as_root() {
                    failures.push(format!(
                        "  [{}: {name}] could not be run on this platform",
                        file.file
                    ));
                } else {
                    skipped.push(format!("[{}: {name}]", file.file));
                }
                continue;
            }

            let mut cwd = match case.get("cwd").and_then(Json::as_str) {
                Some(sub) => root.join(sub),
                None => root.to_path_buf(),
            };
            if case.get("cwdRelative") == Some(&json!(true)) {
                cwd = relative_path(&std::env::current_dir().expect("process cwd"), &cwd);
            }
            let absolute = case
                .get("opts")
                .and_then(|o| o.get("absolute"))
                .and_then(Json::as_bool)
                .unwrap_or(false);
            let opts = FsOptions {
                options: options(case),
                cwd: Some(cwd),
                ignore: case
                    .get("opts")
                    .and_then(|o| o.get("ignore"))
                    .map(|i| patterns(&json!({ "ignore": i }), "ignore"))
                    .unwrap_or_default(),
                only_files: case
                    .get("opts")
                    .and_then(|o| o.get("onlyFiles"))
                    .and_then(Json::as_bool)
                    .unwrap_or(true),
                absolute,
            };

            let actual = match op.as_str() {
                "fs.filesInScope" => files_in_scope(&patterns(case, "patterns"), &opts),
                "fs.resolveIntersection" => {
                    resolve_intersection(&patterns(case, "a"), &patterns(case, "b"), &opts)
                }
                other => panic!("unknown fs op {other:?}"),
            };
            unlock_all(root, locked);

            // With `absolute`, the case states relative paths; they resolve
            // against the temp dir.
            let mut normalized = case.clone();
            if let (Some(obj), Some(Json::Array(items))) =
                (normalized.as_object_mut(), case.get("expect"))
            {
                let want: Vec<String> = items
                    .iter()
                    .map(|i| {
                        let rel = i.as_str().unwrap_or_default();
                        if absolute {
                            root.join(rel).to_string_lossy().into_owned()
                        } else {
                            rel.to_string()
                        }
                    })
                    .collect();
                obj.insert("expect".to_string(), strings(want));
            }

            match check(&normalized, actual.map(strings)) {
                Ok(()) => passed += 1,
                Err(msg) => failures.push(format!("  [{}: {name}] {msg}", file.file)),
            }
        }
    }

    println!(
        "filesystem corpus: {passed} passed, {} failed, {} skipped on this platform {}",
        failures.len(),
        skipped.len(),
        skipped.join(" ")
    );
    assert!(
        failures.is_empty(),
        "filesystem corpus failures:\n{}",
        failures.join("\n")
    );
}

// --- Guards the corpus does not express -----------------------------------

/// The compiled `Matcher` is an amortization, not a second dialect: it must
/// answer exactly what the free functions answer. (The scheduler hot path uses
/// the compiled form; the corpus exercises the free one.)
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
/// task B at X". Checked across every pure pattern pair the corpus mentions,
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

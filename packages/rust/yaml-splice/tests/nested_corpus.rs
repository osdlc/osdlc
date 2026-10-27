//! The nested-edit corpus: the contract for editing keys below the top level.
//!
//! The cases are language-neutral JSON at `tests/fixtures/nested.json`, in the
//! shape of `conformance.json` plus two fields: `tier` (1 block mappings,
//! 2 block sequences, 3 flow collections) and `category`. Paths are JSON
//! arrays of strings (keys) and integers (indices). Edits are tagged
//! `SetPath { path, value }`, `RemovePath { path }` or
//! `RenamePath { path, to }`; the top-level `Set`, `Remove` and `Rename` may
//! appear in the same batch.
//!
//! The corpus was written before the implementation. Two tests read it:
//!
//! - [`the_corpus_is_consistent`] checks the expectations themselves: each
//!   expected output must parse to the source with the edit applied in memory.
//!   It does not call the edit functions, so it runs from the start.
//! - [`cases_pass`] runs the edit functions on the cases of every tier in
//!   [`ENABLED_TIERS`]. Cases of other tiers are reported as pending.

use std::collections::BTreeMap;

mod model;

use model::{PathEdit, Seg, apply, read};

use serde_json::Value as Json;
use yaml_splice::Value;

const CORPUS: &str = include_str!("fixtures/nested.json");
const CONFORMANCE: &str = include_str!("fixtures/conformance.json");

/// The tiers whose cases must pass. Raised as each tier is implemented.
const ENABLED_TIERS: &[u64] = &[];

const CATEGORIES: &[(&str, u64)] = &[
    ("set-existing", 1),
    ("set-to-block", 1),
    ("append-leaf", 1),
    ("create-intermediates", 1),
    ("remove", 1),
    ("rename", 1),
    ("no-op", 1),
    ("case", 1),
    ("batch", 1),
    ("refusals", 1),
    ("seq-index", 2),
    ("seq-append-remove", 2),
    ("flow-scalar", 3),
    ("flow-edit", 3),
];

struct Case {
    name: String,
    tier: u64,
    category: String,
    source: String,
    edits: Vec<PathEdit>,
    case_sensitive: bool,
    expect: Expect,
}

enum Expect {
    Bytes { changed: bool, bytes: String },
    Error(String),
}

fn corpus() -> Vec<Case> {
    let root: Json = serde_json::from_str(CORPUS).expect("nested.json is valid JSON");
    root.as_array()
        .expect("nested.json is a JSON array")
        .iter()
        .map(|fx| decode_case(fx).unwrap_or_else(|e| panic!("{e}: {fx}")))
        .collect()
}

/// The refusal codes a case may expect: the `EditError` variant names.
const ERRORS: &[&str] = &[
    "AmbiguousKey",
    "MissingKey",
    "KeyConflict",
    "InvalidResult",
    "PathNotFound",
    "PathTypeMismatch",
    "UnsupportedPath",
];

#[test]
fn the_corpus_covers_every_category() {
    let cases = corpus();
    let mut names = std::collections::BTreeSet::new();
    for c in &cases {
        assert!(names.insert(&c.name), "duplicate case name {}", c.name);
        let tier = CATEGORIES
            .iter()
            .find(|(cat, _)| *cat == c.category)
            .map(|(_, t)| *t);
        assert_eq!(
            tier,
            Some(c.tier),
            "[{}] category and tier disagree",
            c.name
        );
        if let Expect::Error(code) = &c.expect {
            assert!(
                ERRORS.contains(&code.as_str()),
                "[{}] unknown error {code}",
                c.name
            );
        }
    }
    for (cat, _) in CATEGORIES {
        assert!(
            cases.iter().any(|c| c.category == *cat),
            "no case in category {cat}"
        );
    }
}

/// Every expected output parses to the source with the edits applied in
/// memory, and every refusal case's source parses. This checks the corpus,
/// not the crate.
///
/// JSON objects reach the crate with their keys sorted (`serde_json` is built
/// without `preserve_order`), so a mapping value in a case lists its keys in
/// sorted order, or the case would expect an order the edit never asked for.
#[test]
fn the_corpus_is_consistent() {
    let mut failures = Vec::new();
    for c in corpus() {
        if let Err(msg) = check_expectation(&c) {
            failures.push(format!("  [{}] {msg}", c.name));
        }
    }
    assert!(
        failures.is_empty(),
        "inconsistent corpus cases:\n{}",
        failures.join("\n")
    );
}

fn check_expectation(c: &Case) -> Result<(), String> {
    let before = read(&c.source).map_err(|e| format!("source does not parse: {e}"))?;
    let Expect::Bytes { changed, bytes } = &c.expect else {
        return Ok(());
    };
    if *changed == (bytes == &c.source) {
        return Err(format!("`changed: {changed}` disagrees with the bytes"));
    }
    let mut want = before;
    for edit in &c.edits {
        apply(&mut want, edit, c.case_sensitive)?;
    }
    let got = read(bytes).map_err(|e| format!("expected bytes do not parse: {e}"))?;
    if got != want {
        return Err(format!(
            "expected bytes read as {got:?}, the edit asks for {want:?}"
        ));
    }
    Ok(())
}

/// Runs the cases of every enabled tier and reports the rest as pending.
#[test]
fn cases_pass() {
    let mut pending: BTreeMap<String, usize> = BTreeMap::new();
    let mut passed = 0;
    let mut failures = Vec::new();
    for c in corpus() {
        if !ENABLED_TIERS.contains(&c.tier) {
            *pending
                .entry(format!("tier {} {}", c.tier, c.category))
                .or_insert(0) += 1;
            continue;
        }
        match run_case(&c) {
            Ok(()) => passed += 1,
            Err(msg) => failures.push(format!("  [{}] {msg}", c.name)),
        }
    }
    eprintln!("nested corpus: {passed} passed, pending by category: {pending:?}");
    assert!(
        failures.is_empty(),
        "nested corpus failures:\n{}",
        failures.join("\n")
    );
}

/// Every case of `conformance.json`, with each top-level edit re-stated as a
/// one-segment path, gives the same result. Part of tier 1.
#[test]
fn one_segment_paths_match_the_conformance_corpus() {
    if !ENABLED_TIERS.contains(&1) {
        return;
    }
    let root: Json = serde_json::from_str(CONFORMANCE).expect("conformance.json is valid JSON");
    let mut failures = Vec::new();
    for fx in root.as_array().expect("conformance.json is a JSON array") {
        let name = fx.get("name").and_then(Json::as_str).unwrap_or("<unnamed>");
        let Some(source) = fx.get("source").and_then(Json::as_str) else {
            continue;
        };
        let as_path = |item: &Json| -> Json {
            let (tag, body) = item.as_object().unwrap().iter().next().unwrap();
            let key = |f: &str| Json::Array(vec![body[f].clone()]);
            match tag.as_str() {
                "Set" => {
                    serde_json::json!({"SetPath": {"path": key("key"), "value": body["value"]}})
                }
                "Remove" => serde_json::json!({"RemovePath": {"path": key("key")}}),
                "Rename" => {
                    serde_json::json!({"RenamePath": {"path": key("from"), "to": body["to"]}})
                }
                _ => item.clone(),
            }
        };
        let edits: Vec<Json> = fx["edits"]
            .as_array()
            .unwrap()
            .iter()
            .map(as_path)
            .collect();
        let case = Case {
            name: name.to_string(),
            tier: 1,
            category: "equivalence".to_string(),
            source: source.to_string(),
            edits: decode_edits(&Json::Array(edits)).unwrap(),
            case_sensitive: fx.get("case_sensitive").and_then(Json::as_bool) == Some(true),
            expect: decode_expect(&fx["expect"]).unwrap(),
        };
        if let Err(msg) = run_case(&case) {
            failures.push(format!("  [{name}] {msg}"));
        }
    }
    assert!(
        failures.is_empty(),
        "one-segment path failures:\n{}",
        failures.join("\n")
    );
}

/// Runs one case through the edit functions.
///
/// Tier 1 replaces the body with a call to `edit_yaml_with`, after turning
/// each [`PathEdit`] into the crate's path edit.
fn run_case(_c: &Case) -> Result<(), String> {
    Err("path edits are not implemented yet".to_string())
}

// --- fixture decoding ------------------------------------------------------

fn decode_case(fx: &Json) -> Result<Case, String> {
    let field = |f: &str| fx.get(f).ok_or_else(|| format!("case has no `{f}`"));
    Ok(Case {
        name: field("name")?
            .as_str()
            .ok_or("`name` is not a string")?
            .to_string(),
        tier: field("tier")?.as_u64().ok_or("`tier` is not an integer")?,
        category: field("category")?
            .as_str()
            .ok_or("`category` is not a string")?
            .to_string(),
        source: field("source")?
            .as_str()
            .ok_or("`source` is not a string")?
            .to_string(),
        edits: decode_edits(field("edits")?)?,
        case_sensitive: fx.get("case_sensitive").and_then(Json::as_bool) == Some(true),
        expect: decode_expect(field("expect")?)?,
    })
}

fn decode_expect(expect: &Json) -> Result<Expect, String> {
    if let Some(code) = expect.get("error").and_then(Json::as_str) {
        return Ok(Expect::Error(code.to_string()));
    }
    Ok(Expect::Bytes {
        changed: expect
            .get("changed")
            .and_then(Json::as_bool)
            .ok_or("`expect` needs `changed`")?,
        bytes: expect
            .get("bytes")
            .and_then(Json::as_str)
            .ok_or("`expect` needs `bytes`")?
            .to_string(),
    })
}

fn decode_edits(edits: &Json) -> Result<Vec<PathEdit>, String> {
    let arr = edits.as_array().ok_or("`edits` is not an array")?;
    arr.iter()
        .enumerate()
        .map(|(i, item)| {
            let (tag, body) = item
                .as_object()
                .and_then(|o| o.iter().next())
                .ok_or_else(|| format!("edits[{i}] is not a tagged object"))?;
            let text = |f: &str| {
                body.get(f)
                    .and_then(Json::as_str)
                    .map(str::to_string)
                    .ok_or_else(|| format!("edits[{i}].{tag}.{f} must be a string"))
            };
            let path = || decode_path(body.get("path"), i);
            let value = || {
                body.get("value")
                    .map(Value::from)
                    .ok_or_else(|| format!("edits[{i}].{tag}.value is required"))
            };
            Ok(match tag.as_str() {
                "SetPath" => PathEdit::Set(path()?, value()?),
                "RemovePath" => PathEdit::Remove(path()?),
                "RenamePath" => PathEdit::Rename(path()?, text("to")?),
                "Set" => PathEdit::Set(vec![Seg::Key(text("key")?)], value()?),
                "Remove" => PathEdit::Remove(vec![Seg::Key(text("key")?)]),
                "Rename" => PathEdit::Rename(vec![Seg::Key(text("from")?)], text("to")?),
                other => return Err(format!("edits[{i}] has unknown tag {other:?}")),
            })
        })
        .collect()
}

fn decode_path(path: Option<&Json>, i: usize) -> Result<Vec<Seg>, String> {
    path.and_then(Json::as_array)
        .ok_or_else(|| format!("edits[{i}].path must be an array"))?
        .iter()
        .map(|s| match s {
            Json::String(k) => Ok(Seg::Key(k.clone())),
            Json::Number(n) => n
                .as_u64()
                .map(|n| Seg::Index(n as usize))
                .ok_or_else(|| format!("edits[{i}].path has a bad index {n}")),
            other => Err(format!("edits[{i}].path has a bad segment {other}")),
        })
        .collect()
}

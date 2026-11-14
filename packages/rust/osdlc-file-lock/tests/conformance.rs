//! Runs the file-lock conformance suite, `packages/conformance/file-lock/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript `@osdlc/file-lock`
//! package must agree on, so that a Rust process and a Node.js process can
//! hold one lock file in turn. The TypeScript package is the family's
//! reference: its generator writes every `expect` and `error`. Every section
//! and every case runs here, and a section this test does not know fails it.
//!
//! Each case runs in a fresh directory holding the lock `x.lock`, set up as the
//! case's `lock` and `markers` say. The family README describes the result
//! each section records.

use std::collections::BTreeMap;
use std::fs::{self, File, FileTimes};
use std::path::Path;
use std::time::{Duration, SystemTime};

use osdlc_file_lock::{
    LockClaim, LockError, LockOptions, claim_lock, marker_for, release_lock, touch_lock,
    untouched_for, update_lock, with_lock,
};
use serde_json::{Map, Value, json};

/// Compiled in rather than read at runtime: a moved or deleted suite is a
/// build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/file-lock/suite.json");

const SECTIONS: [&str; 6] = [
    "marker_name",
    "claim",
    "release",
    "touch",
    "update",
    "section",
];

/// A lock file younger than this counts as fresh.
const FRESH: Duration = Duration::from_secs(5);

/// The lock file every case works on.
const LOCK: &str = "x.lock";

/// A lock's text: a string, or `{ "hex": ... }` for bytes that are not UTF-8.
fn bytes(raw: &Value) -> Vec<u8> {
    match raw {
        Value::String(s) => s.as_bytes().to_vec(),
        Value::Object(o) => {
            let hex = o["hex"].as_str().expect("hex is a string");
            (0..hex.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex digits"))
                .collect()
        }
        other => panic!("not a lock text: {other}"),
    }
}

/// The text an implementation reads from `raw`'s bytes.
fn text(raw: &Value) -> String {
    String::from_utf8_lossy(&bytes(raw)).into_owned()
}

/// The suite's content rule: a JSON object whose `token`, if any, is a string.
fn parse(raw: &str) -> Value {
    match serde_json::from_str::<Value>(raw) {
        Ok(Value::Object(o)) if matches!(o.get("token"), None | Some(Value::String(_))) => {
            Value::Object(o)
        }
        _ => Value::Null,
    }
}

fn millis(input: &Value, key: &str) -> Duration {
    Duration::from_millis(
        input[key]
            .as_u64()
            .unwrap_or_else(|| panic!("{key} is a number")),
    )
}

/// Write the case's lock and markers into `dir`.
fn set_up(dir: &Path, input: &Value) {
    let lock = dir.join(LOCK);
    if let Some(before) = input.get("lock").filter(|l| !l.is_null()) {
        fs::write(&lock, bytes(&before["raw"])).unwrap();
        let at = SystemTime::now() - millis(before, "ageMs");
        File::options()
            .write(true)
            .open(&lock)
            .unwrap()
            .set_times(FileTimes::new().set_accessed(at).set_modified(at))
            .unwrap();
    }
    for marker in input
        .get("markers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        fs::write(marker_for(&lock, &text(marker)), "").unwrap();
    }
}

/// The lock afterwards and the other names in its directory.
fn after(dir: &Path, input: &Value, ours: Option<&str>) -> Map<String, Value> {
    let lock = dir.join(LOCK);
    let mut beside: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n != LOCK)
        .collect();
    beside.sort();
    let mut out = Map::new();
    out.insert("beside".into(), json!(beside));
    let Ok(raw_bytes) = fs::read(&lock) else {
        out.insert("after".into(), Value::Null);
        return out;
    };
    let raw = String::from_utf8_lossy(&raw_bytes).into_owned();
    let mut content = parse(&raw);
    if let (Some(ours), Value::Object(o)) = (ours, &mut content)
        && o.get("token").and_then(Value::as_str) == Some(ours)
    {
        o.insert("token".into(), json!("<ours>"));
    }
    let unchanged = input
        .get("lock")
        .filter(|l| !l.is_null())
        .is_some_and(|before| raw == text(&before["raw"]));
    let age = SystemTime::now()
        .duration_since(fs::metadata(&lock).unwrap().modified().unwrap())
        .unwrap_or_default();
    out.insert(
        "after".into(),
        json!({ "content": content, "unchanged": unchanged, "fresh": age < FRESH }),
    );
    out
}

fn with(mut map: Map<String, Value>, key: &str, value: Value) -> Value {
    map.insert(key.into(), value);
    Value::Object(map)
}

/// Run one case of `section`, and give its outcome: `{"expect": ...}` or
/// `{"error": {"kind": ...}}`, as the suite records it.
fn run(section: &str, input: &Value) -> Value {
    if section == "marker_name" {
        let path = input["path"].as_str().unwrap();
        let marker = marker_for(Path::new(path), &text(&input["raw"]));
        return json!({ "expect": { "marker": marker.to_string_lossy() } });
    }
    let dir = tempfile::tempdir().unwrap();
    set_up(dir.path(), input);
    let lock = dir.path().join(LOCK);
    let token = input.get("token").and_then(Value::as_str).unwrap_or("");
    let expect = match section {
        "claim" => {
            let rule = untouched_for(millis(input, "staleMs"));
            let claim = claim_lock(&lock, &input["content"], rule).unwrap();
            let (claimed, holder, ours) = match &claim {
                LockClaim::Claimed { token } => (true, Value::Null, Some(token.as_str())),
                LockClaim::Held { holder: None } => (false, Value::Null, None),
                LockClaim::Held { holder: Some(h) } => (
                    false,
                    json!({ "content": h.content.clone().map_or(Value::Null, Value::Object) }),
                    None,
                ),
            };
            let mut map = after(dir.path(), input, ours);
            map.insert("claimed".into(), json!(claimed));
            with(map, "holder", holder)
        }
        "release" => {
            let result = release_lock(&lock, token).unwrap();
            with(after(dir.path(), input, None), "result", json!(result))
        }
        "touch" => {
            let result = touch_lock(&lock, token).unwrap();
            with(after(dir.path(), input, None), "result", json!(result))
        }
        "update" => {
            let set = input["set"].as_object().unwrap().clone();
            let result = update_lock(&lock, token, |c| {
                let mut next = c.clone();
                next.extend(set);
                next
            })
            .unwrap();
            with(after(dir.path(), input, None), "result", json!(result))
        }
        "section" => {
            let options = LockOptions::new()
                .stale(millis(input, "staleMs"))
                .timeout(millis(input, "timeoutMs"));
            let mut ran = false;
            match with_lock(&lock, &options, || ran = true) {
                Ok(()) => {}
                Err(LockError::Timeout { .. }) => {
                    return json!({ "error": { "kind": "lock_timeout" } });
                }
                Err(e) => panic!("{e}"),
            }
            with(after(dir.path(), input, None), "ran", json!(ran))
        }
        other => panic!("unknown section {other}"),
    };
    json!({ "expect": expect })
}

#[test]
fn every_case_of_the_suite_gives_the_reference_result() {
    let suite: Value = serde_json::from_str(SUITE_JSON).unwrap();
    assert_eq!(suite["family"], "file-lock");
    let sections = suite["sections"].as_object().unwrap();
    let unknown: Vec<&String> = sections
        .keys()
        .filter(|s| !SECTIONS.contains(&s.as_str()))
        .collect();
    assert!(
        unknown.is_empty(),
        "sections this test does not run: {unknown:?}"
    );
    let host = if cfg!(windows) { "windows" } else { "unix" };
    let mut failures = BTreeMap::new();
    let mut ran = 0;
    for (section, body) in sections {
        for case in body["cases"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            if case.get("skip").and_then(|s| s.get("rust")).is_some() {
                continue;
            }
            if let Some(platforms) = case.get("platforms").and_then(Value::as_array)
                && !platforms.iter().any(|p| p == host)
            {
                continue;
            }
            let want = match (case.get("expect"), case.get("error")) {
                (Some(e), None) => json!({ "expect": e }),
                (None, Some(e)) => json!({ "error": e }),
                _ => panic!("{section} / {name}: needs exactly one of expect and error"),
            };
            let got = run(section, &case["input"]);
            if got != want {
                failures.insert(format!("{section} / {name}"), (want, got));
            }
            ran += 1;
        }
    }
    assert!(ran > 0);
    assert!(failures.is_empty(), "{failures:#?}");
}

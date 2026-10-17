//! The conformance corpus: the observable contract of the edit functions,
//! which every binding of this crate must also meet.
//!
//! The corpus is language-neutral JSON at `tests/fixtures/conformance.json`,
//! so a binding in another language can load the same file and hold itself
//! to the same results. Each fixture is
//! `{ name, source | source_bytes, edits, case_sensitive?, expect }` where
//! `expect` is either a success (`changed`, `bytes`, optional `single_span`) or
//! a refusal (`error` variant, optional `error_valid_up_to` /
//! `error_span_within_source`).
//!
//! Compatibility is the returned bytes, the changed/no-op classification, and
//! the error code/span — not implementation details. The key property
//! throughout is byte preservation: **the prefix and suffix outside every
//! edited span are byte-identical** to the input. `single_span` proves that
//! directly by locating the one contiguous region that differs and asserting
//! everything around it survived unchanged.

use serde_json::Value as Json;
use yaml_splice::{
    EditError, EditOptions, EditOutcome, FieldEdit, Value, edit_yaml, edit_yaml_with,
};

const CORPUS: &str = include_str!("fixtures/conformance.json");

/// The whole shared corpus, one test. A failure aggregates every offending
/// fixture by name rather than stopping at the first, so a drift shows its full
/// blast radius.
#[test]
fn shared_conformance_corpus() {
    let root: Json = serde_json::from_str(CORPUS).expect("conformance.json is valid JSON");
    let fixtures = root.as_array().expect("conformance.json is a JSON array");
    assert!(!fixtures.is_empty(), "the corpus is empty");

    let mut failures = Vec::new();
    for fx in fixtures {
        let name = fx.get("name").and_then(Json::as_str).unwrap_or("<unnamed>");
        if let Err(msg) = run_fixture(fx) {
            failures.push(format!("  [{name}] {msg}"));
        }
    }
    assert!(
        failures.is_empty(),
        "conformance corpus failures:\n{}",
        failures.join("\n")
    );
}

fn run_fixture(fx: &Json) -> Result<(), String> {
    let source = source_bytes(fx)?;
    let edits = parse_edits(fx.get("edits").ok_or("fixture has no `edits`")?)?;
    let opts = EditOptions::default().case_sensitive(
        fx.get("case_sensitive")
            .and_then(Json::as_bool)
            .unwrap_or(false),
    );
    let expect = fx.get("expect").ok_or("fixture has no `expect`")?;
    let result = edit_yaml_with(&source, &edits, &opts);

    if let Some(code) = expect.get("error").and_then(Json::as_str) {
        return check_error(&result, code, expect, source.len());
    }
    check_success(&source, result, expect)
}

// --- success / error checks ------------------------------------------------

fn check_success(
    source: &[u8],
    result: Result<EditOutcome, EditError>,
    expect: &Json,
) -> Result<(), String> {
    let outcome =
        result.map_err(|e| format!("expected success, got refusal {}", variant_name(&e)))?;

    let want_changed = expect
        .get("changed")
        .and_then(Json::as_bool)
        .ok_or("success fixture needs `changed`")?;
    if outcome.changed != want_changed {
        return Err(format!(
            "changed mismatch: want {want_changed}, got {}",
            outcome.changed
        ));
    }

    let want_bytes = expect
        .get("bytes")
        .and_then(Json::as_str)
        .ok_or("success fixture needs `bytes`")?
        .as_bytes();
    if outcome.bytes != want_bytes {
        return Err(format!(
            "bytes mismatch:\n    want {:?}\n    got  {:?}",
            String::from_utf8_lossy(want_bytes),
            String::from_utf8_lossy(&outcome.bytes),
        ));
    }

    if expect.get("single_span").and_then(Json::as_bool) == Some(true) {
        assert_single_span(source, &outcome.bytes)?;
    }
    Ok(())
}

fn check_error(
    result: &Result<EditOutcome, EditError>,
    want_code: &str,
    expect: &Json,
    source_len: usize,
) -> Result<(), String> {
    let err = match result {
        Err(e) => e,
        Ok(_) => return Err(format!("expected refusal {want_code}, got success")),
    };
    let got = variant_name(err);
    if got != want_code {
        return Err(format!("error mismatch: want {want_code}, got {got}"));
    }

    if let Some(want) = expect.get("error_valid_up_to").and_then(Json::as_u64) {
        match err {
            EditError::InvalidUtf8 { valid_up_to } if *valid_up_to as u64 == want => {}
            EditError::InvalidUtf8 { valid_up_to } => {
                return Err(format!(
                    "valid_up_to mismatch: want {want}, got {valid_up_to}"
                ));
            }
            _ => return Err("error_valid_up_to on a non-InvalidUtf8 error".to_string()),
        }
    }

    if expect
        .get("error_span_within_source")
        .and_then(Json::as_bool)
        == Some(true)
    {
        match error_span(err) {
            Some(span) if span.start < span.end && span.end <= source_len => {}
            Some(span) => {
                return Err(format!(
                    "error span {:?} not within [0, {source_len}) and non-empty",
                    span
                ));
            }
            None => return Err("expected an error span, the variant carries none".to_string()),
        }
    }
    Ok(())
}

// --- fixture decoding ------------------------------------------------------

fn source_bytes(fx: &Json) -> Result<Vec<u8>, String> {
    if let Some(text) = fx.get("source").and_then(Json::as_str) {
        return Ok(text.as_bytes().to_vec());
    }
    if let Some(arr) = fx.get("source_bytes").and_then(Json::as_array) {
        return arr
            .iter()
            .map(|b| {
                b.as_u64()
                    .filter(|n| *n <= 255)
                    .map(|n| n as u8)
                    .ok_or_else(|| "source_bytes entry is not a 0..=255 integer".to_string())
            })
            .collect();
    }
    Err("fixture has neither `source` nor `source_bytes`".to_string())
}

/// Walk the externally-tagged edit JSON into `Vec<FieldEdit>`, routing each
/// `Set` value through the crate's own `From<&serde_json::Value>` bridge, the
/// path a binding that receives edits as JSON takes.
fn parse_edits(edits: &Json) -> Result<Vec<FieldEdit>, String> {
    let arr = edits.as_array().ok_or("`edits` is not an array")?;
    let mut out = Vec::with_capacity(arr.len());
    for (i, item) in arr.iter().enumerate() {
        let obj = item
            .as_object()
            .ok_or_else(|| format!("edits[{i}] is not an object"))?;
        let (tag, body) = obj
            .iter()
            .next()
            .ok_or_else(|| format!("edits[{i}] has no tag key"))?;
        let str_field = |field: &str| -> Result<String, String> {
            body.get(field)
                .and_then(Json::as_str)
                .map(str::to_string)
                .ok_or_else(|| format!("edits[{i}].{tag}.{field} must be a string"))
        };
        let edit = match tag.as_str() {
            "Set" => FieldEdit::Set {
                key: str_field("key")?,
                value: Value::from(
                    body.get("value")
                        .ok_or_else(|| format!("edits[{i}].Set.value is required"))?,
                ),
            },
            "Remove" => FieldEdit::Remove {
                key: str_field("key")?,
            },
            "Rename" => FieldEdit::Rename {
                from: str_field("from")?,
                to: str_field("to")?,
            },
            other => return Err(format!("edits[{i}] has unknown tag {other:?}")),
        };
        out.push(edit);
    }
    Ok(out)
}

fn variant_name(e: &EditError) -> &'static str {
    match e {
        EditError::InvalidUtf8 { .. } => "InvalidUtf8",
        EditError::MalformedYaml { .. } => "MalformedYaml",
        EditError::UnsupportedDocument { .. } => "UnsupportedDocument",
        EditError::RootNotMapping { .. } => "RootNotMapping",
        EditError::AmbiguousKey { .. } => "AmbiguousKey",
        EditError::MissingKey { .. } => "MissingKey",
        EditError::KeyConflict { .. } => "KeyConflict",
        EditError::UnrenderableValue { .. } => "UnrenderableValue",
        EditError::InvalidResult { .. } => "InvalidResult",
        _ => "unknown",
    }
}

fn error_span(e: &EditError) -> Option<std::ops::Range<usize>> {
    match e {
        EditError::MalformedYaml { at, .. } | EditError::UnsupportedDocument { at, .. } => {
            at.clone()
        }
        EditError::RootNotMapping { at, .. }
        | EditError::AmbiguousKey { at, .. }
        | EditError::KeyConflict { at, .. } => Some(at.clone()),
        _ => None,
    }
}

/// Assert that `output` differs from `input` in exactly one contiguous span:
/// everything before the first differing byte and everything after the last
/// differing byte is byte-identical.
fn assert_single_span(input: &[u8], output: &[u8]) -> Result<(), String> {
    let common_prefix = input
        .iter()
        .zip(output.iter())
        .take_while(|(a, b)| a == b)
        .count();
    let common_suffix = input[common_prefix..]
        .iter()
        .rev()
        .zip(output[common_prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    if input[..common_prefix] != output[..common_prefix] {
        return Err("prefix diverged".to_string());
    }
    if input[input.len() - common_suffix..] != output[output.len() - common_suffix..] {
        return Err("suffix diverged".to_string());
    }
    if common_prefix + common_suffix > input.len() {
        return Err(
            "prefix and suffix overlap — the edit is not a single contiguous span".to_string(),
        );
    }
    Ok(())
}

// --- fuzz smoke: not a fixture (no expected output), stays native ----------

#[test]
fn no_panic_on_hostile_input() {
    let set = FieldEdit::Set {
        key: "k".to_string(),
        value: Value::Str("v".to_string()),
    };
    let remove = FieldEdit::Remove {
        key: "k".to_string(),
    };
    let rename = FieldEdit::Rename {
        from: "a".to_string(),
        to: "b".to_string(),
    };
    // None of these may panic; each is Ok or a typed Err.
    for src in [
        "",
        "\u{feff}",
        "\n\n\n",
        "# only a comment\n",
        "a:\n",
        "?: complex\n",
        "a: &x [*x]\n", // recursive alias
        ": : :\n",
        "\t\t\t",
        "a: 1\r\n\r\nb: 2",
        "{}",
        "[]",
    ] {
        let _ = edit_yaml(src.as_bytes(), std::slice::from_ref(&set));
        let _ = edit_yaml(src.as_bytes(), std::slice::from_ref(&remove));
        let _ = edit_yaml(src.as_bytes(), std::slice::from_ref(&rename));
    }
}

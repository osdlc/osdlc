//! A thin wasm-bindgen surface over `yaml_splice::edit_yaml`.
//!
//! The TypeScript package calls this one Rust implementation over
//! WebAssembly; it never has a second copy of the edit logic. Boundary
//! choices:
//!
//! - `source` crosses as raw bytes (`&[u8]` -> `Uint8Array`), so a BOM, CRLF
//!   and exact quoting survive. It never goes through a JS string.
//! - `edits` cross as a JSON string. `FieldEdit` has no serde derive, so the
//!   externally-tagged JSON is walked by hand and each `Set` value goes
//!   through yaml-splice's own `From<&serde_json::Value> for Value` bridge, with
//!   no extra dependencies.
//! - Success is an `EditResult` class carrying `{ bytes: Uint8Array, changed }`.
//! - A typed `EditError` becomes a thrown JS `Error` whose `.name` is the
//!   variant and whose `.span` is `{ start, end }` (or absent).
//! - An `edits` string that does not decode to a list of edits (not JSON,
//!   an unknown tag, a missing field, or a value nested past serde_json's
//!   recursion limit) is thrown as an `Error` named `InvalidEdit`: the
//!   caller's input is bad, not the document.

#![forbid(unsafe_code)]

use std::ops::Range;

use serde_json::Value as JsonValue;
use wasm_bindgen::prelude::*;
use yaml_splice::{EditError, FieldEdit, PathSegment, Value, edit_yaml};

/// The successful outcome of an edit batch. A wasm-bindgen class: the caller
/// reads `.bytes` / `.changed` and should `.free()` it when done (it owns a
/// slot in wasm linear memory). The TS façade reads both into a plain object
/// and frees this handle, so callers never see the class.
#[wasm_bindgen]
pub struct EditResult {
    bytes: Vec<u8>,
    changed: bool,
}

#[wasm_bindgen]
impl EditResult {
    /// The complete output bytes. On a semantic no-op these are byte-identical
    /// to the input.
    #[wasm_bindgen(getter)]
    pub fn bytes(&self) -> Vec<u8> {
        self.bytes.clone()
    }

    /// Whether any edit changed a byte.
    #[wasm_bindgen(getter)]
    pub fn changed(&self) -> bool {
        self.changed
    }
}

/// Edit `source` (raw UTF-8 YAML bytes) with `edits_json`, an array of
/// externally-tagged field edits, e.g.
/// `[{"Set":{"key":"status","value":"done"}}]`,
/// `[{"Remove":{"key":"draft"}}]`, `[{"Rename":{"from":"a","to":"b"}}]`, and
/// the nested forms `[{"SetPath":{"path":["a",0,"b"],"value":1}}]`,
/// `RemovePath {path}` and `RenamePath {path, to}`.
#[wasm_bindgen(js_name = editYaml)]
pub fn edit_yaml_wasm(source: &[u8], edits_json: &str) -> Result<EditResult, JsValue> {
    let edits = parse_edits(edits_json).map_err(|msg| {
        let err = js_sys::Error::new(&msg);
        err.set_name(INVALID_EDIT);
        JsValue::from(err)
    })?;
    match edit_yaml(source, &edits) {
        Ok(outcome) => Ok(EditResult {
            bytes: outcome.bytes,
            changed: outcome.changed,
        }),
        Err(e) => Err(edit_error_to_js(&e)),
    }
}

// --- edits JSON -> Vec<FieldEdit> ------------------------------------------

/// The `.name` of the error thrown for an `edits` string that does not decode.
/// Not an `EditError` variant: the crate's typed `FieldEdit` cannot be
/// malformed, so only this boundary can refuse one.
const INVALID_EDIT: &str = "InvalidEdit";

fn parse_edits(edits_json: &str) -> Result<Vec<FieldEdit>, String> {
    let json: JsonValue =
        serde_json::from_str(edits_json).map_err(|e| format!("edits is not valid JSON: {e}"))?;
    let arr = json
        .as_array()
        .ok_or_else(|| "edits must be a JSON array".to_string())?;

    let mut out = Vec::with_capacity(arr.len());
    for (i, item) in arr.iter().enumerate() {
        let obj = item
            .as_object()
            .ok_or_else(|| format!("edits[{i}] must be an object"))?;
        if obj.len() != 1 {
            return Err(format!(
                "edits[{i}] must have exactly one tag key (Set | Remove | Rename | SetPath | RemovePath | RenamePath)"
            ));
        }
        let (tag, body) = obj.iter().next().expect("len == 1");
        let edit = match tag.as_str() {
            "Set" => FieldEdit::Set {
                key: str_field(body, "key", i, "Set")?,
                // The crate's own JSON -> ordered Value bridge.
                value: Value::from(
                    body.get("value")
                        .ok_or_else(|| format!("edits[{i}].Set.value is required"))?,
                ),
            },
            "Remove" => FieldEdit::Remove {
                key: str_field(body, "key", i, "Remove")?,
            },
            "Rename" => FieldEdit::Rename {
                from: str_field(body, "from", i, "Rename")?,
                to: str_field(body, "to", i, "Rename")?,
            },
            "SetPath" => FieldEdit::SetPath {
                path: path_field(body, i, "SetPath")?,
                value: Value::from(
                    body.get("value")
                        .ok_or_else(|| format!("edits[{i}].SetPath.value is required"))?,
                ),
            },
            "RemovePath" => FieldEdit::RemovePath {
                path: path_field(body, i, "RemovePath")?,
            },
            "RenamePath" => FieldEdit::RenamePath {
                path: path_field(body, i, "RenamePath")?,
                to: str_field(body, "to", i, "RenamePath")?,
            },
            other => return Err(format!("edits[{i}] has unknown tag {other:?}")),
        };
        out.push(edit);
    }
    Ok(out)
}

fn str_field(body: &JsonValue, field: &str, i: usize, tag: &str) -> Result<String, String> {
    body.get(field)
        .and_then(JsonValue::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("edits[{i}].{tag}.{field} must be a string"))
}

/// A `path`: an array of strings (keys) and non-negative integers (indices).
/// An empty array passes through, since the crate refuses it as
/// `UnsupportedPath`.
fn path_field(body: &JsonValue, i: usize, tag: &str) -> Result<Vec<PathSegment>, String> {
    let segments = body
        .get("path")
        .and_then(JsonValue::as_array)
        .ok_or_else(|| format!("edits[{i}].{tag}.path must be an array"))?;
    segments
        .iter()
        .enumerate()
        .map(|(j, seg)| match seg {
            JsonValue::String(key) => Ok(PathSegment::Key(key.clone())),
            JsonValue::Number(n) => n
                .as_u64()
                .and_then(|u| usize::try_from(u).ok())
                .map(PathSegment::Index)
                .ok_or_else(|| {
                    format!("edits[{i}].{tag}.path[{j}] must be a non-negative integer")
                }),
            _ => Err(format!(
                "edits[{i}].{tag}.path[{j}] must be a string or a non-negative integer"
            )),
        })
        .collect()
}

// --- EditError -> thrown JS Error ------------------------------------------

fn edit_error_to_js(e: &EditError) -> JsValue {
    let err = js_sys::Error::new(&e.to_string());
    err.set_name(variant_name(e));
    if let Some(span) = span_of(e) {
        let obj = js_sys::Object::new();
        let _ = js_sys::Reflect::set(&obj, &"start".into(), &(span.start as f64).into());
        let _ = js_sys::Reflect::set(&obj, &"end".into(), &(span.end as f64).into());
        let _ = js_sys::Reflect::set(&err, &"span".into(), &obj);
    }
    err.into()
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
        EditError::PathNotFound { .. } => "PathNotFound",
        EditError::PathTypeMismatch { .. } => "PathTypeMismatch",
        EditError::UnsupportedPath { .. } => "UnsupportedPath",
        EditError::InvalidResult { .. } => "InvalidResult",
        _ => "EditError",
    }
}

fn span_of(e: &EditError) -> Option<Range<usize>> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: &str) -> Result<Vec<FieldEdit>, String> {
        parse_edits(json)
    }

    #[test]
    fn path_edits_decode_keys_and_indices() {
        let edits = parse(
            r#"[{"SetPath":{"path":["a",0,"b"],"value":1}},
                {"RemovePath":{"path":["a"]}},
                {"RenamePath":{"path":["a","b"],"to":"c"}}]"#,
        )
        .unwrap();
        assert_eq!(
            edits[0],
            FieldEdit::SetPath {
                path: vec!["a".into(), PathSegment::Index(0), "b".into()],
                value: Value::from(&serde_json::json!(1)),
            }
        );
        assert_eq!(
            edits[1],
            FieldEdit::RemovePath {
                path: vec!["a".into()]
            }
        );
        assert_eq!(
            edits[2],
            FieldEdit::RenamePath {
                path: vec!["a".into(), "b".into()],
                to: "c".into()
            }
        );
    }

    #[test]
    fn an_empty_path_passes_through_to_the_crate() {
        let edits = parse(r#"[{"RemovePath":{"path":[]}}]"#).unwrap();
        assert_eq!(edits[0], FieldEdit::RemovePath { path: vec![] });
    }

    #[test]
    fn a_bad_path_segment_is_refused() {
        for seg in ["-1", "1.5", "true", "null", "[]", "1e30"] {
            let json = format!(r#"[{{"RemovePath":{{"path":["a",{seg}]}}}}]"#);
            let err = parse(&json).unwrap_err();
            assert!(err.contains("path[1]"), "{seg}: {err}");
        }
        assert!(parse(r#"[{"RemovePath":{"path":"a"}}]"#).is_err());
        assert!(parse(r#"[{"RemovePath":{}}]"#).is_err());
        assert!(parse(r#"[{"RenamePath":{"path":["a"]}}]"#).is_err());
        assert!(parse(r#"[{"SetPath":{"path":["a"]}}]"#).is_err());
    }

    #[test]
    fn path_errors_have_names() {
        let e = EditError::PathNotFound {
            path: "a.b".into(),
            segment: 1,
        };
        assert_eq!(variant_name(&e), "PathNotFound");
        assert_eq!(span_of(&e), None);
    }
}

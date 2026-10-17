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

#![forbid(unsafe_code)]

use std::ops::Range;

use serde_json::Value as JsonValue;
use wasm_bindgen::prelude::*;
use yaml_splice::{EditError, FieldEdit, Value, edit_yaml};

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
/// `[{"Remove":{"key":"draft"}}]`, `[{"Rename":{"from":"a","to":"b"}}]`.
#[wasm_bindgen(js_name = editYaml)]
pub fn edit_yaml_wasm(source: &[u8], edits_json: &str) -> Result<EditResult, JsValue> {
    let edits = parse_edits(edits_json).map_err(|msg| JsValue::from(js_sys::Error::new(&msg)))?;
    match edit_yaml(source, &edits) {
        Ok(outcome) => Ok(EditResult {
            bytes: outcome.bytes,
            changed: outcome.changed,
        }),
        Err(e) => Err(edit_error_to_js(&e)),
    }
}

// --- edits JSON -> Vec<FieldEdit> ------------------------------------------

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
                "edits[{i}] must have exactly one tag key (Set | Remove | Rename)"
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

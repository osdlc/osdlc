//! What this crate gives for one case of the frontmatter-lossless conformance
//! suite, `packages/conformance/frontmatter-lossless/suite.json`.
//!
//! Shared by the generator (`write.rs`, which writes every `expect` from it)
//! and the runner (`tests/conformance.rs`, which checks every `expect` against
//! it). Both include it with `#[path]`, so it is not a test of its own.

use frontmatter_lossless::{
    NewShapeOptions, NoteShape, OpenEol, compose, new_shape, split, split_lenient,
};
use serde_json::{Map, Value, json};

/// Path of the suite, from the crate's directory.
pub const SUITE_PATH: &str = "../../conformance/frontmatter-lossless/suite.json";

/// The sections this crate runs. A section not listed here fails the runner.
pub const SECTIONS: [&str; 4] = ["split", "split_lenient", "compose_edit", "new_shape"];

/// The keys a case may have. Any other fails both the runner and the generator.
pub const CASE_KEYS: [&str; 3] = ["name", "input", "expect"];

/// The `expect` this crate gives for `input` in `section`, or why the input
/// cannot be run.
pub fn run(section: &str, input: &Value) -> Result<Value, String> {
    match section {
        "split" => {
            let i = fields(input, &["source"])?;
            Ok(split_value(text(i, "source")?))
        }
        "split_lenient" => {
            let i = fields(input, &["source"])?;
            Ok(match split_lenient(text(i, "source")?) {
                None => Value::Null,
                Some(l) => json!({ "yaml": l.yaml, "body": l.body }),
            })
        }
        "compose_edit" => {
            let i = fields(input, &["source", "yaml", "body"])?;
            let shape = split(text(i, "source")?).shape;
            let out = compose(maybe_text(i, "yaml")?, text(i, "body")?, shape);
            Ok(json!({ "out": out }))
        }
        "new_shape" => {
            let i = fields(input, &["eol", "bom", "yaml", "body"])?;
            let mut opts = NewShapeOptions::default();
            match maybe_text(i, "eol")? {
                None => {}
                Some("\n") => opts.eol = OpenEol::Lf,
                Some("\r\n") => opts.eol = OpenEol::Crlf,
                Some(other) => return Err(format!("eol {other:?} is not \"\\n\" or \"\\r\\n\"")),
            }
            match i.get("bom") {
                Some(Value::Null) => {}
                Some(Value::Bool(b)) => opts.bom = *b,
                _ => return Err("bom is not a boolean or null".into()),
            }
            let shape = new_shape(opts);
            let out = compose(maybe_text(i, "yaml")?, text(i, "body")?, shape);
            Ok(json!({ "shape": shape_value(shape), "out": out }))
        }
        _ => Err(format!("unknown section {section}")),
    }
}

/// The strict split of `source` as a suite value. Offsets are UTF-8 bytes.
pub fn split_value(source: &str) -> Value {
    let s = split(source);
    json!({
        "yaml": s.yaml,
        "yaml_range": { "start": s.yaml_range.start, "end": s.yaml_range.end },
        "body": s.body,
        "body_start": s.body_start,
        "bom": s.shape.bom,
        "open_eol": s.shape.open_eol.as_str(),
        "close_eol": s.shape.close_eol.as_str(),
        "close_sep": s.shape.close_sep,
        "unterminated": s.unterminated,
    })
}

fn shape_value(shape: NoteShape) -> Value {
    json!({
        "bom": shape.bom,
        "open_eol": shape.open_eol.as_str(),
        "close_eol": shape.close_eol.as_str(),
        "close_sep": shape.close_sep,
    })
}

/// `input` as an object with exactly `keys`.
pub fn fields<'a>(input: &'a Value, keys: &[&str]) -> Result<&'a Map<String, Value>, String> {
    let map = input.as_object().ok_or("input is not an object")?;
    for k in map.keys() {
        if !keys.contains(&k.as_str()) {
            return Err(format!("input has an unknown key {k}"));
        }
    }
    for k in keys {
        if !map.contains_key(*k) {
            return Err(format!("input has no {k}"));
        }
    }
    Ok(map)
}

/// The string at `key`.
pub fn text<'a>(map: &'a Map<String, Value>, key: &str) -> Result<&'a str, String> {
    map.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{key} is not a string"))
}

/// The string at `key`, or `None` for null.
pub fn maybe_text<'a>(map: &'a Map<String, Value>, key: &str) -> Result<Option<&'a str>, String> {
    match map.get(key) {
        Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        _ => Err(format!("{key} is not a string or null")),
    }
}

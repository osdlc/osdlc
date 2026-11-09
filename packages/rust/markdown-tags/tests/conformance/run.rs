//! What this crate gives for one case of the markdown-tags conformance suite,
//! `packages/conformance/markdown-tags/suite.json`.
//!
//! Shared by the generator (`write.rs`, which writes every `expect` from it)
//! and the runner (`tests/conformance.rs`, which checks every `expect` against
//! it). Both include it with `#[path]`, so it is not a test of its own.

use markdown_tags::{TagDialect, inline_tags, tag_at};
use serde_json::{Map, Value};

/// Path of the suite, from the crate's directory.
pub const SUITE_PATH: &str = "../../conformance/markdown-tags/suite.json";

/// The sections the suite holds. A section not listed here fails the runner.
pub const SECTIONS: [&str; 3] = ["inline_tags", "tag_at", "renderer_only"];

/// The section only a renderer can answer. It reads the syntax tree, and a
/// source scan cannot match it, so this crate and its twin skip the section
/// and the generator keeps each case's `expect` as it is.
pub const RENDERER_ONLY: &str = "renderer_only";

/// The keys a case may have. Any other fails both the runner and the generator.
pub const CASE_KEYS: [&str; 3] = ["name", "input", "expect"];

/// The `expect` this crate gives for `input` in `section`, or why the input
/// cannot be run. `None` for the renderer-only section.
pub fn run(section: &str, input: &Value) -> Result<Option<Value>, String> {
    match section {
        "inline_tags" => {
            let body = body(input)?;
            let mut out = Map::new();
            for &dialect in TagDialect::ALL {
                out.insert(
                    dialect.as_str().to_owned(),
                    tags(inline_tags(body, dialect)),
                );
            }
            Ok(Some(Value::Object(out)))
        }
        "tag_at" => {
            let map = input.as_object().ok_or("input is not an object")?;
            if let Some(k) = map
                .keys()
                .find(|k| !["text", "index", "dialect"].contains(&k.as_str()))
            {
                return Err(format!("unknown input key {k}"));
            }
            let text = map
                .get("text")
                .and_then(Value::as_str)
                .ok_or("input.text is not a string")?;
            let index = map
                .get("index")
                .and_then(Value::as_u64)
                .ok_or("input.index is not a non-negative integer")?;
            let dialect = map
                .get("dialect")
                .and_then(Value::as_str)
                .ok_or("input.dialect is not a string")?
                .parse::<TagDialect>()
                .map_err(|e| e.to_string())?;
            let found = usize::try_from(index)
                .ok()
                .and_then(|i| tag_at(text, i, dialect));
            let mut out = Map::new();
            out.insert("tag".to_owned(), found.map_or(Value::Null, Value::String));
            Ok(Some(Value::Object(out)))
        }
        RENDERER_ONLY => {
            body(input)?;
            Ok(None)
        }
        other => Err(format!("unknown section {other}")),
    }
}

/// The `body` of a case input, which holds nothing else.
pub fn body(input: &Value) -> Result<&str, String> {
    let map = input.as_object().ok_or("input is not an object")?;
    if let Some(k) = map.keys().find(|k| k.as_str() != "body") {
        return Err(format!("unknown input key {k}"));
    }
    map.get("body")
        .and_then(Value::as_str)
        .ok_or_else(|| "input.body is not a string".to_owned())
}

fn tags(found: Vec<String>) -> Value {
    Value::Array(found.into_iter().map(Value::String).collect())
}

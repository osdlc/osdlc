//! Typed readers over a parsed YAML mapping, shared by the declarative compilers.
//!
//! Each reader returns `Ok(None)` for an absent key and an error for a value of the
//! wrong type, as the TS compilers do. `err` builds the caller's error variant.

use serde_yaml::{Mapping, Value};

use super::errors::DeclarativeError;

/// Builds a [`DeclarativeError`] of the caller's variant from a message.
pub(super) type ErrFn = fn(String) -> DeclarativeError;

pub(super) fn get<'a>(map: &'a Mapping, key: &str) -> Option<&'a Value> {
    map.get(key)
}

/// A value as JSON text, for error messages (`undefined` when absent).
pub(super) fn render(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(v) => serde_json::to_string(&crate::frontmatter::yaml_to_json(v.clone()))
            .unwrap_or_else(|_| "?".into()),
    }
}

/// A word for a value's shape, for error messages (the TS `describeValue`).
pub(super) fn describe(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Sequence(_) => "a list",
        Value::Mapping(_) => "object",
        Value::String(_) => "string",
        Value::Number(_) => "number",
        Value::Bool(_) => "boolean",
        Value::Tagged(_) => "a tagged value",
    }
}

/// `map[key]` as a number; `{path}.{key} must be a number` otherwise.
pub(super) fn num(
    map: &Mapping,
    key: &str,
    path: &str,
    err: ErrFn,
) -> Result<Option<f64>, DeclarativeError> {
    get(map, key)
        .map(|v| {
            v.as_f64()
                .ok_or_else(|| err(format!("{path}.{key} must be a number")))
        })
        .transpose()
}

/// `map[key]` as a string; `{path}.{key} must be a string` otherwise.
pub(super) fn string<'a>(
    map: &'a Mapping,
    key: &str,
    path: &str,
    err: ErrFn,
) -> Result<Option<&'a str>, DeclarativeError> {
    get(map, key)
        .map(|v| {
            v.as_str()
                .ok_or_else(|| err(format!("{path}.{key} must be a string")))
        })
        .transpose()
}

/// `map[key]` as a boolean; `{path}.{key} must be a boolean` otherwise.
pub(super) fn boolean(
    map: &Mapping,
    key: &str,
    path: &str,
    err: ErrFn,
) -> Result<Option<bool>, DeclarativeError> {
    get(map, key)
        .map(|v| {
            v.as_bool()
                .ok_or_else(|| err(format!("{path}.{key} must be a boolean")))
        })
        .transpose()
}

/// `map[key]` as a list of strings, or `None` when it is absent or not one.
pub(super) fn strings(map: &Mapping, key: &str) -> Option<Vec<String>> {
    get(map, key)?
        .as_sequence()?
        .iter()
        .map(|v| v.as_str().map(str::to_string))
        .collect()
}

/// Reject every key of `map` outside `allowed`. A key in `v1` gets a message naming
/// its v2 form, a key in `outside` is named as JSON Schema outside the subset, and any
/// other key is unknown.
pub(super) fn check_keys(
    map: &Mapping,
    allowed: &[&str],
    path: &str,
    v1: &[(&str, &str)],
    outside: &[&str],
    err: ErrFn,
) -> Result<(), DeclarativeError> {
    for key in map.keys() {
        let Some(k) = key.as_str() else {
            return Err(err(format!("{path}: keys must be strings")));
        };
        if allowed.contains(&k) {
            continue;
        }
        if let Some((_, v2)) = v1.iter().find(|(old, _)| *old == k) {
            return Err(err(format!(
                "{path}: '{k}' is the v1 spelling — v2 uses {v2} (markdown-contract migrate rewrites v1 files)"
            )));
        }
        if outside.contains(&k) {
            return Err(err(format!(
                "{path}: '{k}' is JSON Schema outside the supported v2 subset"
            )));
        }
        return Err(err(format!("{path}: unknown key '{k}'")));
    }
    Ok(())
}

/// The `description:` annotation: a string, stored for `Finding.hint`.
pub(super) fn description_of(
    map: &Mapping,
    path: &str,
    err: ErrFn,
) -> Result<Option<String>, DeclarativeError> {
    string(map, "description", path, err).map(|d| d.map(str::to_string))
}

/// A YAML scalar as JS `String(value)` spells it.
pub(super) fn scalar_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.as_f64().map_or_else(|| n.to_string(), crate::js::num),
        Value::Null => "null".into(),
        Value::Sequence(_) | Value::Mapping(_) | Value::Tagged(_) => render(Some(v)),
    }
}

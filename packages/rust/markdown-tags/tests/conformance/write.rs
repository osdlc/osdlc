//! Writes the expected values of the markdown-tags conformance suite,
//! `packages/conformance/markdown-tags/suite.json`.
//!
//! ```sh
//! cargo run -p markdown-tags --example conformance-write
//! ```
//!
//! Inputs are written by hand in the suite. This rewrites every case's
//! `expect` except `renderer_only`'s, from what this crate, the family's reference, gives, and
//! stamps `referenceVersion` with the crate's version. The `renderer_only`
//! section is the renderer's answer, which a source scan cannot give, so its
//! `expect` values stay as written. Running it twice writes the same bytes.
//! It is an example target (see Cargo.toml) kept under `tests/`, so it is not
//! published with the crate.

use std::path::Path;
use std::process::ExitCode;

use serde_json::{Map, Value};

#[path = "run.rs"]
#[allow(dead_code, reason = "shared with the runner, which uses all of it")]
mod run;

fn main() -> ExitCode {
    match write() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("conformance-write: {err}");
            ExitCode::FAILURE
        }
    }
}

fn write() -> Result<(), String> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(run::SUITE_PATH);
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut suite: Value = serde_json::from_str(&text).map_err(|e| format!("suite.json: {e}"))?;
    suite["referenceVersion"] = Value::from(env!("CARGO_PKG_VERSION"));
    let sections = suite["sections"]
        .as_object_mut()
        .ok_or("sections is not an object")?;
    for (section, body) in sections.iter_mut() {
        if !run::SECTIONS.contains(&section.as_str()) {
            return Err(format!("unknown section {section}"));
        }
        let cases = body["cases"]
            .as_array_mut()
            .ok_or_else(|| format!("{section}: cases is not a list"))?;
        for case in cases.iter_mut() {
            let map = case
                .as_object()
                .ok_or_else(|| format!("{section}: a case is not an object"))?;
            let name = map
                .get("name")
                .cloned()
                .ok_or_else(|| format!("{section}: a case has no name"))?;
            if let Some(k) = map.keys().find(|k| !run::CASE_KEYS.contains(&k.as_str())) {
                return Err(format!("{section}: {name}: unknown key {k}"));
            }
            let input = map
                .get("input")
                .cloned()
                .ok_or_else(|| format!("{section}: {name}: no input"))?;
            let expect =
                match run::run(section, &input).map_err(|e| format!("{section}: {name}: {e}"))? {
                    Some(expect) => expect,
                    None => map
                        .get("expect")
                        .cloned()
                        .ok_or_else(|| format!("{section}: {name}: no expect"))?,
                };
            let mut out = Map::new();
            out.insert("name".into(), name);
            out.insert("input".into(), input);
            out.insert("expect".into(), expect);
            *case = Value::Object(out);
        }
    }
    let json = serde_json::to_string_pretty(&suite).map_err(|e| e.to_string())?;
    std::fs::write(&path, format!("{json}\n")).map_err(|e| format!("{}: {e}", path.display()))
}

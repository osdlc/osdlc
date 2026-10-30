//! Runs the config-layers conformance suite, `packages/conformance/config-layers/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript
//! `@osdlc/config-layers` package must agree on. The TypeScript package is
//! the family's reference: its generator writes every `expect` and `error`.
//! Every section and every case runs here. A section, a case field or an
//! input field this test does not know fails it, and so does a case that
//! neither runs nor is skipped for a reason the suite gives.
//!
//! An integration test, so it reaches the crate only through the public API.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use config_layers::file::{self, FileProblem};
use config_layers::needs::{KeySpec, Need, Needs, Scope};
use config_layers::paths::{self, PathNames};
use config_layers::serde_json::{self, Map, Value, json};
use config_layers::value;
use serde::Deserialize;
use serde::de::DeserializeOwned;

/// Compiled in rather than read at runtime: the test binary then carries the
/// suite, and a moved or deleted suite is a build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/config-layers/suite.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Suite {
    family: String,
    #[allow(dead_code, reason = "the suite format carries it; this test reads none")]
    reference: String,
    #[allow(dead_code, reason = "the suite format carries it; this test reads none")]
    reference_version: String,
    sections: BTreeMap<String, Section>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Section {
    #[allow(dead_code, reason = "prose for the reader")]
    description: String,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    name: String,
    input: Value,
    #[serde(default)]
    expect: Option<Value>,
    #[serde(default)]
    error: Option<ErrorSpec>,
    #[serde(default)]
    platforms: Option<Vec<String>>,
    #[serde(default)]
    skip: BTreeMap<String, String>,
}

#[derive(Debug, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
struct ErrorSpec {
    kind: String,
    #[serde(default)]
    message: Option<String>,
}

impl Case {
    fn runs_here(&self) -> bool {
        if self.skip.contains_key("rust") {
            return false;
        }
        let host = if cfg!(windows) { "windows" } else { "unix" };
        self.platforms
            .as_ref()
            .is_none_or(|platforms| platforms.iter().any(|p| p == host))
    }

    fn input<T: DeserializeOwned>(&self) -> T {
        serde_json::from_value(self.input.clone())
            .unwrap_or_else(|err| panic!("{}: input: {err}", self.name))
    }
}

/// What a case gives here: the value its `expect` holds, or its error.
enum Outcome {
    Expect(Value),
    Error(ErrorSpec),
}

fn error(kind: &str, message: Option<String>) -> Outcome {
    Outcome::Error(ErrorSpec {
        kind: kind.to_string(),
        message,
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AtInput {
    obj: Value,
    key: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct YamlInput {
    yaml: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResolveInput {
    value: String,
    base_dir: String,
    home: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SubstituteInput {
    value: String,
    names: BTreeMap<String, String>,
    setting: String,
    #[serde(default)]
    define_hint: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NeedsInput {
    tool: String,
    project_file: String,
    machine_path: String,
    #[serde(default)]
    scaffold_hint: Option<String>,
    keys: Vec<KeyRow>,
    config: String,
    #[serde(default)]
    unless_input: Option<String>,
    command: Vec<String>,
    project_file_exists: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct KeyRow {
    key: String,
    scope: String,
    description: String,
}

/// `value_is_set`. `null` is a value here, not an absent one, so the input
/// is read as a map: `value` holds the value, `missing: true` passes none.
fn value_is_set(case: &Case) -> Outcome {
    let input: Map<String, Value> = case.input();
    if let Some(key) = input.keys().find(|k| *k != "value" && *k != "missing") {
        panic!("{}: input: unknown field {key}", case.name);
    }
    let got = match (input.get("value"), input.get("missing")) {
        (Some(v), None) => value::value_is_set(Some(v)),
        (None, Some(Value::Bool(true))) => value::value_is_set(None),
        _ => panic!("{}: input: give exactly one of value and missing: true", case.name),
    };
    Outcome::Expect(json!({ "set": got }))
}

fn value_at(case: &Case) -> Outcome {
    let input: AtInput = case.input();
    Outcome::Expect(match value::value_at(&input.obj, &input.key) {
        Some(found) => json!({ "found": true, "value": found }),
        None => json!({ "found": false }),
    })
}

fn yaml(case: &Case, dir: &Path) -> Outcome {
    let input: YamlInput = case.input();
    let path = dir.join("config.yaml");
    fs::write(&path, &input.yaml).unwrap();
    match file::read_mapping(&path) {
        Ok(map) => Outcome::Expect(json!({ "mapping": map })),
        // The YAML crate's error is a parse failure, or a key that is not a
        // scalar. A top level that is not a mapping carries a plain message.
        Err(FileProblem::Malformed { source, .. }) => {
            if source.downcast_ref::<serde_saphyr::Error>().is_some() {
                error("invalid_yaml", None)
            } else {
                error("not_a_mapping", None)
            }
        }
        Err(other) => panic!("{}: a problem the suite has no kind for: {other}", case.name),
    }
}

fn resolve_config_path(case: &Case) -> Outcome {
    let input: ResolveInput = case.input();
    let got = paths::resolve_config_path(
        &input.value,
        Path::new(&input.base_dir),
        Path::new(&input.home),
    );
    Outcome::Expect(json!({ "path": got }))
}

fn substitute_path_names(case: &Case) -> Outcome {
    let input: SubstituteInput = case.input();
    let names: PathNames = input
        .names
        .iter()
        .map(|(name, dir)| (name.clone(), PathBuf::from(dir)))
        .collect();
    let got = match &input.define_hint {
        Some(hint) => {
            paths::substitute_path_names_with_hint(&input.value, &names, &input.setting, hint)
        }
        None => paths::substitute_path_names(&input.value, &names, &input.setting),
    };
    match got {
        Ok(text) => Outcome::Expect(json!({ "text": text })),
        Err(err) => error("unknown_path_name", Some(err.to_string())),
    }
}

fn needs(case: &Case, dir: &Path) -> Outcome {
    let input: NeedsInput = case.input();
    // `Needs` borrows its key table for 'static. Leaking a few strings in a test is fine.
    let keys: &'static [KeySpec] = Box::leak(
        input
            .keys
            .iter()
            .map(|row| KeySpec {
                key: leak(&row.key),
                scope: match row.scope.as_str() {
                    "project" => Scope::Project,
                    "machine" => Scope::Machine,
                    "both" => Scope::Both,
                    other => panic!("{}: unknown scope {other}", case.name),
                },
                description: leak(&row.description),
            })
            .collect::<Vec<_>>()
            .into_boxed_slice(),
    );
    let needs = Needs::new(
        &input.tool,
        &input.project_file,
        keys,
        PathBuf::from(&input.machine_path),
        input.scaffold_hint.as_deref().map(leak),
    );
    let root = dir.join("project");
    fs::create_dir_all(&root).unwrap();
    if input.project_file_exists {
        fs::write(root.join(&input.project_file), "").unwrap();
    }
    let need = Need {
        config: leak(&input.config),
        unless_input: input.unless_input.as_deref().map(leak),
    };
    let command: Vec<&str> = input.command.iter().map(String::as_str).collect();
    let message = needs
        .message(&need, &root, &command)
        .replace(&*root.to_string_lossy(), "{project_root}");
    Outcome::Expect(json!({ "message": message }))
}

fn leak(s: &str) -> &'static str {
    Box::leak(s.to_string().into_boxed_str())
}

/// What `section`'s case gives here. Each case gets a fresh directory.
fn run(section: &str, case: &Case) -> Outcome {
    let dir = tempfile::tempdir().unwrap();
    match section {
        "value_is_set" => value_is_set(case),
        "value_at" => value_at(case),
        "yaml" => yaml(case, dir.path()),
        "resolve_config_path" => resolve_config_path(case),
        "substitute_path_names" => substitute_path_names(case),
        "needs" => needs(case, dir.path()),
        other => panic!("the suite has a section this crate does not run: {other}"),
    }
}

/// Whether `got` matches the case's `expect` or `error`. The error message
/// is compared only where the case sets one.
fn matches(case: &Case, got: &Outcome) -> bool {
    match (got, &case.expect, &case.error) {
        (Outcome::Expect(value), Some(expect), None) => value == expect,
        (Outcome::Error(err), None, Some(want)) => {
            err.kind == want.kind && (want.message.is_none() || err.message == want.message)
        }
        (_, None, None) | (_, Some(_), Some(_)) => {
            panic!("{}: give exactly one of expect and error", case.name)
        }
        _ => false,
    }
}

#[test]
fn every_case_in_the_suite_matches() {
    let suite: Suite =
        serde_json::from_str(SUITE_JSON).expect("the suite is valid JSON in the suite format");
    assert_eq!(suite.family, "config-layers");
    let mut failures = Vec::new();
    let mut ran = 0;
    for (section, body) in &suite.sections {
        for case in &body.cases {
            if !case.runs_here() {
                continue;
            }
            let got = run(section, case);
            ran += 1;
            if !matches(case, &got) {
                let got = match got {
                    Outcome::Expect(value) => format!("expect {value}"),
                    Outcome::Error(err) => format!("error {err:?}"),
                };
                failures.push(format!("{section}: {}: got {got}", case.name));
            }
        }
    }
    assert!(ran > 0, "no case ran");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

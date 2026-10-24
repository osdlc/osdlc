//! Runs the shared parity fixture against this crate.
//!
//! `tests/fixtures/parity.json` defines the behaviour this crate and the
//! TypeScript package `@osdlc/config-layers` share. The package reads the same
//! file in `packages/ts/config-layers/tests/parity.test.ts`: same input, same
//! result. A shared case goes in the fixture, never in only one of the two
//! suites. What the two do differently is listed in the TypeScript package's
//! README, not here.
//!
//! An integration test, so it reaches the crate only through the public API.

use std::collections::BTreeMap;
use std::fs;
#[cfg(unix)]
use std::path::{Path, PathBuf};

use config_layers::serde_json::{self, Value};
use config_layers::{file, value};
#[cfg(unix)]
use config_layers::{
    needs::{KeySpec, Need, Needs, Scope},
    paths::{self, PathNames},
};
use serde::Deserialize;

/// Compiled in, not read at runtime. The test binary carries the fixture, and
/// a moved or deleted fixture is a build error, not a late panic.
const FIXTURE_JSON: &str = include_str!("fixtures/parity.json");

/// Every top-level key, so a misspelled or stray one fails here.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Fixture {
    #[serde(rename = "_comment")]
    _comment: Vec<String>,
    value_is_set: Vec<IsSetCase>,
    value_at: Vec<AtCase>,
    yaml: Vec<YamlCase>,
    #[cfg_attr(not(unix), allow(dead_code))]
    resolve_config_path: Vec<ResolveCase>,
    #[cfg_attr(not(unix), allow(dead_code))]
    substitute_path_names: Vec<SubstituteCase>,
    #[cfg_attr(not(unix), allow(dead_code))]
    needs: Vec<NeedsGroup>,
}

fn fixture() -> Fixture {
    serde_json::from_str(FIXTURE_JSON).expect("the fixture parses")
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IsSetCase {
    name: String,
    #[serde(default)]
    missing: bool,
    #[serde(default)]
    value: Value,
    expected: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AtCase {
    name: String,
    obj: Value,
    key: String,
    found: bool,
    #[serde(default)]
    value: Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct YamlCase {
    name: String,
    yaml: String,
    #[serde(default)]
    expected: Value,
    #[serde(default)]
    error: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(not(unix), allow(dead_code))]
struct ResolveCase {
    name: String,
    value: String,
    base_dir: String,
    home: String,
    expected: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(not(unix), allow(dead_code))]
struct SubstituteCase {
    name: String,
    value: String,
    names: BTreeMap<String, String>,
    setting: String,
    #[serde(default)]
    define_hint: Option<String>,
    #[serde(default)]
    expected: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(not(unix), allow(dead_code))]
struct NeedsGroup {
    name: String,
    tool: String,
    project_file: String,
    machine_path: String,
    #[serde(default)]
    scaffold_hint: Option<String>,
    keys: Vec<KeyRow>,
    cases: Vec<NeedsCase>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(not(unix), allow(dead_code))]
struct KeyRow {
    key: String,
    scope: String,
    description: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
#[cfg_attr(not(unix), allow(dead_code))]
struct NeedsCase {
    name: String,
    config: String,
    #[serde(default)]
    unless_input: Option<String>,
    command: Vec<String>,
    project_file_exists: bool,
    expected: String,
}

#[test]
fn value_is_set_matches_the_fixture() {
    for case in fixture().value_is_set {
        let got = value::value_is_set(if case.missing {
            None
        } else {
            Some(&case.value)
        });
        assert_eq!(got, case.expected, "{}", case.name);
    }
}

#[test]
fn value_at_matches_the_fixture() {
    for case in fixture().value_at {
        let got = value::value_at(&case.obj, &case.key);
        if case.found {
            assert_eq!(got, Some(&case.value), "{}", case.name);
        } else {
            assert_eq!(got, None, "{}", case.name);
        }
    }
}

#[test]
fn yaml_reading_matches_the_fixture() {
    let dir = tempfile::tempdir().unwrap();
    for (i, case) in fixture().yaml.into_iter().enumerate() {
        let path = dir.path().join(format!("yaml-{i}.yaml"));
        fs::write(&path, &case.yaml).unwrap();
        let read = file::read_mapping(&path);
        if case.error {
            assert!(read.is_err(), "{}: expected an error", case.name);
        } else {
            let map = read.unwrap_or_else(|err| panic!("{}: {err}", case.name));
            assert_eq!(Value::Object(map), case.expected, "{}", case.name);
        }
    }
}

#[cfg(unix)]
#[test]
fn resolve_config_path_matches_the_fixture() {
    for case in fixture().resolve_config_path {
        let got = paths::resolve_config_path(
            &case.value,
            Path::new(&case.base_dir),
            Path::new(&case.home),
        );
        assert_eq!(got, case.expected, "{}", case.name);
    }
}

#[cfg(unix)]
#[test]
fn substitute_path_names_matches_the_fixture() {
    for case in fixture().substitute_path_names {
        let names: PathNames = case
            .names
            .iter()
            .map(|(name, dir)| (name.clone(), PathBuf::from(dir)))
            .collect();
        let got = match &case.define_hint {
            Some(hint) => {
                paths::substitute_path_names_with_hint(&case.value, &names, &case.setting, hint)
            }
            None => paths::substitute_path_names(&case.value, &names, &case.setting),
        };
        match (got, &case.expected, &case.error) {
            (Ok(text), Some(expected), None) => assert_eq!(&text, expected, "{}", case.name),
            (Err(err), None, Some(expected)) => {
                assert_eq!(&err.to_string(), expected, "{}", case.name)
            }
            (got, _, _) => panic!("{}: unexpected result {got:?}", case.name),
        }
    }
}

#[cfg(unix)]
#[test]
fn the_unmet_need_message_matches_the_fixture() {
    let dir = tempfile::tempdir().unwrap();
    for (g, group) in fixture().needs.into_iter().enumerate() {
        // `Needs` borrows its key table for 'static. Leaking a few strings in a test is fine.
        let keys: &'static [KeySpec] = Box::leak(
            group
                .keys
                .iter()
                .map(|row| KeySpec {
                    key: leak(&row.key),
                    scope: match row.scope.as_str() {
                        "project" => Scope::Project,
                        "machine" => Scope::Machine,
                        "both" => Scope::Both,
                        other => panic!("unknown scope {other}"),
                    },
                    description: leak(&row.description),
                })
                .collect::<Vec<_>>()
                .into_boxed_slice(),
        );
        let needs = Needs::new(
            &group.tool,
            &group.project_file,
            keys,
            PathBuf::from(&group.machine_path),
            group.scaffold_hint.as_deref().map(leak),
        );
        for (i, case) in group.cases.iter().enumerate() {
            let root = dir.path().join(format!("needs-{g}-{i}"));
            fs::create_dir_all(&root).unwrap();
            if case.project_file_exists {
                fs::write(root.join(&group.project_file), "").unwrap();
            }
            let need = Need {
                config: leak(&case.config),
                unless_input: case.unless_input.as_deref().map(leak),
            };
            let command: Vec<&str> = case.command.iter().map(String::as_str).collect();
            let got = needs.message(&need, &root, &command);
            let expected = case
                .expected
                .replace("{project_root}", &root.to_string_lossy());
            assert_eq!(got, expected, "{}: {}", group.name, case.name);
        }
    }
}

#[cfg(unix)]
fn leak(s: &str) -> &'static str {
    Box::leak(s.to_string().into_boxed_str())
}

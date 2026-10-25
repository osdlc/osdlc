//! Read the project and machine config files, fill the project file's gaps
//! from the machine file, and resolve path values. Built on
//! [`resolve_config_path`] and [`value_is_set`].
//!
//! A config file here is a YAML mapping read into a
//! [`serde_json::Map`]. The map iterates in sorted key order, unless a
//! consumer turns on `serde_json`'s `preserve_order` feature.

use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use crate::paths::resolve_config_path;
use crate::value::{value_at_mut, value_is_set};

/// What can go wrong loading a config file.
///
/// New variants may be added in a compatible release, so a `match` needs a
/// wildcard arm.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum FileProblem {
    /// The file could not be read at all (missing, permission denied, …).
    #[error("cannot read {}", path.display())]
    Unreadable {
        /// The path that was read.
        path: PathBuf,
        /// The [`std::io::Error`].
        #[source]
        source: Box<dyn std::error::Error + Send + Sync>,
    },
    /// The file was read but is not a YAML mapping at the top level, or does
    /// not deserialize as the caller's type.
    ///
    /// The `Display` text names the file only. The cause, with its line and
    /// column, is the [`source`](std::error::Error::source). No file contents
    /// are quoted, since a machine file can hold secrets.
    #[error("{} is not a valid config file", path.display())]
    Malformed {
        /// The path that was read.
        path: PathBuf,
        /// What is wrong with it: the YAML crate's error for a syntax or
        /// type error, or a plain message for an empty document or a
        /// top level that is not a mapping.
        #[source]
        source: Box<dyn std::error::Error + Send + Sync>,
    },
}

/// The source of a [`FileProblem::Malformed`] that is not a YAML error: the
/// document parsed but is not a mapping.
#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub(crate) struct NotAMapping(pub(crate) String);

impl FileProblem {
    pub(crate) fn unreadable(path: &Path, err: std::io::Error) -> Self {
        Self::Unreadable {
            path: path.to_path_buf(),
            source: Box::new(err),
        }
    }

    pub(crate) fn malformed(
        path: &Path,
        err: impl Into<Box<dyn std::error::Error + Send + Sync>>,
    ) -> Self {
        Self::Malformed {
            path: path.to_path_buf(),
            source: err.into(),
        }
    }
}

/// The YAML options every read in this crate uses: the library defaults,
/// except that
///
/// - only `true` and `false` are booleans (`yes`, `no`, `on` and `off` stay
///   strings),
/// - `.inf`, `.nan` and overflowing numbers such as `1e999` read as strings,
///   since a JSON number cannot hold them,
/// - `<<` is an ordinary key and not a merge key, and
/// - an error does not quote the file's lines.
///
/// The default `budget` is kept. It caps the parser's events, aliases and
/// anchors far above any real config file. It also stops a file someone else
/// wrote from using up memory through nested aliases.
pub(crate) fn yaml_options() -> serde_saphyr::Options {
    let mut options = serde_saphyr::Options::default();
    options.strict_booleans = true;
    options.non_finite_float_policy = serde_saphyr::NonFiniteFloatPolicy::AsString;
    options.merge_keys = serde_saphyr::MergeKeyPolicy::AsOrdinary;
    options.with_snippet = false;
    options
}

/// Read `path` and parse it as a YAML mapping.
///
/// Any I/O failure (missing file, permission denied) is
/// [`FileProblem::Unreadable`]. A file that reads but does not parse as YAML,
/// or that parses to something other than a mapping at the top level (a
/// list, a scalar, `null`, an empty document), is [`FileProblem::Malformed`].
///
/// Only `true` and `false` are booleans. Keys are strings: a scalar key such
/// as `1` reads as `"1"`, and a list, a mapping or a null key (`~: x`) is an
/// error. Integers beyond `u64` read as lossy floats, with no error. YAML
/// tags are not kept.
///
/// # Errors
///
/// [`FileProblem::Unreadable`] or [`FileProblem::Malformed`], as above.
///
/// **Stability:** stable in 0.x.
pub fn read_mapping(path: &Path) -> Result<Map<String, Value>, FileProblem> {
    let contents =
        std::fs::read_to_string(path).map_err(|err| FileProblem::unreadable(path, err))?;
    let value: Option<Value> = serde_saphyr::from_str_with_options(&contents, yaml_options())
        .map_err(|err| FileProblem::malformed(path, err))?;
    match value {
        Some(Value::Object(map)) => Ok(map),
        other => Err(FileProblem::malformed(
            path,
            NotAMapping(format!(
                "expected a mapping at the top level, found {}",
                kind_of(other.as_ref())
            )),
        )),
    }
}

fn kind_of(value: Option<&Value>) -> &'static str {
    match value {
        None | Some(Value::Null) => "an empty document",
        Some(Value::Bool(_)) => "a boolean",
        Some(Value::Number(_)) => "a number",
        Some(Value::String(_)) => "a string",
        Some(Value::Array(_)) => "a sequence",
        Some(Value::Object(_)) => "a mapping",
    }
}

/// Walk from `cwd` upward through parent directories (inclusive of `cwd`)
/// looking for an entry named `file_name`. Returns the first match, or `None`
/// if the search reaches the filesystem root without finding one.
///
/// Any entry counts, not only a file. A directory of that name stops the
/// walk, so the caller reports it as an unreadable config instead of walking
/// past it.
///
/// **Stability:** stable in 0.x.
pub fn find_up(cwd: &Path, file_name: &str) -> Option<PathBuf> {
    let mut dir = Some(cwd);
    while let Some(d) = dir {
        let candidate = d.join(file_name);
        if candidate.exists() {
            return Some(candidate);
        }
        dir = d.parent();
    }
    None
}

/// Fill the gaps in the project file's settings from the machine file's.
///
/// Works on the top-level keys only. Nested mappings are not merged. A key
/// the project file sets keeps its value. A key the project file leaves out,
/// or leaves unset per [`value_is_set`] (null, an empty or whitespace-only
/// string, an empty list or mapping), takes the machine file's value. A key
/// only the machine file has is added.
///
/// **Stability:** stable in 0.x.
pub fn overlay_top_level(
    project: Map<String, Value>,
    machine: &Map<String, Value>,
) -> Map<String, Value> {
    let mut merged = project;
    for (key, machine_value) in machine.iter() {
        if !value_is_set(merged.get(key)) {
            merged.insert(key.clone(), machine_value.clone());
        }
    }
    merged
}

/// For each dotted key in `dotted_keys`, look up the value in `map` and, if
/// it is a YAML string, replace it in place with the result of
/// [`resolve_config_path`] against `base`, with `~` expanding to `home`.
/// A missing key or a value that is not a string is left alone.
///
/// **Stability:** stable in 0.x.
pub fn resolve_paths_at(
    map: &mut Map<String, Value>,
    dotted_keys: &[&str],
    base: &Path,
    home: &Path,
) {
    for dotted in dotted_keys {
        if let Some(Value::String(s)) = value_at_mut(map, dotted) {
            *s = resolve_config_path(s, base, home);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    mod read_mapping_tests {
        use super::*;

        #[test]
        fn a_missing_file_is_unreadable() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("nope.yaml");
            let err = read_mapping(&path).unwrap_err();
            assert!(matches!(err, FileProblem::Unreadable { .. }));
        }

        #[test]
        fn invalid_yaml_is_malformed() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("bad.yaml");
            fs::write(&path, "key: [unclosed").unwrap();
            let err = read_mapping(&path).unwrap_err();
            assert!(matches!(err, FileProblem::Malformed { .. }));
        }

        #[test]
        fn a_non_mapping_top_level_is_malformed() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("list.yaml");
            fs::write(&path, "- one\n- two\n").unwrap();
            let err = read_mapping(&path).unwrap_err();
            assert!(matches!(err, FileProblem::Malformed { .. }));
        }

        #[test]
        fn an_empty_file_is_malformed_and_says_so() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("empty.yaml");
            fs::write(&path, "").unwrap();
            let err = read_mapping(&path).unwrap_err();
            let source = std::error::Error::source(&err).unwrap().to_string();
            assert!(source.contains("found an empty document"), "{source}");
        }

        #[test]
        fn the_problem_carries_its_source_for_a_caller_to_downcast() {
            let dir = tempfile::tempdir().unwrap();

            let err = read_mapping(&dir.path().join("nope.yaml")).unwrap_err();
            let source = std::error::Error::source(&err).expect("an Unreadable has a source");
            let io = source
                .downcast_ref::<std::io::Error>()
                .expect("an io::Error");
            assert_eq!(io.kind(), std::io::ErrorKind::NotFound);

            let path = dir.path().join("bad.yaml");
            fs::write(&path, "key: [unclosed").unwrap();
            let err = read_mapping(&path).unwrap_err();
            let source = std::error::Error::source(&err).expect("a Malformed has a source");
            assert!(source.downcast_ref::<serde_saphyr::Error>().is_some());
        }

        #[test]
        fn only_true_and_false_are_booleans() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("bools.yaml");
            fs::write(&path, "a: true\nb: false\nc: yes\nd: no\ne: on\nf: off\n").unwrap();
            let map = read_mapping(&path).unwrap();
            assert_eq!(map["a"], Value::Bool(true));
            assert_eq!(map["b"], Value::Bool(false));
            for key in ["c", "d", "e", "f"] {
                assert!(map[key].is_string(), "{key} is {:?}", map[key]);
            }
        }

        #[test]
        fn a_duplicate_key_is_malformed() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("dup.yaml");
            fs::write(&path, "a: 1\na: 2\n").unwrap();
            let err = read_mapping(&path).unwrap_err();
            assert!(matches!(err, FileProblem::Malformed { .. }));
        }

        #[test]
        fn a_non_finite_float_reads_as_a_string_and_the_file_loads() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("inf.yaml");
            fs::write(&path, "a: .inf\nb: -.inf\nc: .nan\nd: 1e999\ne: 1.5\n").unwrap();
            let map = read_mapping(&path).unwrap();
            for key in ["a", "b", "c", "d"] {
                assert!(map[key].is_string(), "{key} is {:?}", map[key]);
            }
            assert_eq!(map["a"], Value::String(".inf".to_string()));
            assert_eq!(map["e"], Value::from(1.5));
        }

        #[test]
        fn a_merge_key_stays_an_ordinary_key() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("merge.yaml");
            fs::write(&path, "base: &base\n  x: 1\nm:\n  <<: *base\n  y: 2\n").unwrap();
            let map = read_mapping(&path).unwrap();
            assert_eq!(map["m"], serde_json::json!({ "<<": { "x": 1 }, "y": 2 }));
        }

        #[test]
        fn an_error_does_not_quote_the_files_lines() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("secret.yaml");
            fs::write(&path, "token: [hunter2-secret\n").unwrap();
            let err = read_mapping(&path).unwrap_err();
            let mut chain = err.to_string();
            let mut cause = std::error::Error::source(&err);
            while let Some(c) = cause {
                chain.push_str(&c.to_string());
                cause = c.source();
            }
            assert!(!chain.contains("hunter2-secret"), "{chain}");
        }

        #[test]
        fn display_does_not_repeat_the_source() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("bad.yaml");
            fs::write(&path, "key: [unclosed").unwrap();
            let err = read_mapping(&path).unwrap_err();
            let source = std::error::Error::source(&err).unwrap().to_string();
            assert!(!err.to_string().contains(&source), "{err}");
        }

        #[test]
        fn a_tag_is_dropped_and_its_value_kept() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("tag.yaml");
            fs::write(&path, "a: !custom x\n").unwrap();
            let map = read_mapping(&path).unwrap();
            assert_eq!(map["a"], Value::String("x".to_string()));
        }

        #[test]
        fn scalar_keys_read_as_strings_and_a_collection_key_is_malformed() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("keys.yaml");

            fs::write(&path, "1: a\ntrue: b\n").unwrap();
            let map = read_mapping(&path).unwrap();
            assert_eq!(map["1"], Value::String("a".to_string()));
            assert_eq!(map["true"], Value::String("b".to_string()));

            fs::write(&path, "? [x]\n: c\n").unwrap();
            let err = read_mapping(&path).unwrap_err();
            assert!(matches!(err, FileProblem::Malformed { .. }));
        }

        #[test]
        fn a_good_file_parses() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("good.yaml");
            fs::write(&path, "authority: origin\n").unwrap();
            let map = read_mapping(&path).unwrap();
            assert_eq!(
                map.get("authority"),
                Some(&Value::String("origin".to_string()))
            );
        }
    }

    mod find_up_tests {
        use super::*;

        #[test]
        fn finds_a_file_two_directories_up() {
            let dir = tempfile::tempdir().unwrap();
            let marker = dir.path().join("marker.yaml");
            fs::write(&marker, "x: 1\n").unwrap();
            let nested = dir.path().join("a").join("b");
            fs::create_dir_all(&nested).unwrap();
            assert_eq!(find_up(&nested, "marker.yaml"), Some(marker));
        }

        #[test]
        fn returns_none_when_absent() {
            let dir = tempfile::tempdir().unwrap();
            let nested = dir.path().join("a").join("b");
            fs::create_dir_all(&nested).unwrap();
            assert_eq!(find_up(&nested, "does-not-exist.yaml"), None);
        }

        #[test]
        fn a_match_in_cwd_itself_is_found() {
            let dir = tempfile::tempdir().unwrap();
            let marker = dir.path().join("marker.yaml");
            fs::write(&marker, "x: 1\n").unwrap();
            assert_eq!(find_up(dir.path(), "marker.yaml"), Some(marker));
        }

        #[test]
        fn a_directory_of_that_name_stops_the_walk() {
            let dir = tempfile::tempdir().unwrap();
            fs::write(dir.path().join("marker.yaml"), "x: 1\n").unwrap();
            let shadow = dir.path().join("a").join("marker.yaml");
            fs::create_dir_all(&shadow).unwrap();
            let nested = dir.path().join("a").join("b");
            fs::create_dir_all(&nested).unwrap();
            assert_eq!(find_up(&nested, "marker.yaml"), Some(shadow));
        }
    }

    mod overlay_top_level_tests {
        use super::*;

        fn mapping(pairs: &[(&str, Value)]) -> Map<String, Value> {
            let mut map = Map::new();
            for (k, v) in pairs {
                map.insert(k.to_string(), v.clone());
            }
            map
        }

        #[test]
        fn project_wins_on_an_overlapping_key() {
            let project = mapping(&[("authority", Value::String("project".to_string()))]);
            let machine = mapping(&[("authority", Value::String("machine".to_string()))]);
            let merged = overlay_top_level(project, &machine);
            assert_eq!(
                merged.get("authority"),
                Some(&Value::String("project".to_string()))
            );
        }

        #[test]
        fn a_project_null_falls_back_to_machine() {
            let project = mapping(&[("authority", Value::Null)]);
            let machine = mapping(&[("authority", Value::String("machine".to_string()))]);
            let merged = overlay_top_level(project, &machine);
            assert_eq!(
                merged.get("authority"),
                Some(&Value::String("machine".to_string()))
            );
        }

        #[test]
        fn a_set_project_value_is_kept_even_when_falsy() {
            let machine = mapping(&[
                ("flag", Value::Bool(true)),
                ("count", Value::from(9)),
                ("name", Value::String("machine".to_string())),
            ]);
            let project = mapping(&[
                ("flag", Value::Bool(false)),
                ("count", Value::from(0)),
                ("name", Value::String("project".to_string())),
            ]);
            let merged = overlay_top_level(project.clone(), &machine);
            assert_eq!(merged, project);
        }

        #[test]
        fn every_unset_project_value_falls_back_to_machine() {
            let unset = [
                Value::Null,
                Value::String(String::new()),
                Value::String("   ".to_string()),
                Value::Array(vec![]),
                Value::Object(Map::new()),
            ];
            for value in unset {
                let project = mapping(&[("k", value.clone())]);
                let machine = mapping(&[("k", Value::String("machine".to_string()))]);
                let merged = overlay_top_level(project, &machine);
                assert_eq!(
                    merged.get("k"),
                    Some(&Value::String("machine".to_string())),
                    "project value {value:?}"
                );
            }
        }

        #[test]
        fn nested_mappings_are_not_merged() {
            let project = mapping(&[("paths", serde_json::json!({ "dev": "/p" }))]);
            let machine = mapping(&[("paths", serde_json::json!({ "dev": "/m", "work": "/w" }))]);
            let merged = overlay_top_level(project, &machine);
            assert_eq!(merged["paths"], serde_json::json!({ "dev": "/p" }));
        }

        #[test]
        fn a_machine_only_key_is_added() {
            let project = mapping(&[]);
            let machine = mapping(&[("lease_authority", Value::String("m".to_string()))]);
            let merged = overlay_top_level(project, &machine);
            assert_eq!(
                merged.get("lease_authority"),
                Some(&Value::String("m".to_string()))
            );
        }
    }

    mod resolve_paths_at_tests {
        use super::*;

        #[test]
        fn resolves_a_relative_and_a_tilde_value_in_place_leaving_others_alone() {
            let mut map = Map::new();
            map.insert("checkout".to_string(), Value::String("./repos".to_string()));
            map.insert("home_dir".to_string(), Value::String("~/x".to_string()));
            map.insert("port".to_string(), Value::from(8080));

            let base = Path::new("/work/app");
            let home = Path::new("/home/me");
            resolve_paths_at(&mut map, &["checkout", "home_dir", "port"], base, home);

            // Compared as paths, so the test holds where the separator is `\`.
            let path_at = |key: &str| PathBuf::from(map.get(key).unwrap().as_str().unwrap());
            assert_eq!(path_at("checkout"), base.join("repos"));
            assert_eq!(path_at("home_dir"), home.join("x"));
            assert_eq!(map.get("port"), Some(&Value::from(8080)));
        }

        #[test]
        fn a_dotted_key_resolves_a_nested_value_and_skips_non_mappings() {
            let mut map = match serde_json::json!({
                "checkout": { "root": "./repos" },
                "list": ["./a"],
                "s": "./scalar",
                "paths": { "n": 3 },
            }) {
                Value::Object(map) => map,
                _ => unreachable!(),
            };

            let base = Path::new("/work/app");
            let home = Path::new("/home/me");
            resolve_paths_at(
                &mut map,
                &[
                    "checkout.root",
                    "list.0",
                    "s.x",
                    "paths.n",
                    "checkout.nope.deeper",
                ],
                base,
                home,
            );

            let root = PathBuf::from(map["checkout"]["root"].as_str().unwrap());
            assert_eq!(root, base.join("repos"));
            assert_eq!(map["list"], serde_json::json!(["./a"]));
            assert_eq!(map["s"], serde_json::json!("./scalar"));
            assert_eq!(map["paths"], serde_json::json!({ "n": 3 }));
            // The path through a missing key added nothing.
            assert_eq!(map["checkout"].as_object().unwrap().len(), 1);
        }

        #[test]
        fn a_missing_key_is_a_no_op() {
            let mut map = Map::new();
            resolve_paths_at(&mut map, &["nope"], Path::new("/work/app"), Path::new("/h"));
            assert!(map.is_empty());
        }
    }
}

//! Reading, merging, and path-resolving the project/machine config file
//! pair, built on [`resolve_config_path`] and [`value_is_set`].

use std::path::{Path, PathBuf};

use crate::paths::resolve_config_path;
use crate::value::value_is_set;

/// What can go wrong loading a config file.
///
/// New variants may be added in a compatible release (0.5.z), so a `match` needs a
/// wildcard arm.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum FileProblem {
    /// The file could not be read at all (missing, permission denied, …).
    #[error("cannot read {}: {detail}", path.display())]
    Unreadable {
        /// The path that was read.
        path: PathBuf,
        /// The I/O error, as text.
        detail: String,
    },
    /// The file was read but is not a YAML mapping at the top level, or does
    /// not deserialize as the caller's type.
    #[error("{} is not a valid config file: {detail}", path.display())]
    Malformed {
        /// The path that was read.
        path: PathBuf,
        /// What is wrong with it, as text.
        detail: String,
    },
}

/// Read `path` and parse it as a YAML mapping.
///
/// Any I/O failure (missing file, permission denied) is
/// [`FileProblem::Unreadable`]; a file that reads but does not parse as YAML,
/// or that parses to something other than a mapping at the top level (a
/// list, a scalar, `null`), is [`FileProblem::Malformed`].
///
/// # Errors
///
/// [`FileProblem::Unreadable`] or [`FileProblem::Malformed`], as above.
///
/// **Stability:** stable in 0.x.
pub fn read_mapping(path: &Path) -> Result<serde_yaml::Mapping, FileProblem> {
    let contents = std::fs::read_to_string(path).map_err(|err| FileProblem::Unreadable {
        path: path.to_path_buf(),
        detail: err.to_string(),
    })?;
    let value: serde_yaml::Value =
        serde_yaml::from_str(&contents).map_err(|err| FileProblem::Malformed {
            path: path.to_path_buf(),
            detail: err.to_string(),
        })?;
    match value {
        serde_yaml::Value::Mapping(map) => Ok(map),
        other => Err(FileProblem::Malformed {
            path: path.to_path_buf(),
            detail: format!(
                "expected a mapping at the top level, found {}",
                kind_of(&other)
            ),
        }),
    }
}

fn kind_of(value: &serde_yaml::Value) -> &'static str {
    match value {
        serde_yaml::Value::Null => "an empty document",
        serde_yaml::Value::Bool(_) => "a boolean",
        serde_yaml::Value::Number(_) => "a number",
        serde_yaml::Value::String(_) => "a string",
        serde_yaml::Value::Sequence(_) => "a sequence",
        serde_yaml::Value::Mapping(_) => "a mapping",
        serde_yaml::Value::Tagged(_) => "a tagged value",
    }
}

/// Walk from `cwd` upward through parent directories (inclusive of `cwd`)
/// looking for an entry named `file_name`. Returns the first match, or `None`
/// if the search reaches the filesystem root without finding one.
///
/// Existence, not file-ness: a directory of that name stops the walk, so the
/// caller reports it as an unreadable config rather than walking past it.
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

/// Merge `machine` onto `project` at the top level only (not deep-recursive):
/// for each key present in `machine` but absent, or not "set" per
/// [`value_is_set`], in `project`, take machine's value; otherwise keep
/// project's.
///
/// **Stability:** stable in 0.x.
pub fn overlay_top_level(
    project: serde_yaml::Mapping,
    machine: &serde_yaml::Mapping,
) -> serde_yaml::Mapping {
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
    map: &mut serde_yaml::Mapping,
    dotted_keys: &[&str],
    base: &Path,
    home: &Path,
) {
    for dotted in dotted_keys {
        let segments: Vec<&str> = dotted.split('.').collect();
        if let Some(serde_yaml::Value::String(s)) = value_at_mut(map, &segments) {
            *s = resolve_config_path(s, base, home);
        }
    }
}

fn value_at_mut<'a>(
    map: &'a mut serde_yaml::Mapping,
    segments: &[&str],
) -> Option<&'a mut serde_yaml::Value> {
    let (first, rest) = segments.split_first()?;
    let mut cur = map.get_mut(*first)?;
    for seg in rest {
        cur = cur.get_mut(*seg)?;
    }
    Some(cur)
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
            assert!(err.to_string().contains("found an empty document"), "{err}");
        }

        #[test]
        fn a_good_file_parses() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("good.yaml");
            fs::write(&path, "authority: origin\n").unwrap();
            let map = read_mapping(&path).unwrap();
            assert_eq!(
                map.get("authority"),
                Some(&serde_yaml::Value::String("origin".to_string()))
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
    }

    mod overlay_top_level_tests {
        use super::*;
        use serde_yaml::Value;

        fn mapping(pairs: &[(&str, Value)]) -> serde_yaml::Mapping {
            let mut map = serde_yaml::Mapping::new();
            for (k, v) in pairs {
                map.insert(Value::String(k.to_string()), v.clone());
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
        use serde_yaml::Value;

        #[test]
        fn resolves_a_relative_and_a_tilde_value_in_place_leaving_others_alone() {
            let mut map = serde_yaml::Mapping::new();
            map.insert(
                Value::String("checkout".to_string()),
                Value::String("./repos".to_string()),
            );
            map.insert(
                Value::String("home_dir".to_string()),
                Value::String("~/x".to_string()),
            );
            map.insert(Value::String("port".to_string()), Value::from(8080));

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
        fn a_missing_key_is_a_no_op() {
            let mut map = serde_yaml::Mapping::new();
            resolve_paths_at(&mut map, &["nope"], Path::new("/work/app"), Path::new("/h"));
            assert!(map.is_empty());
        }
    }
}

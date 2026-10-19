//! Named directories, and `{name}` substitution in path settings.
//!
//! A `paths:` map — name -> directory — lives in both config files, and the
//! machine's entry wins per name, since a directory is a fact about a
//! machine. Any other path-valued setting then refers to an entry as
//! `{name}`, so `~/Developer` is written once however many settings need it.
//!
//! Also home to [`resolve_config_path`], the one `~` and relative expansion
//! every config path value goes through. Every function here takes the
//! directories it needs (the base, the home directory) as arguments and
//! never reads the environment or the file system.

use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

/// The default hint appended to a [`substitute_path_names`] error: how to define a
/// missing name.
const DEFAULT_DEFINE_HINT: &str = "define it under paths:";

/// Expand a single config path value relative to `base_dir`.
///
/// URLs (`scheme://…`) and bare words that do not look like paths pass
/// through untouched — a value may legitimately be a name rather than a
/// place. A leading `~` expands to `home`; a relative path resolves against
/// `base_dir`, which is the project root for a project file and, for a
/// machine file, whatever the reading tool considers its working root.
///
/// This never touches the filesystem: resolving a relative path is a lexical
/// join-and-normalize, not a canonicalization, so it works the same whether
/// or not the path exists.
///
/// **Stability:** stable in 0.x.
pub fn resolve_config_path(value: &str, base_dir: &Path, home: &Path) -> String {
    if value.contains("://") {
        return value.to_string();
    }
    let looks_like_path = value.contains('/') || value.starts_with('.') || value.starts_with('~');
    if !looks_like_path {
        return value.to_string();
    }
    let mut p = value.to_string();
    if let Some(rest) = p.strip_prefix('~') {
        p = format!("{}{}", home.to_string_lossy(), rest);
    }
    if Path::new(&p).is_absolute() {
        p
    } else {
        normalize_path(&base_dir.join(&p))
            .to_string_lossy()
            .into_owned()
    }
}

/// Lexically join and normalize a path: resolve `.` and `..` components
/// without touching the filesystem (no symlink resolution, no existence
/// check — unlike `std::fs::canonicalize`).
fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => match out.components().next_back() {
                Some(Component::Normal(_)) => {
                    out.pop();
                }
                _ => out.push(".."),
            },
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Name -> absolute directory.
///
/// **Stability:** stable in 0.x.
pub type PathNames = BTreeMap<String, PathBuf>;

/// The effective `paths:` map: the project's entries under the machine's,
/// each expanded and made absolute against `base_dir`.
///
/// `machine` and `project` are the two files' raw `paths:` maps. `home` is
/// the user's home directory, which `~` expands to.
///
/// **Stability:** stable in 0.x.
pub fn path_names(
    base_dir: &Path,
    home: &Path,
    machine: &BTreeMap<String, String>,
    project: &BTreeMap<String, String>,
) -> PathNames {
    let mut out = PathNames::new();
    for (name, raw) in project.iter().chain(machine.iter()) {
        let resolved = resolve_config_path(raw, base_dir, home);
        let absolute = normalize_path(&base_dir.join(&resolved));
        out.insert(name.clone(), absolute);
    }
    out
}

/// Returned by [`substitute_path_names`] for a `{name}` that nothing defines. Its
/// `Display` text is the whole message.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct PathNameError {
    message: String,
}

/// Replace each `{name}` in `value` with the directory that `names` holds
/// under that name. `~/Developer` is written once in `paths:`, and a setting
/// such as `{dev}/checkouts` then refers to it.
///
/// `setting` names the setting the value comes from (for example `repos:`),
/// for the error message. When a name is not in `names`, the error says to
/// define it "under paths:". See [`substitute_path_names_with_hint`] to name your own
/// files in that hint.
///
/// ```
/// use std::collections::BTreeMap;
/// use std::path::Path;
/// use config_layers::paths::{path_names, substitute_path_names};
///
/// // `dev` is defined once, in the machine file's `paths:` map.
/// let machine = BTreeMap::from([("dev".to_string(), "/home/me/Developer".to_string())]);
/// let names = path_names(Path::new("/work"), Path::new("/home/me"), &machine, &BTreeMap::new());
///
/// let checkouts = substitute_path_names("{dev}/checkouts", &names, "checkout:").unwrap();
/// // Compared as paths: Windows normalizes the separators.
/// assert_eq!(Path::new(&checkouts), Path::new("/home/me/Developer").join("checkouts"));
///
/// let err = substitute_path_names("{nope}/x", &names, "checkout:").unwrap_err();
/// assert!(err.to_string().contains("unknown path name '{nope}'"));
/// ```
///
/// # Errors
///
/// [`PathNameError`] for a `{name}` that `names` does not define.
///
/// **Stability:** stable in 0.x.
pub fn substitute_path_names(
    value: &str,
    names: &PathNames,
    setting: &str,
) -> Result<String, PathNameError> {
    substitute_path_names_with_hint(value, names, setting, DEFAULT_DEFINE_HINT)
}

/// Replace each `{name}` in `value` with the directory that `names` holds
/// under that name, and say in the error where to define a missing one.
///
/// A name nothing defines is a [`PathNameError`] rather than an empty string: a
/// setting that silently expands to `/repo` instead of `/Users/me/dev/repo`
/// fails somewhere far from the typo. The message says where the name was
/// found (`setting`, e.g. `repos:`), how to define it (`define_hint`), and
/// what is available. A `{` with no closing `}` is kept as written.
///
/// # Errors
///
/// [`PathNameError`] for a `{name}` that `names` does not define.
///
/// **Stability:** stable in 0.x.
pub fn substitute_path_names_with_hint(
    value: &str,
    names: &PathNames,
    setting: &str,
    define_hint: &str,
) -> Result<String, PathNameError> {
    let mut out = String::with_capacity(value.len());
    let mut rest = value;
    loop {
        let Some(start) = rest.find('{') else {
            out.push_str(rest);
            break;
        };
        out.push_str(&rest[..start]);
        let after_open = &rest[start + 1..];
        let Some(end) = after_open.find('}') else {
            // No closing brace: the rest has no further name, emit it as-is.
            out.push_str(&rest[start..]);
            break;
        };
        let name = &after_open[..end];
        match names.get(name) {
            Some(path) => out.push_str(&path.to_string_lossy()),
            None => {
                let known: Vec<String> = names.keys().map(|n| format!("{{{n}}}")).collect();
                let mut message =
                    format!("unknown path name '{{{name}}}' in {setting} '{value}'; {define_hint}");
                if !known.is_empty() {
                    message.push_str(&format!(" (available: {})", known.join(", ")));
                }
                return Err(PathNameError { message });
            }
        }
        rest = &after_open[end + 1..];
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("/work/app")
    }

    fn home() -> PathBuf {
        PathBuf::from("/home/me")
    }

    mod resolve_config_path_tests {
        use super::*;

        #[test]
        fn expands_tilde_and_resolves_a_relative_path_against_the_base() {
            // Compared as paths, so the test holds where the separator is `\`.
            let resolve = |v: &str| PathBuf::from(resolve_config_path(v, &root(), &home()));
            assert_eq!(resolve("~/Developer"), home().join("Developer"));
            assert_eq!(resolve("./checkouts"), root().join("checkouts"));
            assert_eq!(resolve("/srv/repos"), PathBuf::from("/srv/repos"));
        }

        #[test]
        fn leaves_alone_what_is_not_a_path_a_url_a_bare_word() {
            assert_eq!(
                resolve_config_path("https://example.com/x", &root(), &home()),
                "https://example.com/x"
            );
            assert_eq!(resolve_config_path("claude", &root(), &home()), "claude");
        }

        #[test]
        fn normalizes_dot_dot_without_touching_the_filesystem() {
            assert_eq!(
                PathBuf::from(resolve_config_path("./a/../b", &root(), &home())),
                root().join("b")
            );
        }
    }

    mod path_names_tests {
        use super::*;

        #[test]
        fn the_machine_entry_wins_per_name_and_every_value_is_absolute() {
            let machine = BTreeMap::from([("dev".to_string(), "~/Machine".to_string())]);
            let project = BTreeMap::from([
                ("dev".to_string(), "./Project".to_string()),
                ("work".to_string(), "./w".to_string()),
            ]);
            let names = path_names(&root(), &home(), &machine, &project);
            assert_eq!(names["dev"], home().join("Machine"));
            assert_eq!(names["work"], root().join("w"));
        }
    }

    mod substitute_path_names_tests {
        use super::*;

        #[test]
        fn an_unclosed_brace_is_kept_as_written() {
            let names = PathNames::from([("dev".to_string(), PathBuf::from("/d"))]);
            assert_eq!(
                substitute_path_names("{dev}/{oops", &names, "repos:").unwrap(),
                "/d/{oops"
            );
        }

        #[test]
        fn replaces_every_name_it_knows() {
            let names = PathNames::from([
                ("dev".to_string(), PathBuf::from("/d")),
                ("owner".to_string(), PathBuf::from("acme")),
            ]);
            assert_eq!(
                substitute_path_names("{dev}/{owner}", &names, "repos:").unwrap(),
                "/d/acme"
            );
        }

        #[test]
        fn an_unknown_name_is_an_error_naming_the_setting_the_fix_and_what_exists() {
            let names = PathNames::from([
                ("dev".to_string(), PathBuf::from("/d")),
                ("home".to_string(), PathBuf::from("/h")),
            ]);
            let err = substitute_path_names("foo/{nope}", &names, "repos:").unwrap_err();
            let message = err.to_string();
            assert_eq!(
                message,
                "unknown path name '{nope}' in repos: 'foo/{nope}'; define it under paths: (available: {dev}, {home})"
            );
            assert!(message.contains("'{nope}'"));
            assert!(message.contains("repos:"));
            assert!(message.contains("define it under paths:"));
            assert!(message.contains("{dev}"));
        }

        #[test]
        fn omits_the_parenthetical_when_no_names_are_known() {
            let names = PathNames::new();
            let err = substitute_path_names("{nope}", &names, "config:").unwrap_err();
            let message = err.to_string();
            assert_eq!(
                message,
                "unknown path name '{nope}' in config: '{nope}'; define it under paths:"
            );
            assert!(!message.contains("(available:"));
        }

        #[test]
        fn the_tool_names_its_own_files_in_the_hint() {
            let names = PathNames::new();
            let err = substitute_path_names_with_hint(
                "{nope}",
                &names,
                "repos:",
                "define it in tooly.yaml",
            )
            .unwrap_err();
            assert!(err.to_string().contains("define it in tooly.yaml"));
        }
    }
}

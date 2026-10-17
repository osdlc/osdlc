//! The machine-level config file: the committed project file's twin for
//! settings that describe THIS machine rather than a project.
//!
//! A project file is committed, so a path like `~/Developer` that only means
//! something on one laptop has no honest place in it. The machine file lives
//! in the config home of the tool's standalone tier
//! (`<config>/<tool>/config.yaml`, resolved by [`tiered_dirs`]), is never
//! committed, and carries only keys that are machine-specific by nature.
//!
//! The contract: every key has a default via [`Default`],
//! [`MachineConfigFile::load`] never errors or panics and degrades to
//! `T::default()` on any problem, and the result is memoised per resolved
//! path. [`MachineConfigFile::read_strict`] is for a caller (a `doctor` or
//! `config check` command) that wants to report the specific problem
//! instead of `load()`'s silent degrade.

use std::cell::RefCell;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use tiered_dirs::TieredDirs;

use crate::file::{self, FileProblem};

/// `tool` upper-cased with every run of characters outside `[A-Z0-9]`
/// collapsed to a single `_`. `mytool` -> `MYTOOL`; `pr-updater` -> `PR_UPDATER`.
/// The stem a machine config's default env var is built from.
///
/// **Stability:** stable in 0.x.
pub fn env_stem(tool: &str) -> String {
    let upper = tool.to_uppercase();
    let mut out = String::with_capacity(upper.len());
    let mut in_run = false;
    for c in upper.chars() {
        if c.is_ascii_uppercase() || c.is_ascii_digit() {
            out.push(c);
            in_run = false;
        } else if !in_run {
            out.push('_');
            in_run = true;
        }
    }
    out
}

/// The uncached read, resolved without any knowledge of `T`: either there is
/// nothing to read (so the caller should use `T::default()`), or there is a
/// validated YAML mapping to deserialize. Keeping this generic-free lets
/// [`MachineConfigFile`] cache it without requiring `T: Clone`.
enum Cached {
    /// Missing, unreadable, malformed, non-mapping, or an empty document.
    Defaults,
    /// A top-level YAML mapping, still to be deserialized into `T`.
    Mapping(serde_yaml::Value),
}

fn load_uncached(path: &Path) -> Cached {
    if !path.is_file() {
        return Cached::Defaults;
    }
    let Ok(contents) = std::fs::read_to_string(path) else {
        return Cached::Defaults;
    };
    let Ok(mut raw) = serde_yaml::from_str::<serde_yaml::Value>(&contents) else {
        return Cached::Defaults;
    };
    if raw.is_null() {
        raw = serde_yaml::Value::Mapping(serde_yaml::Mapping::new());
    }
    if matches!(raw, serde_yaml::Value::Mapping(_)) {
        Cached::Mapping(raw)
    } else {
        Cached::Defaults
    }
}

fn materialize<T: DeserializeOwned + Default>(cached: &Cached) -> T {
    match cached {
        Cached::Defaults => T::default(),
        Cached::Mapping(value) => serde_yaml::from_value(value.clone()).unwrap_or_default(),
    }
}

/// A tool's machine-local config file: `<config>/<tool>/config.yaml` in the
/// standalone config home of a [`TieredDirs`], relocatable through an env var.
///
/// `T` is the file's shape. Every field must carry a sensible default:
/// [`MachineConfigFile::load`] falls back to `T::default()` on a missing,
/// unreadable, malformed, or wrong-shaped file, and never panics doing it.
///
/// The memo uses a [`RefCell`], so a `MachineConfigFile` is not `Sync`.
/// Build one per thread, or wrap it in a lock.
///
/// **Stability:** stable in 0.x.
pub struct MachineConfigFile<T> {
    dir: PathBuf,
    env: String,
    file_name: String,
    cache: RefCell<Option<(PathBuf, Cached)>>,
    _marker: std::marker::PhantomData<T>,
}

impl<T: DeserializeOwned + Default> MachineConfigFile<T> {
    /// A machine config file for `tool`, in the standalone config home that
    /// `dirs` resolves. The vendor and the override variables are whatever
    /// `dirs` was built with. The env var defaults to `<STEM>_MACHINE_CONFIG`
    /// (see [`env_stem`]), the file name to `config.yaml`.
    ///
    /// # Errors
    ///
    /// [`tiered_dirs::Error`] when `tool` is not a valid single path segment.
    pub fn new(tool: &str, dirs: &TieredDirs) -> Result<Self, tiered_dirs::Error> {
        let dir = dirs.standalone(tool)?.config().into_path();
        Ok(Self {
            dir,
            env: format!("{}_MACHINE_CONFIG", env_stem(tool)),
            file_name: "config.yaml".to_string(),
            cache: RefCell::new(None),
            _marker: std::marker::PhantomData,
        })
    }

    /// Override the env var that relocates the file.
    pub fn with_env(mut self, env: &str) -> Self {
        self.env = env.to_string();
        self
    }

    /// Override the file's name inside the tool's config dir.
    pub fn with_file_name(mut self, name: &str) -> Self {
        self.file_name = name.to_string();
        self
    }

    /// The env var that relocates the file.
    pub fn env(&self) -> &str {
        &self.env
    }

    /// `<config-home>/<tool>/<file_name>`, unless the env var names a
    /// non-blank path, in which case that path wins verbatim. A value that
    /// is not valid UTF-8 is used as given; only the blank check reads it
    /// lossily.
    pub fn path(&self) -> PathBuf {
        self.path_with(std::env::var_os(&self.env))
    }

    fn path_with(&self, over: Option<OsString>) -> PathBuf {
        match over {
            Some(over) if !over.to_string_lossy().trim().is_empty() => PathBuf::from(over),
            _ => self.dir.join(&self.file_name),
        }
    }

    /// The file, all defaults filled. A missing file, an unreadable file, a
    /// YAML error, a non-mapping document and a deserialize failure against
    /// `T` all degrade to `T::default()`; this never errors or panics.
    /// Memoised per resolved path; see [`MachineConfigFile::clear_cache`].
    pub fn load(&self) -> T {
        self.load_at(self.path())
    }

    fn load_at(&self, path: PathBuf) -> T {
        // No let chain: they need Rust 1.88, and the floor is 1.85.
        if let Some((cached_path, cached)) = self.cache.borrow().as_ref() {
            if *cached_path == path {
                return materialize::<T>(cached);
            }
        }
        let cached = load_uncached(&path);
        let value = materialize::<T>(&cached);
        *self.cache.borrow_mut() = Some((path, cached));
        value
    }

    /// The same read, without the silent degrade: `Ok(None)` for a missing
    /// file, a [`FileProblem`] for one that exists but cannot be read,
    /// parsed as YAML, or deserialized as `T`. Not memoised.
    ///
    /// # Errors
    ///
    /// [`FileProblem::Unreadable`] when the file exists but cannot be read,
    /// and [`FileProblem::Malformed`] when it is not a YAML mapping or does
    /// not deserialize as `T`.
    pub fn read_strict(&self) -> Result<Option<T>, FileProblem> {
        read_strict_at(&self.path())
    }

    /// Drop the memoised value. Call between test runs, or after a config
    /// file is rewritten out from under a long-lived process.
    pub fn clear_cache(&self) {
        *self.cache.borrow_mut() = None;
    }
}

fn read_strict_at<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, FileProblem> {
    if !path.is_file() {
        return Ok(None);
    }
    let mapping = file::read_mapping(path)?;
    let value = serde_yaml::Value::Mapping(mapping);
    serde_yaml::from_value(value)
        .map(Some)
        .map_err(|err| FileProblem::Malformed {
            path: path.to_path_buf(),
            detail: err.to_string(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::fs;

    use serde::{Deserialize, Serialize};
    use tiered_dirs::BaseDirs;

    #[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Default)]
    #[serde(deny_unknown_fields)]
    struct Checkout {
        #[serde(default)]
        layout: Option<String>,
    }

    #[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Default)]
    #[serde(deny_unknown_fields)]
    struct TestMachineConfig {
        #[serde(default)]
        repos: Vec<String>,
        #[serde(default)]
        paths: BTreeMap<String, String>,
        #[serde(default)]
        checkout: Checkout,
    }

    fn dirs(root: &Path) -> TieredDirs {
        TieredDirs::with_base_dirs("com.example", BaseDirs::rooted(root)).unwrap()
    }

    fn file(root: &Path) -> MachineConfigFile<TestMachineConfig> {
        MachineConfigFile::new("tooly", &dirs(root)).unwrap()
    }

    mod env_stem_tests {
        use super::*;

        #[test]
        fn upper_cases_and_joins_on_underscores() {
            assert_eq!(env_stem("mytool"), "MYTOOL");
            assert_eq!(env_stem("pr-updater"), "PR_UPDATER");
            assert_eq!(env_stem("a..b"), "A_B");
        }
    }

    mod machine_config_file_tests {
        use super::*;

        #[test]
        fn lives_under_the_standalone_config_home_and_a_non_blank_override_wins() {
            let tmp = tempfile::tempdir().unwrap();
            let expected = dirs(tmp.path())
                .standalone("tooly")
                .unwrap()
                .config()
                .path()
                .join("config.yaml");
            let m = file(tmp.path());

            assert_eq!(m.env(), "TOOLY_MACHINE_CONFIG");
            assert_eq!(m.path_with(None), expected);
            assert!(m.path_with(None).starts_with(tmp.path()));
            assert_eq!(
                m.path_with(Some("/x/config.yaml".into())),
                PathBuf::from("/x/config.yaml")
            );
            assert_eq!(m.path_with(Some("  ".into())), expected);
        }

        #[test]
        fn an_invalid_tool_name_is_an_error() {
            let tmp = tempfile::tempdir().unwrap();
            assert!(MachineConfigFile::<TestMachineConfig>::new("a/b", &dirs(tmp.path())).is_err());
        }

        #[test]
        fn env_name_and_file_name_are_configurable() {
            let tmp = tempfile::tempdir().unwrap();
            let m = file(tmp.path())
                .with_env("TOOLY_CFG")
                .with_file_name("machine.yaml");

            assert_eq!(m.env(), "TOOLY_CFG");
            let path = m.path_with(None);
            assert_eq!(path.file_name().unwrap(), "machine.yaml");
            assert_eq!(path.parent().unwrap().file_name().unwrap(), "tooly");
        }

        #[test]
        fn missing_file_returns_defaults() {
            let tmp = tempfile::tempdir().unwrap();
            let m = file(tmp.path());
            assert_eq!(
                m.load_at(tmp.path().join("absent.yaml")),
                TestMachineConfig::default()
            );
        }

        #[test]
        fn a_valid_file_is_read_and_re_read_when_the_path_changes() {
            let tmp = tempfile::tempdir().unwrap();
            let m = file(tmp.path());

            let a = tmp.path().join("a.yaml");
            fs::write(&a, "repos:\n  - ~/Developer\n  - /srv/repos\n").unwrap();
            assert_eq!(
                m.load_at(a).repos,
                vec!["~/Developer".to_string(), "/srv/repos".to_string()]
            );

            let b = tmp.path().join("b.yaml");
            fs::write(&b, "repos: []\n").unwrap();
            assert_eq!(m.load_at(b).repos, Vec::<String>::new());
        }

        #[test]
        fn the_value_is_memoised_per_path_until_clear_cache() {
            let tmp = tempfile::tempdir().unwrap();
            let m = file(tmp.path());

            let p = tmp.path().join("p.yaml");
            fs::write(&p, "repos: [/one]\n").unwrap();
            assert_eq!(m.load_at(p.clone()).repos, vec!["/one".to_string()]);

            fs::write(&p, "repos: [/two]\n").unwrap();
            assert_eq!(m.load_at(p.clone()).repos, vec!["/one".to_string()]);

            m.clear_cache();
            assert_eq!(m.load_at(p).repos, vec!["/two".to_string()]);
        }

        #[test]
        fn an_invalid_document_degrades_to_defaults_rather_than_throwing() {
            let tmp = tempfile::tempdir().unwrap();
            let m = file(tmp.path());
            let p = tmp.path().join("bad.yaml");

            for text in ["repos: 3\n", "nope: 1\n", "- a\n", ": : :\n", ""] {
                fs::write(&p, text).unwrap();
                m.clear_cache();
                assert_eq!(
                    m.load_at(p.clone()),
                    TestMachineConfig::default(),
                    "text: {text:?}"
                );
            }
        }

        #[test]
        fn read_strict_reports_what_load_hides() {
            let tmp = tempfile::tempdir().unwrap();
            let p = tmp.path().join("strict.yaml");

            assert_eq!(read_strict_at::<TestMachineConfig>(&p).unwrap(), None);

            fs::write(&p, "repos: [/one]\n").unwrap();
            let read = read_strict_at::<TestMachineConfig>(&p).unwrap().unwrap();
            assert_eq!(read.repos, vec!["/one".to_string()]);

            fs::write(&p, "nope: 1\n").unwrap();
            assert!(matches!(
                read_strict_at::<TestMachineConfig>(&p),
                Err(FileProblem::Malformed { .. })
            ));

            fs::write(&p, "- a\n").unwrap();
            assert!(matches!(
                read_strict_at::<TestMachineConfig>(&p),
                Err(FileProblem::Malformed { .. })
            ));
        }
    }
}

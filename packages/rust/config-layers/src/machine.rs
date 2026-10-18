//! The machine file: a per-machine settings file that is never committed.
//!
//! A tool keeps most settings in a project file that is committed with the
//! project. Some settings are only true on one computer, such as where the
//! repositories are checked out (`~/Developer`). Those go in the machine
//! file, which sits in the user's config directory and stays out of version
//! control. [`MachineConfigFile`] finds that file, reads it, and gives the
//! settings back as your own serde struct.
//!
//! The file is `<config home>/<tool>/config.yaml`, where the config home
//! comes from [`tiered_dirs`]. An environment variable can point the tool at
//! a different file. Reading never fails: a missing or broken file gives
//! the struct's [`Default`]. [`MachineConfigFile::read_strict`] reports the
//! problem instead, for a `doctor` or `config check` command.
//!
//! See [`MachineConfigFile`] for an example.

use std::cell::RefCell;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use serde::de::DeserializeOwned;
use tiered_dirs::TieredDirs;

use crate::file::{FileProblem, NotAMapping, yaml_options};

/// The name of the environment variable that moves a tool's machine file,
/// built from the tool's name: `tool` upper-cased, with every run of
/// characters outside `[A-Z0-9]` collapsed to a single `_`. `mytool` gives
/// `MYTOOL`, `pr-updater` gives `PR_UPDATER`.
///
/// This is only the stem. [`MachineConfigFile`] adds `_MACHINE_CONFIG` to it
/// for the default variable name.
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

/// Read the document into `T`. `Ok(None)` means the document is empty (no
/// content, only comments, or `null`).
fn parse_typed<T: DeserializeOwned>(text: &str) -> Result<Option<T>, serde_saphyr::Error> {
    serde_saphyr::from_str_with_options(text, yaml_options())
}

/// A tool's machine file: `<config>/<tool>/config.yaml` in the standalone
/// config home of a [`TieredDirs`], which an environment variable can move.
///
/// `T` is your struct for the file's contents. Give every field a default, so
/// a file that sets only some settings still loads. [`MachineConfigFile::load`]
/// falls back to `T::default()` when the file is missing, unreadable,
/// malformed, or does not match `T`, and never panics doing it.
///
/// # Example
///
/// Define the settings as a serde struct whose fields have defaults, build the
/// `MachineConfigFile` with [`new`](MachineConfigFile::new), then
/// [`load`](MachineConfigFile::load) it.
///
/// ```
/// use config_layers::machine::MachineConfigFile;
/// use config_layers::tiered_dirs::{BaseDirs, TieredDirs};
/// use serde::Deserialize;
///
/// // The settings that belong to this machine. Every field has a default.
/// #[derive(Debug, Default, PartialEq, Deserialize)]
/// #[serde(default)]
/// struct Machine {
///     /// Directories that hold checkouts, such as `~/Developer`.
///     repos: Vec<String>,
///     editor: Option<String>,
/// }
///
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// # let scratch = tempfile::tempdir()?;
/// // A real tool resolves the config home from the environment:
/// //   TieredDirs::from_env("com.example", &tiered_dirs::env_vars!("MYTOOL"),
/// //       tiered_dirs::ResolveOptions::new())?
/// // Here the home is a scratch directory.
/// let dirs = TieredDirs::with_base_dirs("com.example", BaseDirs::rooted(scratch.path()))?;
///
/// // `new` finds where the file goes. It does not read it.
/// let machine = MachineConfigFile::<Machine>::new("mytool", &dirs)?;
///
/// // No file yet: `load` gives the defaults.
/// assert_eq!(machine.load(), Machine::default());
///
/// // Write the file. A person would create it by hand.
/// let path = machine.path();
/// std::fs::create_dir_all(path.parent().expect("a file has a parent"))?;
/// std::fs::write(&path, "repos:\n  - ~/Developer\n")?;
///
/// // `load` remembers its result per path; `clear_cache` makes it read again.
/// machine.clear_cache();
/// assert_eq!(machine.load().repos, vec!["~/Developer".to_string()]);
/// assert_eq!(machine.load().editor, None);
/// # Ok(())
/// # }
/// ```
///
/// The cache uses a [`RefCell`], so a `MachineConfigFile` is not `Sync`.
/// Build one per thread, or wrap it in a lock.
///
/// **Stability:** stable in 0.x.
pub struct MachineConfigFile<T> {
    dir: PathBuf,
    env: String,
    file_name: String,
    /// The last file read: its path and its text, or `None` when there was
    /// nothing readable. Holds text, not a `T`, so `T` needs no `Clone`.
    cache: RefCell<Option<(PathBuf, Option<String>)>>,
    _marker: std::marker::PhantomData<T>,
}

impl<T: DeserializeOwned + Default> MachineConfigFile<T> {
    /// Find where `tool`'s machine file goes, in the standalone config home
    /// that `dirs` resolves. Nothing is read yet.
    ///
    /// The vendor and the override variables are whatever `dirs` was built
    /// with. The environment variable that moves the file defaults to
    /// `<STEM>_MACHINE_CONFIG` (see [`env_stem`]), and the file name to
    /// `config.yaml`.
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

    /// Use a different environment variable to move the file.
    pub fn with_env(mut self, env: &str) -> Self {
        self.env = env.to_string();
        self
    }

    /// Use a different file name inside the tool's config directory.
    pub fn with_file_name(mut self, name: &str) -> Self {
        self.file_name = name.to_string();
        self
    }

    /// The environment variable that moves the file.
    pub fn env(&self) -> &str {
        &self.env
    }

    /// Where the machine file is: `<config-home>/<tool>/<file_name>`, unless
    /// the environment variable names a non-blank path, in which case that
    /// path is used as given. A value that is not valid UTF-8 is used as
    /// given; only the blank check reads it lossily.
    pub fn path(&self) -> PathBuf {
        self.path_with(std::env::var_os(&self.env))
    }

    fn path_with(&self, over: Option<OsString>) -> PathBuf {
        match over {
            Some(over) if !over.to_string_lossy().trim().is_empty() => PathBuf::from(over),
            _ => self.dir.join(&self.file_name),
        }
    }

    /// Read the machine file into `T`. Any setting the file leaves out takes
    /// its serde default.
    ///
    /// This never fails and never panics. A missing file, an unreadable file,
    /// bad YAML, a document that is not a mapping, and a document that does
    /// not match `T` all give `T::default()`. Use
    /// [`read_strict`](MachineConfigFile::read_strict) to see which.
    ///
    /// The result is remembered per resolved path, so a second call does not
    /// read the file again. See [`clear_cache`](MachineConfigFile::clear_cache).
    pub fn load(&self) -> T {
        self.load_at(self.path())
    }

    fn load_at(&self, path: PathBuf) -> T {
        if let Some((cached_path, cached)) = self.cache.borrow().as_ref()
            && *cached_path == path
        {
            return materialize::<T>(cached.as_deref());
        }
        let text = if path.is_file() {
            std::fs::read_to_string(&path).ok()
        } else {
            None
        };
        let value = materialize::<T>(text.as_deref());
        *self.cache.borrow_mut() = Some((path, text));
        value
    }

    /// Read the machine file like [`load`](MachineConfigFile::load), but
    /// report what is wrong instead of falling back to the defaults. For a
    /// `doctor` or `config check` command. Not remembered.
    ///
    /// `Ok(None)` means there is no file. An empty file is a problem, not
    /// `Ok(None)`: `load` reads it as an empty mapping, and this reports it
    /// so a tool can tell the two apart.
    ///
    /// # Errors
    ///
    /// [`FileProblem::Unreadable`] when the file exists but cannot be read.
    /// [`FileProblem::Malformed`] when it is empty, is not a YAML mapping, or
    /// does not match `T`.
    pub fn read_strict(&self) -> Result<Option<T>, FileProblem> {
        read_strict_at(&self.path())
    }

    /// Forget what [`load`](MachineConfigFile::load) remembered, so the next
    /// call reads the file again. Call it between test runs, or after the
    /// file is rewritten while the program is running.
    pub fn clear_cache(&self) {
        *self.cache.borrow_mut() = None;
    }
}

/// `T` from the file's text, or `T::default()` for no text or any problem.
fn materialize<T: DeserializeOwned + Default>(text: Option<&str>) -> T {
    let Some(text) = text else {
        return T::default();
    };
    match parse_typed::<T>(text) {
        Ok(Some(value)) => value,
        // An empty document is an empty mapping: field defaults apply.
        Ok(None) => parse_typed::<T>("{}").ok().flatten().unwrap_or_default(),
        Err(_) => T::default(),
    }
}

fn read_strict_at<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, FileProblem> {
    if !path.is_file() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(path).map_err(|err| FileProblem::unreadable(path, err))?;
    match parse_typed::<T>(&text) {
        Ok(Some(value)) => Ok(Some(value)),
        Ok(None) => Err(FileProblem::malformed(
            path,
            NotAMapping("expected a mapping at the top level, found an empty document".to_string()),
        )),
        Err(err) => Err(FileProblem::malformed(path, err)),
    }
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
        fn an_empty_or_comment_only_file_gives_the_field_defaults() {
            // A field default that differs from `Default::default()`.
            #[derive(Debug, PartialEq, Deserialize)]
            struct Custom {
                #[serde(default = "eight")]
                port: u16,
            }
            fn eight() -> u16 {
                8
            }
            impl Default for Custom {
                fn default() -> Self {
                    Self { port: 1 }
                }
            }

            let tmp = tempfile::tempdir().unwrap();
            let m = MachineConfigFile::<Custom>::new("tooly", &dirs(tmp.path())).unwrap();
            let p = tmp.path().join("empty.yaml");
            for text in ["", "# nothing here\n", "~\n"] {
                fs::write(&p, text).unwrap();
                m.clear_cache();
                assert_eq!(m.load_at(p.clone()), Custom { port: 8 }, "text: {text:?}");
            }
        }

        #[test]
        fn only_true_and_false_are_booleans() {
            #[derive(Debug, Default, PartialEq, Deserialize)]
            #[serde(default)]
            struct Flags {
                on: bool,
                name: String,
            }
            let tmp = tempfile::tempdir().unwrap();
            let p = tmp.path().join("flags.yaml");

            fs::write(&p, "on: true\nname: yes\n").unwrap();
            let read = read_strict_at::<Flags>(&p).unwrap().unwrap();
            assert_eq!(
                read,
                Flags {
                    on: true,
                    name: "yes".to_string()
                }
            );

            // `yes` is not a boolean, so it cannot fill a `bool`.
            fs::write(&p, "on: yes\n").unwrap();
            assert!(matches!(
                read_strict_at::<Flags>(&p),
                Err(FileProblem::Malformed { .. })
            ));
        }

        #[test]
        fn read_strict_reports_an_empty_file_and_carries_its_source() {
            let tmp = tempfile::tempdir().unwrap();
            let p = tmp.path().join("empty.yaml");
            fs::write(&p, "").unwrap();
            let err = read_strict_at::<TestMachineConfig>(&p).unwrap_err();
            let source = std::error::Error::source(&err)
                .expect("a source")
                .to_string();
            assert!(source.contains("found an empty document"), "{source}");

            fs::write(&p, "nope: 1\n").unwrap();
            let err = read_strict_at::<TestMachineConfig>(&p).unwrap_err();
            let source = std::error::Error::source(&err).unwrap();
            assert!(source.downcast_ref::<serde_saphyr::Error>().is_some());
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

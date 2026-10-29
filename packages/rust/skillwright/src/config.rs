//! Configuration.
//!
//! **The project file** is `skillwright.yaml`, committed, found by walking
//! up from the working directory — or named outright with `--config`. It
//! holds what belongs to a vault and its distribution: the vault path, the
//! frontmatter namespace, the destinations, the marketplace block.
//!
//! **The machine file** is `<config-home>/skillwright/config.yaml` in the
//! standalone tier of [`crate::dirs`], never committed, relocated by
//! `SKILLWRIGHT_MACHINE_CONFIG`. It has the same shape and stands in, key by
//! key, where the project file is silent.
//!
//! Both may carry a `paths:` map, and every path-valued setting may refer to
//! an entry as `{name}`. Relative paths in the project file resolve against
//! the file's own directory; a flag's path resolves against the shell's
//! `cwd`.
//!
//! A flag overrides the project file, which overrides the machine file, and
//! nothing here is ever written back — this module only reads.
//!
//! This module reads shapes and nothing else. Whether `vault` names a
//! directory that exists, and whether `namespace` is a stem the core
//! accepts, are answered elsewhere — the filesystem, and
//! [`tradecraft_core::Namespace`] in `resolve.rs`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use config_layers::file::{self, FileProblem};
use config_layers::machine::MachineConfigFile;
use config_layers::needs::{KeySpec, Needs, Scope};
use config_layers::paths::{self, PathNames};
use serde::{Deserialize, Serialize};

/// The tool's standalone name for its config directory segment and env stem.
pub const TOOL: &str = "skillwright";
/// The command name the configuration messages print.
const COMMAND: &str = "skillwright";
/// The committed project file, looked for from the working directory upward.
pub const PROJECT_FILE: &str = tradecraft_core::PROJECT_FILE;
/// The project file's earlier names. Only their presence is checked, by
/// [`old_project_file`], to say how to rename one.
const OLD_PROJECT_FILES: [&str; 2] = ["tradecraft.yaml", "agent-pants.yaml"];
/// Env var that relocates the machine file, for tests and one-off runs.
pub const MACHINE_CONFIG_ENV: &str = "SKILLWRIGHT_MACHINE_CONFIG";

/// Where `publish` writes when `--to` is not given.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct DestinationConfig {
    /// The destination root directory.
    pub root: String,
    /// The target rendered into the root.
    pub target: String,
    /// `project` or `user`; informational.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

/// Where the vault keeps its skills, references and snippets, relative to
/// the vault.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct DeclaredFolders {
    /// The skills folder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<String>,
    /// The references folder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub references: Option<String>,
    /// The snippets folder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snippets: Option<String>,
}

/// What `build` and `check` render; the core owns its shape so any host
/// reads the same block. See [`tradecraft_core::settings`].
pub use tradecraft_core::MarketplaceSettings;

/// The shape of both files: the committed `skillwright.yaml` and the
/// machine file.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct TradecraftConfig {
    /// Named directories; any other path setting refers to one as `{name}`.
    #[serde(default)]
    pub paths: BTreeMap<String, String>,
    /// The vault root. Relative to this file; `--vault` overrides it for
    /// one run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vault: Option<String>,
    /// The frontmatter namespace as a stem — the `sw` of `sw-kind`. Absent
    /// means `sw`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
    /// Where the vault keeps skills, references and snippets.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub declared_folders: Option<DeclaredFolders>,
    /// Directories a bare `adopt` reads from.
    #[serde(default)]
    pub scan_locations: Vec<String>,
    /// Where `publish` writes when `--to` is not given.
    #[serde(default)]
    pub destinations: Vec<DestinationConfig>,
    /// The marketplace block used by `build` and `check`.
    #[serde(default)]
    pub marketplace: MarketplaceSettings,
    /// Files copied verbatim into a built plugin's own root — a CLI, a wasm
    /// artifact, a launcher: authored on disk, never as a vault note.
    #[serde(default)]
    pub assets: Vec<AssetEntry>,
    /// Canonical hooks files; see `tradecraft_core::HookFileSpec`.
    #[serde(default)]
    pub hooks: Vec<HookFileEntry>,
}

/// One `hooks:` entry, as written in the project file.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct HookFileEntry {
    /// A Claude Code `hooks.json`, relative to this file's own directory —
    /// the rule [`AssetEntry::from`] follows.
    pub from: String,
    /// Which plugin's packs carry it. Absent means
    /// `marketplace.default_plugin`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin: Option<String>,
}

/// One `assets:` entry, as written in the project file.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct AssetEntry {
    /// The source file, or a directory whose whole tree lands under `to`.
    /// Relative to this file's own directory, the same rule
    /// [`resolve_configured_path`] applies to `marketplace.out`; `~` and an
    /// absolute path are honoured as written.
    pub from: String,
    /// Where it lands, relative to the built plugin's own root
    /// (`<packs>/<plugin>/`), forward-slashed.
    pub to: String,
    /// Which plugin's root this asset lands in. Absent means
    /// `marketplace.default_plugin`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plugin: Option<String>,
}

fn is_blank(config: &TradecraftConfig) -> bool {
    config.vault.is_none()
        && config.namespace.is_none()
        && config.declared_folders.is_none()
        && config.scan_locations.is_empty()
        && config.destinations.is_empty()
        && config.marketplace.is_blank()
        && config.assets.is_empty()
        && config.hooks.is_empty()
}

/// The result of reading the configuration for one run.
pub enum ConfigLoad {
    /// A configuration was read.
    Loaded {
        /// The parsed configuration.
        config: Box<TradecraftConfig>,
        /// The configuration file.
        path: PathBuf,
        /// The directory relative paths in it resolve against.
        dir: PathBuf,
    },
    /// No project file above `cwd` and the machine file names no vault.
    /// Mode 1 (flag-only) is still possible.
    Absent {
        /// The configuration file.
        path: PathBuf,
    },
    /// `--config` named a file that isn't there — its own exit code (4),
    /// not 2.
    MissingExplicit {
        /// The configuration file.
        path: PathBuf,
    },
    /// The file exists but could not be read.
    Unreadable {
        /// The configuration file.
        path: PathBuf,
        /// What went wrong.
        detail: String,
    },
    /// The file was read but is not valid configuration.
    Malformed {
        /// The configuration file.
        path: PathBuf,
        /// What went wrong.
        detail: String,
    },
}

/// # Panics
///
/// When the base directories cannot be resolved (no home directory and no
/// override), or `TOOL` is not a valid path segment.
fn machine_file() -> MachineConfigFile<TradecraftConfig> {
    let dirs = crate::dirs::system()
        .unwrap_or_else(|err| panic!("skillwright: cannot resolve the machine directories: {err}"));
    MachineConfigFile::new(TOOL, &dirs)
        .unwrap_or_else(|err| panic!("skillwright: invalid tool name {TOOL:?}: {err}"))
        .with_env(MACHINE_CONFIG_ENV)
}

/// A path that stands in for the machine file ahead of
/// [`MACHINE_CONFIG_ENV`]. Tests set it, because moving an environment
/// variable needs `unsafe`.
static MACHINE_CONFIG_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Set or clear the machine-file override for this process and return the
/// previous one. For tests only, behind the `test-support` feature: a test
/// that sets it must hold its own lock for as long as the override is in
/// place. Not part of the API.
#[cfg(any(test, feature = "test-support"))]
#[doc(hidden)]
pub fn replace_machine_config_override(path: Option<PathBuf>) -> Option<PathBuf> {
    let mut slot = MACHINE_CONFIG_OVERRIDE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    std::mem::replace(&mut *slot, path)
}

/// `<config-home>/skillwright/config.yaml`, unless [`MACHINE_CONFIG_ENV`]
/// says otherwise. A test override, set with the `test-support` feature,
/// comes before both.
pub fn machine_config_path() -> PathBuf {
    let over = MACHINE_CONFIG_OVERRIDE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    over.unwrap_or_else(|| machine_file().path())
}

/// Resolve a flag's path as the shell would: absolute or `~`-prefixed as
/// given, relative against `cwd`. The rule `--vault`, `--to`, `--out` and
/// `--config` share; a value from a config file uses
/// [`resolve_configured_path`].
pub fn resolve_against_cwd(path: &str, cwd: &Path) -> PathBuf {
    if let Some(rest) = path.strip_prefix('~') {
        let rest = rest
            .strip_prefix('/')
            .or_else(|| rest.strip_prefix('\\'))
            .unwrap_or(rest);
        return if rest.is_empty() {
            home_dir()
        } else {
            home_dir().join(rest)
        };
    }
    let p = Path::new(path);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        normalize_join(cwd, p)
    }
}

/// Resolve a config-file path as the file's own rules require: `~` expands,
/// absolute is used as given, relative resolves against `base_dir` — the
/// file's directory, never the process's working directory.
pub fn resolve_configured_path(path: &str, base_dir: &Path) -> PathBuf {
    if path.starts_with('~') || Path::new(path).is_absolute() {
        resolve_against_cwd(path, base_dir)
    } else {
        normalize_join(base_dir, Path::new(path))
    }
}

/// The user's home directory, read directly from `$HOME`. Falls back to `/`
/// rather than panicking when unset.
fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Join `rel` onto `base` and lexically collapse `.`/`..`, without touching
/// the filesystem — the Rust equivalent of Node's `path.resolve`.
pub fn normalize_join(base: &Path, rel: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for component in base.join(rel).components() {
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

/// `to` expressed relative to `from`, lexically — the Rust equivalent of
/// Node's `path.relative`. Both sides are collapsed first, and a target
/// outside `from` comes back with the `..` segments that reach it. An empty
/// result means the two are the same path.
pub fn relative_path(from: &Path, to: &Path) -> PathBuf {
    let from = normalize_join(from, Path::new(""));
    let to = normalize_join(to, Path::new(""));
    let mut from = from.components().peekable();
    let mut to = to.components().peekable();
    while from.peek().is_some() && from.peek() == to.peek() {
        from.next();
        to.next();
    }
    let mut out = PathBuf::new();
    for _ in from {
        out.push("..");
    }
    for component in to {
        out.push(component.as_os_str());
    }
    out
}

/// The [`ConfigLoad`] for a file that could not be read. `FileProblem` is
/// `#[non_exhaustive]`; a variant added later reports as malformed at `path`.
fn problem_load(problem: FileProblem, path: &Path) -> ConfigLoad {
    match problem {
        FileProblem::Unreadable { path, source } => ConfigLoad::Unreadable {
            path,
            detail: source.to_string(),
        },
        FileProblem::Malformed { path, source } => ConfigLoad::Malformed {
            path,
            detail: source.to_string(),
        },
        other => ConfigLoad::Malformed {
            path: path.to_path_buf(),
            detail: other.to_string(),
        },
    }
}

/// Resolve every string element of the sequence at `key` against `base`,
/// with `~` expanding to `home`. A no-op if `key` is absent or not a
/// sequence.
fn resolve_sequence_paths_at(
    map: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    base: &Path,
    home: &Path,
) {
    let Some(serde_json::Value::Array(seq)) = map.get_mut(key) else {
        return;
    };
    for item in seq.iter_mut() {
        if let serde_json::Value::String(s) = item {
            *s = paths::resolve_config_path(s, base, home);
        }
    }
}

/// Resolve every `destinations[].root` against `base`, with `~` expanding
/// to `home`. A no-op if `destinations` is absent or not a sequence.
fn resolve_destination_roots_at(
    map: &mut serde_json::Map<String, serde_json::Value>,
    base: &Path,
    home: &Path,
) {
    let Some(serde_json::Value::Array(seq)) = map.get_mut("destinations") else {
        return;
    };
    for item in seq.iter_mut() {
        if let serde_json::Value::Object(m) = item
            && let Some(serde_json::Value::String(s)) = m.get_mut("root")
        {
            *s = paths::resolve_config_path(s, base, home);
        }
    }
}

/// Top-level keys whose value is a struct, and whether the field is an
/// `Option` (so a bare `key:` reads as unset). `serde_json` reads a sequence
/// into a struct, so `marketplace: []` would load; the YAML reader this crate
/// used before rejected it, so the mapping check is done here.
const STRUCT_KEYS: &[(&str, bool)] = &[("declared_folders", true), ("marketplace", false)];

/// The key in [`STRUCT_KEYS`] whose value is not a mapping, if any.
fn non_mapping_struct_key(
    map: &serde_json::Map<String, serde_json::Value>,
) -> Option<&'static str> {
    STRUCT_KEYS.iter().find_map(|&(key, optional)| {
        let v = map.get(key)?;
        let ok = v.is_object() || (optional && v.is_null());
        (!ok).then_some(key)
    })
}

/// Deserialize a merged mapping into the config, failing with the detail text
/// [`annotate_detail`] builds.
fn config_from_mapping(
    map: &serde_json::Map<String, serde_json::Value>,
) -> Result<TradecraftConfig, String> {
    let parsed = serde_json::from_value::<TradecraftConfig>(serde_json::Value::Object(map.clone()));
    match parsed {
        Ok(_) if non_mapping_struct_key(map).is_some() => Err(annotate_detail(map, String::new())),
        Ok(c) => Ok(c),
        Err(err) => Err(annotate_detail(map, err.to_string())),
    }
}

fn typed_paths(map: &serde_json::Map<String, serde_json::Value>) -> BTreeMap<String, String> {
    map.get("paths")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

/// serde_json's struct-deserialize error carries no field path . When the
/// whole mapping fails to parse, re-check each top-level key alone against
/// its own field type and name every mismatch, joined with `; ` — so a caller sees
/// `` `vault`: invalid type: ... `` rather than a bare type-mismatch message.
/// An unknown-field error already names the field on its own and is
/// returned unchanged.
fn annotate_detail(
    map: &serde_json::Map<String, serde_json::Value>,
    base_detail: String,
) -> String {
    let mut issues: Vec<String> = Vec::new();
    macro_rules! check {
        ($key:literal, $ty:ty) => {
            if let Some(v) = map.get($key)
                && let Err(err) = serde_json::from_value::<$ty>(v.clone())
            {
                issues.push(format!("`{}`: {err}", $key));
            }
        };
    }
    if let Some(key) = non_mapping_struct_key(map) {
        issues.push(format!("`{key}`: invalid type: expected a mapping"));
    }
    check!("paths", BTreeMap<String, String>);
    check!("vault", String);
    check!("namespace", String);
    check!("declared_folders", DeclaredFolders);
    check!("scan_locations", Vec<String>);
    check!("destinations", Vec<DestinationConfig>);
    check!("marketplace", MarketplaceSettings);
    check!("assets", Vec<AssetEntry>);
    check!("hooks", Vec<HookFileEntry>);
    if issues.is_empty() {
        base_detail
    } else {
        issues.join("; ")
    }
}

/// Expand every `{name}` token in the path-valued settings, so a reader
/// after this point sees plain paths. A token nothing defines is reported
/// as `Malformed`, naming the setting.
fn finish(
    mut config: TradecraftConfig,
    dir: &Path,
    path: &Path,
    machine_paths: &BTreeMap<String, String>,
    home: &Path,
) -> ConfigLoad {
    let project_paths = config.paths.clone();
    let names: PathNames = paths::path_names(dir, home, machine_paths, &project_paths);

    macro_rules! expand {
        ($value:expr, $wher:expr) => {
            match paths::substitute_path_names($value, &names, $wher) {
                Ok(v) => v,
                Err(err) => {
                    return ConfigLoad::Malformed {
                        path: path.to_path_buf(),
                        detail: err.to_string(),
                    };
                }
            }
        };
    }

    if let Some(vault) = &config.vault {
        config.vault = Some(expand!(vault, "vault:"));
    }
    // `for` loops, not `.map()`: `expand!`'s early `return` must exit
    // `finish`, not a closure passed to `.map()`.
    let mut scan_locations = Vec::with_capacity(config.scan_locations.len());
    for s in &config.scan_locations {
        scan_locations.push(expand!(s, "scan_locations:"));
    }
    config.scan_locations = scan_locations;

    let mut destinations = Vec::with_capacity(config.destinations.len());
    for d in config.destinations {
        let root = expand!(&d.root, "destinations[].root:");
        destinations.push(DestinationConfig { root, ..d });
    }
    config.destinations = destinations;
    if let Some(out) = &config.marketplace.out {
        config.marketplace.out = Some(expand!(out, "marketplace.out:"));
    }
    if let Some(skills_root) = &config.marketplace.skills_root {
        config.marketplace.skills_root = Some(expand!(skills_root, "marketplace.skills_root:"));
    }
    let mut assets = Vec::with_capacity(config.assets.len());
    for a in config.assets {
        let from = expand!(&a.from, "assets[].from:");
        assets.push(AssetEntry { from, ..a });
    }
    config.assets = assets;
    let mut hooks = Vec::with_capacity(config.hooks.len());
    for h in config.hooks {
        let from = expand!(&h.from, "hooks[].from:");
        hooks.push(HookFileEntry { from, ..h });
    }
    config.hooks = hooks;

    ConfigLoad::Loaded {
        config: Box::new(config),
        path: path.to_path_buf(),
        dir: dir.to_path_buf(),
    }
}

/// The old project file a run would otherwise miss: the nearest
/// `tradecraft.yaml` or `agent-pants.yaml` above `cwd`, but only when the
/// same upward search finds no `skillwright.yaml`.
///
/// The caller asks only for a run that searches at all, that is one with
/// neither `--config` nor `--vault`.
pub fn old_project_file(cwd: &Path) -> Option<PathBuf> {
    if file::find_up(cwd, PROJECT_FILE).is_some() {
        return None;
    }
    OLD_PROJECT_FILES
        .into_iter()
        .filter_map(|name| file::find_up(cwd, name))
        .max_by_key(|path| path.components().count())
}

/// What to do about an old project file, for the error line.
pub fn old_project_file_hint(old: &Path) -> String {
    let stem = tradecraft_core::Namespace::DEFAULT_STEM;
    if old
        .file_name()
        .is_some_and(|name| name == "agent-pants.yaml")
    {
        format!(
            "rename it to `{PROJECT_FILE}`, set `namespace: {stem}` or drop the line, and change \
             the vault notes' `ap-` keys to `{stem}-`"
        )
    } else {
        format!(
            "rename it to `{PROJECT_FILE}`, and change the vault notes' `tc-` keys to `{stem}-` \
             or set `namespace: tc`"
        )
    }
}

/// Read the configuration for this run: the project file `--config` names
/// or the nearest one above `cwd`, over the machine file.
///
/// With no project file, the machine file alone can carry a run: its
/// `vault` and `destinations` load as the configuration, with the machine
/// file as the path relative entries resolve against. With neither, the
/// result is `Absent` and the caller decides whether flags alone suffice.
///
/// A project file that cannot be read or parsed is reported by path and
/// reason rather than degraded to defaults. The machine file is checked the
/// same way when it exists, for the same reason.
pub fn load_config(config_flag: Option<&str>, cwd: &Path) -> ConfigLoad {
    load_config_at(config_flag, cwd, machine_config_path(), &home_dir())
}

/// [`load_config`] with the machine file's path and the home directory
/// given, so a test needs no environment variables.
fn load_config_at(
    config_flag: Option<&str>,
    cwd: &Path,
    machine_path: PathBuf,
    home: &Path,
) -> ConfigLoad {
    // `exists()` is true for a directory too, so a path naming a directory
    // reaches the unreadable branch below rather than reading as absent.
    let machine_exists = machine_path.exists();
    let machine_mapping = if machine_exists {
        match file::read_mapping(&machine_path) {
            Ok(m) => m,
            Err(problem) => return problem_load(problem, &machine_path),
        }
    } else {
        serde_json::Map::new()
    };
    // Checked once, against the same schema the layered read uses below: a
    // typo in the machine file must not read as "no configuration, run
    // init".
    if machine_exists && let Err(detail) = config_from_mapping(&machine_mapping) {
        return ConfigLoad::Malformed {
            path: machine_path,
            detail,
        };
    }

    let explicit = config_flag.is_some();
    let found = match config_flag {
        Some(flag) => Some(resolve_against_cwd(flag, cwd)),
        None => file::find_up(cwd, PROJECT_FILE),
    };

    let Some(project_path) = found else {
        let machine_config: TradecraftConfig = if machine_exists {
            serde_json::from_value(serde_json::Value::Object(machine_mapping.clone()))
                .unwrap_or_default()
        } else {
            TradecraftConfig::default()
        };
        if !machine_exists || is_blank(&machine_config) {
            return ConfigLoad::Absent { path: machine_path };
        }
        let machine_dir = machine_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_default();
        let machine_paths = machine_config.paths.clone();
        return finish(
            machine_config,
            &machine_dir,
            &machine_path,
            &machine_paths,
            home,
        );
    };

    if explicit && !project_path.exists() {
        return ConfigLoad::MissingExplicit { path: project_path };
    }

    let project_mapping = match file::read_mapping(&project_path) {
        Ok(m) => m,
        Err(problem) => return problem_load(problem, &project_path),
    };

    let machine_dir = machine_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let mut machine_mapping = machine_mapping;
    // A value taken from the project file resolves later, against the
    // project's own directory (see `resolve.rs`). A value borrowed from the
    // machine file must be resolved here, against the machine file's
    // directory, or the caller would resolve it against the wrong base.
    file::resolve_paths_at(
        &mut machine_mapping,
        &["vault", "marketplace.out", "marketplace.skills_root"],
        &machine_dir,
        home,
    );
    resolve_sequence_paths_at(&mut machine_mapping, "scan_locations", &machine_dir, home);
    resolve_destination_roots_at(&mut machine_mapping, &machine_dir, home);

    // `paths:` merges by NAME (machine wins per name, via `path_tokens`
    // below) rather than as a whole top-level key, so it is carried through
    // the overlay untouched and the deserialized result is overwritten with
    // the project's own value afterwards.
    let project_paths_raw = project_mapping.get("paths");
    let project_paths: BTreeMap<String, String> = project_paths_raw
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    let machine_paths = typed_paths(&machine_mapping);

    let merged = file::overlay_top_level(project_mapping, &machine_mapping);
    let mut config: TradecraftConfig = match config_from_mapping(&merged) {
        Ok(c) => c,
        Err(detail) => {
            return ConfigLoad::Malformed {
                path: project_path,
                detail,
            };
        }
    };
    config.paths = project_paths;

    let project_dir = project_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    finish(config, &project_dir, &project_path, &machine_paths, home)
}

/// The needs check every verb asks before it starts. Each key's description is
/// the text shown when the key is missing.
pub static NEEDS: LazyLock<Needs> = LazyLock::new(|| {
    static KEYS: &[KeySpec] = &[
        KeySpec {
            key: "vault",
            scope: Scope::Both,
            description: "The vault root. Relative to this file; `--vault` overrides it for one run.",
        },
        KeySpec {
            key: "namespace",
            scope: Scope::Both,
            description: "The frontmatter namespace as a stem — the `sw` of `sw-kind`. Absent means `sw`.",
        },
        KeySpec {
            key: "declared_folders",
            scope: Scope::Both,
            description: "Where the vault keeps its skills, references and snippets, relative to the vault.",
        },
        KeySpec {
            key: "scan_locations",
            scope: Scope::Both,
            description: "Directories a bare `adopt` reads from.",
        },
        KeySpec {
            key: "destinations",
            scope: Scope::Both,
            description: "Where `publish` writes when `--to` is not given.",
        },
        KeySpec {
            key: "marketplace",
            scope: Scope::Both,
            description: "What `build` and `check` render.",
        },
        KeySpec {
            key: "paths",
            scope: Scope::Both,
            description: "Named directories; any other path setting refers to one as `{name}`.",
        },
        KeySpec {
            key: "assets",
            scope: Scope::Both,
            description: "Files copied verbatim into a built plugin's own root — a CLI, a wasm artifact, a launcher.",
        },
        KeySpec {
            key: "hooks",
            scope: Scope::Both,
            description: "Canonical hooks files, one per plugin, rendered into each harness's pack with a gap report.",
        },
        KeySpec {
            key: "marketplace.name",
            scope: Scope::Both,
            description: "The marketplace's name when the vault holds no marketplace note; a fallback.",
        },
        KeySpec {
            key: "marketplace.display_name",
            scope: Scope::Both,
            description: "Codex's `interface.displayName`.",
        },
        KeySpec {
            key: "marketplace.owner",
            scope: Scope::Both,
            description: "Claude's marketplace `owner`; free-shaped.",
        },
        KeySpec {
            key: "marketplace.author",
            scope: Scope::Both,
            description: "Default plugin author; falls back to `owner`.",
        },
        KeySpec {
            key: "marketplace.default_plugin",
            scope: Scope::Both,
            description: "The plugin a note with no `sw-plugin` belongs to. `build` and `check` need it.",
        },
        KeySpec {
            key: "marketplace.plugins",
            scope: Scope::Both,
            description: "Per-plugin manifest overrides, keyed by plugin name.",
        },
        KeySpec {
            key: "marketplace.out",
            scope: Scope::Both,
            description: "The marketplace directory — one directory holding one marketplace, which every harness reads from. `.` makes the repository itself the marketplace. `build` and `check` need it; `--out` overrides.",
        },
        KeySpec {
            key: "marketplace.skills_root",
            scope: Scope::Both,
            description: "The content root to scan and adopt under. Absent means the vault root.",
        },
        KeySpec {
            key: "marketplace.harnesses",
            scope: Scope::Both,
            description: "Which harnesses the marketplace is built for. Absent means all of them.",
        },
    ];
    Needs::new(
        COMMAND,
        PROJECT_FILE,
        KEYS,
        machine_config_path(),
        Some("the package README shows the full shape"),
    )
});

#[cfg(test)]
mod tests {
    use super::*;

    /// A `~` value borrowed from the machine file expands to the home
    /// directory, not to the machine file's directory.
    #[test]
    fn a_tilde_in_the_machine_file_expands_to_home_under_a_project_file() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home");
        let machine_path = tmp.path().join("machine").join("config.yaml");
        std::fs::create_dir_all(machine_path.parent().unwrap()).unwrap();
        std::fs::write(
            &machine_path,
            "vault: ~/notes\nscan_locations: [~/skills]\ndestinations:\n  - root: ~/out\n    target: claude\n",
        )
        .unwrap();
        let project = tmp.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(project.join(PROJECT_FILE), "namespace: sw\n").unwrap();

        let ConfigLoad::Loaded { config, .. } = load_config_at(None, &project, machine_path, &home)
        else {
            panic!("expected the layered config to load");
        };
        let as_path = |s: &str| PathBuf::from(s);
        assert_eq!(
            config.vault.as_deref().map(as_path),
            Some(home.join("notes"))
        );
        assert_eq!(
            config
                .scan_locations
                .iter()
                .map(|s| as_path(s))
                .collect::<Vec<_>>(),
            vec![home.join("skills")]
        );
        assert_eq!(as_path(&config.destinations[0].root), home.join("out"));
    }
}

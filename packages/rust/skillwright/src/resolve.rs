//! The three questions every verb asks before it does anything: which
//! configuration file, which frontmatter namespace, which vault.
//!
//! Said once here rather than at the top of each command, so a second copy
//! in a command module cannot drift on `--config` precedence.
//!
//! Nothing here decides anything the core decides. The namespace rule is
//! asked of [`tradecraft_core::Namespace`]; this module only knows *when*
//! to ask, and what to say about where the offending value came from —
//! which is the one thing the core cannot know.

use std::io::Write;
use std::path::{Path, PathBuf};

use tradecraft_core::Namespace;

use crate::config::{
    ConfigLoad, NEEDS, PROJECT_FILE, SkillwrightConfig, load_config, machine_config_path,
    old_project_file, old_project_file_hint, resolve_against_cwd, resolve_configured_path,
};
use crate::exit::{blocked, no_config};

/// The globals every verb declares, as far as this module cares.
#[derive(Debug, Clone, Default)]
pub struct CommonFlags {
    /// `--vault`.
    pub vault: Option<String>,
    /// `--config`.
    pub config: Option<String>,
    /// `--namespace`.
    pub namespace: Option<String>,
}

/// What a run resolved to, once the three questions are answered.
#[derive(Debug)]
pub struct ResolvedRun {
    /// `None` in mode 1 (flag-only): no file was there, and none had to be.
    pub config: Option<SkillwrightConfig>,
    /// The directory relative paths inside the config file resolve against.
    pub config_dir: PathBuf,
    /// The file that was read, or `None` when none was.
    pub config_path: Option<PathBuf>,
    /// The frontmatter namespace for this run, validated at [`resolve_run`].
    /// Absent means the core's `sw`.
    pub namespace: Option<Namespace>,
    /// The vault root, resolved and known to exist.
    pub vault: PathBuf,
}

impl ResolvedRun {
    /// This run's namespace as the core takes it.
    pub fn core_namespace(&self) -> Namespace {
        self.namespace.clone().unwrap_or_default()
    }
}

/// Load the configuration, validate the namespace, and resolve the vault —
/// writing any failure to `err` and handing back the exit code it earned.
///
/// The namespace is checked HERE, once, at load: a stem the core refuses is
/// a fault in the configuration, not in any note. It is a run-level
/// blocker: exit 2, nothing attempted. Not exit 4 — that means "no
/// configuration, run `skillwright init`", and sending someone to the
/// wizard because one value in the file they already have is wrong would
/// have them rewrite the file that holds their destinations.
pub fn resolve_run(
    flags: &CommonFlags,
    cwd: &Path,
    err: &mut dyn Write,
) -> Result<ResolvedRun, i32> {
    // Only a run that searches for `skillwright.yaml` can miss an old project
    // file; `--config` and `--vault` name what they mean.
    if flags.config.is_none()
        && flags.vault.is_none()
        && let Some(old) = old_project_file(cwd)
    {
        return Err(blocked(
            err,
            &format!(
                "old project file: {} ({})",
                old.display(),
                old_project_file_hint(&old)
            ),
        ));
    }
    let loaded = load_config(flags.config.as_deref(), cwd);
    let mut config: Option<SkillwrightConfig> = None;
    let mut config_dir = cwd.to_path_buf();
    let mut config_path: Option<PathBuf> = None;
    match loaded {
        ConfigLoad::Loaded {
            config: c,
            path,
            dir,
        } => {
            config = Some(*c);
            config_dir = dir;
            config_path = Some(path);
        }
        // Mode 1 (flag-only) is still possible.
        ConfigLoad::Absent { .. } => {}
        ConfigLoad::MissingExplicit { path } => {
            return Err(no_config(
                err,
                &format!(
                    "--config names a file that is not there: {}",
                    path.display()
                ),
            ));
        }
        ConfigLoad::Unreadable { path, detail } => {
            return Err(blocked(
                err,
                &format!("configuration unreadable: {} ({detail})", path.display()),
            ));
        }
        ConfigLoad::Malformed { path, detail } => {
            return Err(blocked(
                err,
                &format!("configuration malformed: {} ({detail})", path.display()),
            ));
        }
    }

    // The flag overrides the file for this run and is never written back —
    // the same precedence `--vault` and `--config` already follow.
    let stem = flags
        .namespace
        .clone()
        .or_else(|| config.as_ref().and_then(|c| c.namespace.clone()));
    let mut namespace: Option<Namespace> = None;
    if let Some(stem) = &stem {
        match Namespace::new(stem) {
            Ok(valid) => namespace = Some(valid),
            Err(invalid) => {
                // The core's message, verbatim — it already names the stem and
                // the reason — plus the one thing the core cannot know: where
                // it came from.
                let source = if flags.namespace.is_some() {
                    "--namespace".to_string()
                } else {
                    format!(
                        "`namespace` in {}",
                        config_path
                            .as_ref()
                            .map(|p| p.display().to_string())
                            .unwrap_or_else(|| "the configuration".to_string())
                    )
                };
                return Err(blocked(
                    err,
                    &format!("configuration error: {invalid}\n  set by {source}"),
                ));
            }
        }
    }

    let vault = if let Some(flag) = &flags.vault {
        resolve_against_cwd(flag, cwd)
    } else if let Some(configured) = config.as_ref().and_then(|c| c.vault.as_deref()) {
        resolve_configured_path(configured, &config_dir)
    } else {
        // The "set it in …" clause is the library's, so it names the file a
        // person standing here would actually be read from.
        return Err(no_config(
            err,
            &format!(
                "No vault: no `{PROJECT_FILE}` above {} names one, {} does not either, and no --vault was given.\n\
                 Pass --vault, run `skillwright init`, or set `vault` in {}.",
                cwd.display(),
                machine_config_path().display(),
                NEEDS.where_to_set("vault", &config_dir),
            ),
        ));
    };
    if !vault.exists() {
        return Err(blocked(
            err,
            &format!("vault not found: {}", vault.display()),
        ));
    }

    Ok(ResolvedRun {
        config,
        config_dir,
        config_path,
        namespace,
        vault,
    })
}

/// Where this vault's skills live, for the verbs that scan or write there.
///
/// One precedence, in one place, because `build` and `adopt` must agree:
/// an adoption writes under the same default `discover_skills` scans.
///
/// `None` means say nothing on the request and let the core apply its own
/// default (the vault root).
///
/// The two configured sources resolve against different bases on purpose:
/// `marketplace.skills_root` is a path in the config file, so it resolves
/// against that file's directory like every other path in it, while
/// `declared_folders.skills` is the *vault* saying where its own skills
/// live.
pub fn resolve_skills_root(flag: Option<&str>, run: &ResolvedRun, cwd: &Path) -> Option<PathBuf> {
    if let Some(flag) = flag {
        return Some(resolve_against_cwd(flag, cwd));
    }
    if let Some(configured) = run
        .config
        .as_ref()
        .and_then(|c| c.marketplace.skills_root.as_deref())
    {
        return Some(resolve_configured_path(configured, &run.config_dir));
    }
    if let Some(declared) = run
        .config
        .as_ref()
        .and_then(|c| c.declared_folders.as_ref())
        .and_then(|d| d.skills.as_deref())
    {
        return Some(resolve_configured_path(declared, &run.vault));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exit::EXIT_BLOCKED;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// Point the machine file at `path` for the length of `f`, serialized
    /// across this binary's parallel test threads.
    ///
    /// The integration tests share one copy of this in `tests/common/`. This
    /// one is separate because a `#[cfg(test)]` item in the library is not
    /// visible from a `tests/` binary, and vice versa.
    fn with_machine_env<T>(path: &Path, f: impl FnOnce() -> T) -> T {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let saved = crate::config::replace_machine_config_override(Some(path.to_path_buf()));
        let result = f();
        crate::config::replace_machine_config_override(saved);
        result
    }

    #[test]
    fn the_no_vault_message_matches_the_ts_wording_byte_for_byte() {
        let dir = tempfile::tempdir().unwrap();
        let machine_path = dir.path().join("machine").join("config.yaml");
        with_machine_env(&machine_path, || {
            let flags = CommonFlags::default();
            let mut err: Vec<u8> = Vec::new();
            let code = resolve_run(&flags, dir.path(), &mut err).unwrap_err();
            assert_eq!(code, crate::exit::EXIT_NO_CONFIG);
            let message = String::from_utf8(err).unwrap();
            let expected = format!(
                "No vault: no `skillwright.yaml` above {} names one, {} does not either, and no --vault was given.\n\
                 Pass --vault, run `skillwright init`, or set `vault` in {}.\n",
                dir.path().display(),
                machine_path.display(),
                NEEDS.where_to_set("vault", dir.path()),
            );
            assert_eq!(message, expected);
        });
    }

    #[test]
    fn an_invalid_namespace_from_a_flag_is_blocked_and_names_the_flag() {
        let dir = tempfile::tempdir().unwrap();
        let machine_path = dir.path().join("machine").join("config.yaml");
        with_machine_env(&machine_path, || {
            let flags = CommonFlags {
                namespace: Some("my-vault".to_string()),
                ..Default::default()
            };
            let mut err: Vec<u8> = Vec::new();
            let code = resolve_run(&flags, dir.path(), &mut err).unwrap_err();
            assert_eq!(code, EXIT_BLOCKED);
            let message = String::from_utf8(err).unwrap();
            assert!(
                message.starts_with(
                    "configuration error: `my-vault` cannot be a frontmatter namespace:"
                ),
                "{message}"
            );
            assert!(
                message.trim_end().ends_with("set by --namespace"),
                "{message}"
            );
        });
    }

    #[test]
    fn resolve_skills_root_prefers_the_flag_then_marketplace_then_declared_folders() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join("vault");
        std::fs::create_dir_all(&vault).unwrap();

        let mut run = ResolvedRun {
            config: None,
            config_dir: dir.path().to_path_buf(),
            config_path: None,
            namespace: None,
            vault: vault.clone(),
        };
        assert_eq!(
            resolve_skills_root(Some("./flagged"), &run, dir.path()),
            Some(dir.path().join("flagged"))
        );
        assert_eq!(resolve_skills_root(None, &run, dir.path()), None);

        let mut config = SkillwrightConfig::default();
        config.marketplace.skills_root = Some("./from-marketplace".to_string());
        run.config = Some(config);
        assert_eq!(
            resolve_skills_root(None, &run, dir.path()),
            Some(dir.path().join("from-marketplace"))
        );

        let mut config = SkillwrightConfig::default();
        config.declared_folders = Some(crate::config::DeclaredFolders {
            skills: Some("./from-vault".to_string()),
            references: None,
            snippets: None,
        });
        run.config = Some(config);
        assert_eq!(
            resolve_skills_root(None, &run, dir.path()),
            Some(vault.join("from-vault"))
        );
    }
}

//! `skillwright harness install|update|uninstall <claude|codex|cursor>` —
//! register this crate's built marketplace with a harness through the
//! harness's own `plugin` CLI and install its plugins where that CLI can,
//! bring them to the built versions, or remove them.
//!
//! Nothing here names a marketplace or a plugin. The marketplace name comes
//! from the harness root's own `marketplace.json`, since that manifest is
//! what the harness checks the registration against. `marketplace.name`,
//! else `marketplace.out`'s final path component, is the fallback for a root
//! not built yet. Plugins come from `--plugin` or `marketplace.default_plugin`.

pub mod adapter;
pub mod cli_runner;
pub mod reconcile;

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use config_layers::needs::Need;
use serde::Serialize;
use serde_json::Value;
use tradecraft_core::{marketplace_manifest_path, plugin_manifest_path};

use crate::config::{NEEDS, resolve_against_cwd, resolve_configured_path};
use crate::ctx::CommandContext;
use crate::exit::{EXIT_OK, blocked, usage_error};
use crate::prompt::{confirm_write, plan_flow};
use crate::resolve::{CommonFlags, resolve_run};

use adapter::{HarnessAdapter, MarketSource, Scope, Want, str_at};
use reconcile::{
    Execution, ReconcileError, reconcile_install, reconcile_uninstall, reconcile_update,
};

/// What a harness run did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// The marketplace or plugins were registered.
    Added,
    /// Registered plugins were brought to the marketplace version.
    Updated,
    /// Registrations were removed.
    Removed,
    /// Everything was already in place.
    Exists,
}

impl Outcome {
    /// The token this value prints.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Added => "added",
            Self::Updated => "updated",
            Self::Removed => "removed",
            Self::Exists => "exists",
        }
    }
}

/// The `name` `manifest` declares. `Ok(None)` only when the file is
/// missing: the root has not been built yet, so falling back to
/// configuration is correct. A manifest that exists and is wrong is an
/// error, never skipped in favor of a name it does not carry.
fn manifest_name(manifest: &Path) -> Result<Option<String>, String> {
    let Some(doc) = read_json(manifest)? else {
        return Ok(None);
    };
    match doc.get("name").and_then(Value::as_str) {
        Some(name) if !name.is_empty() => Ok(Some(name.to_string())),
        _ => Err(format!("{} has no non-empty `name`", manifest.display())),
    }
}

/// `Ok(None)` when `file` is missing.
fn read_json(file: &Path) -> Result<Option<Value>, String> {
    let bytes = match std::fs::read(file) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("{} could not be read: {e}", file.display())),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| format!("{} is not valid JSON: {e}", file.display()))
}

/// Plugin name to version for each of `plugins` that `harness`'s
/// `marketplace.json` under `root` lists. An entry without a `version`
/// (Codex's) takes it from its pack's own plugin manifest. A plugin with
/// neither is left out, so it is never updated. A root not built yet lists
/// none.
pub fn wanted_versions(
    root: &Path,
    harness: &str,
    plugins: &[String],
) -> Result<BTreeMap<String, String>, String> {
    let mut versions = BTreeMap::new();
    let Some(manifest) = marketplace_manifest_path(harness).map(|rel| root.join(rel)) else {
        return Ok(versions);
    };
    let Some(doc) = read_json(&manifest)? else {
        return Ok(versions);
    };
    let entries = doc.get("plugins").and_then(Value::as_array);
    for entry in entries.into_iter().flatten() {
        let Some(name) = str_at(entry, &["name"]).filter(|n| plugins.iter().any(|p| p == n)) else {
            continue;
        };
        let version = match str_at(entry, &["version"]) {
            Some(version) => Some(version.to_string()),
            None => pack_version(root, entry, harness)?,
        };
        if let Some(version) = version {
            versions.insert(name.to_string(), version);
        }
    }
    Ok(versions)
}

/// The `version` in the plugin manifest of the pack a marketplace entry's
/// `source` (a path, or `{path}`) points at.
fn pack_version(root: &Path, entry: &Value, harness: &str) -> Result<Option<String>, String> {
    let source = entry.get("source");
    let pack = str_at(entry, &["source"]).or_else(|| source.and_then(|s| str_at(s, &["path"])));
    let (Some(pack), Some(rel)) = (pack, plugin_manifest_path(harness)) else {
        return Ok(None);
    };
    Ok(read_json(&root.join(pack).join(rel))?
        .and_then(|doc| str_at(&doc, &["version"]).map(str::to_string)))
}

/// Which reconcile routine a run goes through.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HarnessVerb {
    /// Register the marketplace and install plugins.
    Install,
    /// Bring installed plugins to the marketplace's version.
    Update,
    /// `marketplace`: also remove the marketplace registration.
    Uninstall {
        /// Also remove the marketplace registration.
        marketplace: bool,
    },
}

impl HarnessVerb {
    fn name(self) -> &'static str {
        match self {
            Self::Install => "install",
            Self::Update => "update",
            Self::Uninstall { .. } => "uninstall",
        }
    }

    /// Install and update register the marketplace from a source. Uninstall
    /// also matches it by name, so it needs none.
    fn registers(self) -> bool {
        !matches!(self, Self::Uninstall { .. })
    }
}

/// The resolved flags of `skillwright harness install|update|uninstall`.
pub struct HarnessFlags {
    /// The harness to act on.
    pub adapter: &'static HarnessAdapter,
    /// The scope to register and install at.
    pub scope: Scope,
    /// Plugins to act on. Empty means `marketplace.default_plugin`.
    pub plugins: Vec<String>,
    /// The built marketplace directory. Overrides `marketplace.out`.
    pub path: Option<String>,
    /// Register the marketplace from this git URL instead of the directory.
    pub git_url: Option<String>,
    /// Git ref to register the marketplace at.
    pub git_ref: Option<String>,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--dry-run`: classify and report; write nothing.
    pub dry_run: bool,
    /// `--yes`: accept the plan without prompting.
    pub yes: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

#[derive(Serialize)]
struct InstallDocument<'a> {
    harness: &'a str,
    scope: &'a str,
    marketplace: &'a str,
    source: &'a str,
    plugins: &'a [String],
    /// Plugins the harness cannot install from its CLI.
    #[serde(skip_serializing_if = "<[String]>::is_empty")]
    enable_in_harness: &'a [String],
    outcome: &'static str,
    commands: &'a [Vec<String>],
    dry_run: bool,
}

/// Run `harness <verb> <harness>` and return the exit code.
pub fn run_harness(verb: HarnessVerb, flags: &HarnessFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let adapter = flags.adapter;
    let usage = if verb.registers() {
        adapter.check_usage(
            flags.scope,
            flags.git_url.is_some(),
            flags.git_ref.is_some(),
        )
    } else if flags.git_ref.is_some() {
        Err(format!("{} takes no --git-ref", verb.name()))
    } else {
        adapter.check_scope(flags.scope)
    };
    if let Err(message) = usage {
        return usage_error(ctx.err, &message);
    }
    let installs_plugins = adapter.plugins.is_some();

    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let settings = run.config.as_ref().map(|c| &c.marketplace);
    let project = run
        .config
        .as_ref()
        .and_then(|c| serde_json::to_value(c).ok());

    let input_set = |key: &str| match key {
        "path" => flags.path.is_some(),
        "plugin" => !flags.plugins.is_empty(),
        _ => false,
    };
    let verb_name = verb.name();
    let argv_verb = ["harness", verb_name, adapter.name];
    macro_rules! required {
        ($need:expr, $value:expr) => {{
            let need = $need;
            match $value {
                Some(value) if NEEDS.met(&need, project.as_ref(), None, &input_set) => value,
                _ => {
                    return usage_error(
                        ctx.err,
                        &NEEDS.message(&need, &run.config_dir, &argv_verb),
                    );
                }
            }
        }};
    }

    let out_root: Option<PathBuf> = settings
        .and_then(|s| s.out.as_deref())
        .map(|out| resolve_configured_path(out, &run.config_dir));

    // Resolved before the name: the name lookup reads this directory's manifest.
    let root: PathBuf = required!(
        Need {
            config: "marketplace.out",
            unless_input: Some("path"),
        },
        match &flags.path {
            Some(p) => Some(resolve_against_cwd(p, &ctx.cwd)),
            None => out_root.clone(),
        }
    );

    let manifest = marketplace_manifest_path(adapter.name).map(|rel| root.join(rel));
    let found = match manifest.as_deref().map(manifest_name).transpose() {
        Ok(found) => found.flatten(),
        Err(message) => return blocked(ctx.err, &message),
    };
    let configured_name = settings
        .and_then(|s| s.name.clone())
        .filter(|name| !name.is_empty());
    let market_name = match found.or(configured_name) {
        Some(name) => name,
        None => {
            let derived_from = required!(
                Need {
                    config: "marketplace.out",
                    unless_input: None,
                },
                out_root
            );
            match derived_from.file_name().and_then(|f| f.to_str()) {
                Some(name) => name.to_string(),
                None => {
                    return blocked(
                        ctx.err,
                        &format!(
                            "marketplace.out has no final path component to derive a marketplace name from: {}",
                            derived_from.display()
                        ),
                    );
                }
            }
        }
    };

    let configured = if !flags.plugins.is_empty() {
        Some(flags.plugins.clone())
    } else {
        settings
            .and_then(|s| s.default_plugin.clone())
            .map(|p| vec![p])
    };
    let plugins: Vec<String> = if installs_plugins {
        required!(
            Need {
                config: "marketplace.default_plugin",
                unless_input: Some("plugin"),
            },
            configured
        )
    } else {
        configured.unwrap_or_default()
    };

    let versions = match verb {
        HarnessVerb::Update => match wanted_versions(&root, adapter.name, &plugins) {
            Ok(versions) => versions,
            Err(message) => return blocked(ctx.err, &message),
        },
        _ => BTreeMap::new(),
    };
    let want = Want {
        market: MarketSource {
            name: market_name,
            source: flags
                .git_url
                .clone()
                .unwrap_or_else(|| root.display().to_string()),
        },
        git_ref: flags.git_ref.clone(),
        from_git: flags.git_url.is_some(),
        plugins,
    };

    let err = &mut *ctx.err;
    let mut approve = |commands: &[Vec<String>]| {
        if flags.yes {
            return EXIT_OK;
        }
        let mut plan = vec![format!("{verb_name} {}", adapter.name), String::new()];
        plan.extend(plan_flow(&[(
            "run",
            commands.iter().map(|argv| argv.join(" ")).collect(),
        )]));
        confirm_write(&argv_verb.join(" "), &plan, err)
    };
    let exec = Execution {
        runner: ctx.runner,
        cwd: &run.config_dir,
        dry_run: flags.dry_run,
        approve: &mut approve,
    };
    let result = match verb {
        HarnessVerb::Install => reconcile_install(adapter, &want, flags.scope, exec),
        HarnessVerb::Update => reconcile_update(adapter, &want, &versions, flags.scope, exec),
        HarnessVerb::Uninstall { marketplace } => {
            reconcile_uninstall(adapter, &want, flags.scope, marketplace, exec)
        }
    };
    let report = match result {
        Ok(report) => report,
        Err(ReconcileError::Usage(message)) => return usage_error(ctx.err, &message),
        Err(ReconcileError::Blocked(message)) => return blocked(ctx.err, &message),
        Err(ReconcileError::Declined(code)) => return code,
    };
    let enable_in_harness: &[String] = if verb.registers() && !installs_plugins {
        &want.plugins
    } else {
        &[]
    };

    if flags.json {
        let document = InstallDocument {
            harness: adapter.name,
            scope: flags.scope.as_str(),
            marketplace: &want.market.name,
            source: &want.market.source,
            plugins: &want.plugins,
            enable_in_harness,
            outcome: report.outcome.as_str(),
            commands: &report.commands,
            dry_run: flags.dry_run,
        };
        match serde_json::to_string_pretty(&document) {
            Ok(text) => {
                let _ = writeln!(ctx.out, "{text}");
            }
            Err(e) => return blocked(ctx.err, &format!("the report would not serialize: {e}")),
        }
    } else {
        let name = adapter.name;
        if report.commands.is_empty() {
            let _ = writeln!(ctx.out, "{name}  unchanged · exists");
        }
        let verb_word = if flags.dry_run { "would run" } else { "ran" };
        for argv in &report.commands {
            let _ = writeln!(ctx.out, "{name}  {verb_word} · {}", argv.join(" "));
        }
        for plugin in enable_in_harness {
            let _ = writeln!(ctx.out, "{name}  enable in {} · {plugin}", adapter.label);
        }
    }

    if !flags.quiet {
        let tally = match report.commands.len() {
            0 => "nothing to change".to_string(),
            1 => format!("1 command · {}", report.outcome.as_str()),
            n => format!("{n} commands · {}", report.outcome.as_str()),
        };
        let suffix = if flags.dry_run { " (dry run)" } else { "" };
        let _ = writeln!(ctx.err, "{tally}{suffix}");
    }

    EXIT_OK
}

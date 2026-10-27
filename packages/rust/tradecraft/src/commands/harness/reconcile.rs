//! The reconcile routines every harness and scope goes through: read what
//! the harness has, compare it with [`Want`], and run only the commands that
//! close the difference. Install, update and uninstall differ only in the
//! plan; reading and running are shared.

use std::collections::BTreeMap;
use std::path::Path;

use super::Outcome;
use super::adapter::{HarnessAdapter, Installed, MarketSource, Scope, Want, same_source};
use super::cli_runner::{Argv, Runner};

/// Why a reconcile routine did not finish.
pub enum ReconcileError {
    /// The request is not valid for this harness.
    Usage(String),
    /// A harness command failed or its output was unreadable.
    Blocked(String),
    /// The approval gate returned this non-zero exit code.
    Declined(i32),
}

/// What a reconcile routine did.
pub struct Report {
    /// The overall result.
    pub outcome: Outcome,
    /// The mutating commands, run or (under dry run) planned.
    pub commands: Vec<Argv>,
}

/// How a routine runs its plan. When something must change, `approve` sees
/// the planned commands and returns `0` to go ahead. Under `dry_run` nothing
/// mutating runs and `approve` is not asked.
pub struct Execution<'a> {
    /// Runs the harness commands.
    pub runner: &'a dyn Runner,
    /// The directory commands run in.
    pub cwd: &'a Path,
    /// Run nothing that changes state.
    pub dry_run: bool,
    /// Asked to approve the planned commands; returns 0 to go ahead.
    pub approve: &'a mut dyn FnMut(&[Argv]) -> i32,
}

/// What the harness holds at the scope.
struct Current {
    markets: Vec<MarketSource>,
    installed: Installed,
}

impl Current {
    /// The marketplace listed from `want`'s source, under any name.
    fn listed_from(&self, want: &MarketSource) -> Option<&MarketSource> {
        self.markets
            .iter()
            .find(|m| same_source(&m.source, &want.source))
    }

    fn listed_as(&self, want: &MarketSource) -> Option<&MarketSource> {
        self.markets.iter().find(|m| m.name == want.name)
    }
}

/// Bring `adapter`'s harness to `want` at `scope`.
///
/// A marketplace listed from the wanted source counts as present under any
/// name. One listed under the wanted name from another source is removed and
/// added again, and since removing it drops its plugins, every wanted plugin
/// is installed again after.
pub fn reconcile_install(
    adapter: &HarnessAdapter,
    want: &Want,
    scope: Scope,
    exec: Execution<'_>,
) -> Result<Report, ReconcileError> {
    let current = read_current(adapter, scope, &exec)?;
    let (commands, outcome) = plan_install(adapter, want, scope, &current);
    execute(outcome, commands, exec)
}

/// Install what is missing, then bring each installed plugin whose listed
/// version differs from `versions` (plugin name to the built version) to
/// that version. A marketplace from git is refreshed first, since the
/// harness installs from its own snapshot. A harness with no per-plugin
/// commands refreshes its already registered marketplace instead, since it
/// lists no plugin versions to compare.
pub fn reconcile_update(
    adapter: &HarnessAdapter,
    want: &Want,
    versions: &BTreeMap<String, String>,
    scope: Scope,
    exec: Execution<'_>,
) -> Result<Report, ReconcileError> {
    let current = read_current(adapter, scope, &exec)?;
    let (mut commands, mut outcome) = plan_install(adapter, want, scope, &current);
    let held = current.listed_from(&want.market);
    let updates: Vec<Argv> = match (held, &adapter.plugins) {
        // Not held from the wanted source: install adds it and installs every plugin.
        (None, _) => Vec::new(),
        (Some(market), Some(plugins)) => {
            let mut updates: Vec<Argv> = want
                .plugins
                .iter()
                .filter_map(|plugin| {
                    let id = format!("{plugin}@{}", market.name);
                    let have = current.installed.get(&id)?.as_ref()?;
                    (versions.get(plugin)? != have).then(|| (plugins.update)(&id, scope))
                })
                .flatten()
                .collect();
            if want.from_git && !updates.is_empty() {
                updates.insert(0, (adapter.update_market)(&market.name, scope));
            }
            updates
        }
        (Some(market), None) => vec![(adapter.update_market)(&market.name, scope)],
    };
    if !updates.is_empty() {
        commands.extend(updates);
        outcome = Outcome::Updated;
    }
    execute(outcome, commands, exec)
}

/// Remove each wanted plugin installed at `scope`, and the marketplace
/// registration too when `remove_market` is set. The marketplace is matched
/// by the wanted source, else by the wanted name.
pub fn reconcile_uninstall(
    adapter: &HarnessAdapter,
    want: &Want,
    scope: Scope,
    remove_market: bool,
    exec: Execution<'_>,
) -> Result<Report, ReconcileError> {
    let current = read_current(adapter, scope, &exec)?;
    let held = current
        .listed_from(&want.market)
        .or_else(|| current.listed_as(&want.market));
    let market_name = held.map_or(&want.market.name, |m| &m.name);

    let mut commands = Vec::new();
    if let Some(plugins) = &adapter.plugins {
        for plugin in &want.plugins {
            let id = format!("{plugin}@{market_name}");
            if current.installed.contains_key(&id) {
                commands.push((plugins.uninstall)(&id, scope));
            }
        }
    }
    if remove_market && held.is_some() {
        commands.push((adapter.remove_market)(market_name, scope));
    }
    let outcome = if commands.is_empty() {
        Outcome::Exists
    } else {
        Outcome::Removed
    };
    execute(outcome, commands, exec)
}

fn read_current(
    adapter: &HarnessAdapter,
    scope: Scope,
    exec: &Execution<'_>,
) -> Result<Current, ReconcileError> {
    adapter.check_scope(scope).map_err(ReconcileError::Usage)?;
    let (runner, cwd) = (exec.runner, exec.cwd);
    let markets = match (adapter.scoped_markets)(scope, cwd) {
        Some(declared) => declared.map_err(ReconcileError::Blocked)?,
        None => read(
            runner,
            cwd,
            (adapter.list_markets)(scope),
            adapter.parse_markets,
        )?,
    };
    let installed = match &adapter.plugins {
        Some(plugins) => read(runner, cwd, (plugins.list)(scope), |stdout| {
            (plugins.parse)(stdout, scope, cwd)
        })?,
        None => Installed::new(),
    };
    Ok(Current { markets, installed })
}

fn plan_install(
    adapter: &HarnessAdapter,
    want: &Want,
    scope: Scope,
    current: &Current,
) -> (Vec<Argv>, Outcome) {
    let mut commands = Vec::new();
    let held = current.listed_from(&want.market);
    let replaced = held.is_none() && current.listed_as(&want.market).is_some();
    // Plugin ids name the marketplace the harness actually holds.
    let market_name = held.map_or(&want.market.name, |m| &m.name);
    if replaced {
        commands.push((adapter.remove_market)(&want.market.name, scope));
    }
    if held.is_none() {
        commands.push((adapter.add_market)(want, scope));
    }
    if let Some(plugins) = &adapter.plugins {
        for plugin in &want.plugins {
            let id = format!("{plugin}@{market_name}");
            if replaced || !current.installed.contains_key(&id) {
                commands.push((plugins.install)(&id, scope));
            }
        }
    }
    let outcome = if replaced {
        Outcome::Updated
    } else if commands.is_empty() {
        Outcome::Exists
    } else {
        Outcome::Added
    };
    (commands, outcome)
}

fn execute(
    outcome: Outcome,
    commands: Vec<Argv>,
    exec: Execution<'_>,
) -> Result<Report, ReconcileError> {
    if exec.dry_run || commands.is_empty() {
        return Ok(Report { outcome, commands });
    }
    let gate = (exec.approve)(&commands);
    if gate != 0 {
        return Err(ReconcileError::Declined(gate));
    }
    for (done, argv) in commands.iter().enumerate() {
        let result = exec.runner.run(argv, exec.cwd);
        if !result.ok() {
            let mut message = failure(argv, &result.stderr);
            if done > 0 {
                let ran: Vec<String> = commands[..done].iter().map(|a| a.join(" ")).collect();
                message.push_str(&format!("\nalready ran: {}", ran.join("; ")));
            }
            return Err(ReconcileError::Blocked(message));
        }
    }
    Ok(Report { outcome, commands })
}

fn read<T>(
    runner: &dyn Runner,
    cwd: &Path,
    argv: Argv,
    parse: impl FnOnce(&str) -> Result<T, String>,
) -> Result<T, ReconcileError> {
    let result = runner.run(&argv, cwd);
    if !result.ok() {
        return Err(ReconcileError::Blocked(failure(&argv, &result.stderr)));
    }
    parse(&result.stdout).map_err(|e| ReconcileError::Blocked(format!("`{}`: {e}", argv.join(" "))))
}

fn failure(argv: &[String], stderr: &str) -> String {
    format!("`{}` failed: {}", argv.join(" "), stderr.trim())
}

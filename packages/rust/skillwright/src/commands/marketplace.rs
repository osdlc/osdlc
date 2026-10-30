//! `skillwright build` and `skillwright check` — the vault rendered into its
//! standalone marketplace roots, and the drift check over them.
//!
//! One function for both verbs, because in the core they are one path: a
//! single render into a capturing overlay, compared once against the
//! destination. `build` acts on that comparison and `check` returns it. This
//! file's whole contribution is which mode goes on the request, and what a
//! drifted report means for the exit code.
//!
//! Nothing about the marketplace is decided here. Which skills are
//! publishable, how they group into plugins, what each manifest says, which
//! root a skill's `sw-targets` admits it to, what counts as stale, and
//! whether the swap is safe all live in [`tradecraft_core::export`]. This
//! file resolves flags against configuration, calls once, and renders.
//!
//! # `--dry-run` on `build` is not `check`
//!
//! Both write nothing, and they answer different questions. The CLI spec
//! fixes `--dry-run` as "classify and report; write nothing — the exit code
//! is what the real run would have returned", so `build --dry-run` reports
//! the drift and exits 0, exactly as the build it previews would. `check` is
//! the CI verb: the same render, the same report, and exit 1 on any drift.

use std::collections::BTreeSet;
use std::path::PathBuf;

use config_layers::needs::Need;
use tradecraft_core::{
    AssetSpec, ExportMode, ExportRequest, ExportUnit, HookFileSpec, NativeVfs, export_skills,
    root_trees,
};

use crate::config::{NEEDS, resolve_against_cwd, resolve_configured_path};
use crate::ctx::CommandContext;
use crate::exit::{EXIT_OK, EXIT_REFUSED, blocked, usage_error};
use crate::prompt::{confirm_write, plan_flow};
use crate::report::{
    count_checked_units, normalize_thrown_reason, render_export_tally, render_unit_line,
    render_warning_line,
};
use crate::resolve::{CommonFlags, resolve_run, resolve_skills_root};

/// Which of the two verbs this run is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportVerb {
    /// Write the roots.
    Build,
    /// Report drift against the roots; write nothing.
    Check,
}

impl ExportVerb {
    fn as_str(self) -> &'static str {
        match self {
            Self::Build => "build",
            Self::Check => "check",
        }
    }
}

/// The resolved flags of `skillwright build and check`.
pub struct ExportFlags {
    /// Where the roots land. Overrides `marketplace.out`.
    pub out: Option<String>,
    /// The skills root to scan. Overrides `marketplace.skills_root`.
    pub skills_root: Option<String>,
    /// Which marketplace to build. Refused by name if the vault holds no
    /// such one.
    pub marketplace: Option<String>,
    /// The plugin a note with no `sw-plugin` belongs to. Overrides
    /// `marketplace.default_plugin`.
    pub default_plugin: Option<String>,
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

/// Run one export. `verb` decides the mode a plain run uses and what a
/// drifted report exits with; everything else about the two verbs is
/// identical.
pub fn run_export(verb: ExportVerb, flags: &ExportFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let settings = run.config.as_ref().map(|c| c.marketplace.clone());

    // --- the marketplace's own identity -------------------------------------
    // `name` is not asked for here. A marketplace note names itself and the
    // core reads it; where a vault holds no marketplace at all the core
    // refuses `unnamed-marketplace`, naming what is missing and where to
    // write it. Passed through when configured, as the fallback it now is.
    //
    // `--marketplace` is the SELECTOR: which of the vault's marketplaces to
    // build. It reaches `ExportRequest::marketplace`, which is validated
    // against what the vault actually holds, so a typo is refused by name
    // instead of quietly renaming the output.
    //
    // What the verb cannot run without is asked of the needs check, so the
    // "set it in …" clause names the right file for where the person is
    // standing.
    let project = run
        .config
        .as_ref()
        .and_then(|c| serde_json::to_value(c).ok());
    let input_set = |key: &str| match key {
        "defaultPlugin" => flags.default_plugin.is_some(),
        "out" => flags.out.is_some(),
        _ => false,
    };
    // Each need is checked and its value taken in one step, so nothing below
    // has to assume the check ran.
    macro_rules! required {
        ($need:expr, $value:expr) => {{
            let need = $need;
            match $value {
                Some(value) if NEEDS.met(&need, project.as_ref(), None, &input_set) => value,
                _ => {
                    return usage_error(
                        ctx.err,
                        &NEEDS.message(&need, &run.config_dir, &[verb.as_str()]),
                    );
                }
            }
        }};
    }

    let default_plugin = required!(
        Need {
            config: "marketplace.default_plugin",
            unless_input: Some("defaultPlugin"),
        },
        flags
            .default_plugin
            .clone()
            .or_else(|| settings.as_ref().and_then(|s| s.default_plugin.clone()))
    );
    let out_root: PathBuf = required!(
        Need {
            config: "marketplace.out",
            unless_input: Some("out"),
        },
        match &flags.out {
            Some(out) => Some(resolve_against_cwd(out, &ctx.cwd)),
            None => settings
                .as_ref()
                .and_then(|s| s.out.as_deref())
                .map(|out| resolve_configured_path(out, &run.config_dir)),
        }
    );

    // The one precedence, shared with `adopt`: what a build scans must be
    // what an adoption writes into.
    let skills_root = resolve_skills_root(flags.skills_root.as_deref(), &run, &ctx.cwd);

    // Which harnesses this marketplace is built for. Absent is every one the
    // core supports; the core refuses a name no harness answers to, so a typo
    // is named rather than quietly publishing less than was asked for.
    let harnesses: BTreeSet<String> = settings
        .as_ref()
        .map(|s| s.harness_set())
        .unwrap_or_default();

    // A setting that will not convert is a configuration fault, not a usage
    // error: the invocation is well-formed.
    let marketplace = match settings.unwrap_or_default().to_config(default_plugin) {
        Ok(config) => config,
        Err(err) => return blocked(ctx.err, &format!("configuration error: {err}")),
    };

    // Each `from` resolves against this project file's own directory — the
    // same rule `marketplace.out` follows — because the core never reads an
    // ambient config file and has nothing to resolve a relative path
    // against (see [`tradecraft_core::export::AssetSpec`]).
    let assets: Vec<AssetSpec> = run
        .config
        .as_ref()
        .map(|c| c.assets.as_slice())
        .unwrap_or(&[])
        .iter()
        .map(|entry| AssetSpec {
            source: resolve_configured_path(&entry.from, &run.config_dir),
            dest: entry.to.clone(),
            plugin: entry.plugin.clone(),
        })
        .collect();
    let hooks: Vec<HookFileSpec> = run
        .config
        .as_ref()
        .map(|c| c.hooks.as_slice())
        .unwrap_or(&[])
        .iter()
        .map(|entry| {
            let source = resolve_configured_path(&entry.from, &run.config_dir);
            // Config-relative, so the gap report names no host path.
            let from = crate::config::relative_path(&run.config_dir, &source)
                .to_string_lossy()
                .replace('\\', "/");
            HookFileSpec {
                source,
                from,
                plugin: entry.plugin.clone(),
            }
        })
        .collect();

    // --- the mode -----------------------------------------------------------
    // `check` never writes; `build --dry-run` renders through the same
    // write-nothing mode and differs only in what it exits with (see the
    // module doc). So the only run that reaches `ExportMode::Build` is a
    // plain `build`.
    let writes = verb == ExportVerb::Build && !flags.dry_run;
    let request = ExportRequest {
        vault_root: run.vault.clone(),
        skills_root,
        marketplace: flags.marketplace.clone(),
        out_root: out_root.clone(),
        mode: if writes {
            ExportMode::Build
        } else {
            ExportMode::Check
        },
        config: marketplace,
        harnesses,
        assets,
        hooks,
    };

    // --- confirmation -------------------------------------------------------
    // A build replaces a whole tree per harness at the output path, so it
    // confirms like a publish. A run that writes nothing has nothing to
    // confirm and is not asked, rather than auto-answered.
    if writes && !flags.yes {
        // The harnesses are named, and the one directory each one replaces
        // with them. The marketplace directory can be a repository root, so
        // "everything under <out>" would be alarming and also untrue — what
        // this replaces is one entry per harness, and naming them says so.
        // The list comes from `root_trees`, not from a copy of the table here.
        let trees = match root_trees(&request) {
            Ok(trees) => trees,
            Err(err) => {
                return blocked(
                    ctx.err,
                    &format!(
                        "build failed: {}",
                        normalize_thrown_reason(&err.to_string())
                    ),
                );
            }
        };
        // The trees are padded to each other so the harness names line up
        // after them, the way `plan_flow` lines the labels up against each
        // other.
        let width = trees.iter().map(|(_, tree)| tree.len()).max().unwrap_or(0);
        let mut plan = vec!["build the marketplace".to_string(), String::new()];
        plan.extend(plan_flow(&[
            ("from vault", vec![run.vault.display().to_string()]),
            ("into", vec![out_root.display().to_string()]),
            (
                "replacing",
                trees
                    .iter()
                    .map(|(name, tree)| format!("{tree:width$}  {name}"))
                    .collect(),
            ),
        ]));
        plan.push(String::new());
        plan.push("Each of those is replaced whole, and what the vault no longer".to_string());
        plan.push("produces is removed. Nothing else in that directory is touched.".to_string());
        let gate = confirm_write("build", &plan, ctx.err);
        if gate != EXIT_OK {
            return gate;
        }
    }

    // The flag is answered on both verbs, and answered differently. On
    // `build` it marks the run as a plan; on `check` it is redundant, and
    // saying so is the difference between a flag that does nothing and a flag
    // that was never read — the second is indistinguishable from a bug.
    if flags.dry_run {
        let _ = writeln!(
            ctx.err,
            "{}",
            match verb {
                ExportVerb::Check =>
                    "check writes nothing under any outcome — --dry-run changes nothing about this run",
                ExportVerb::Build =>
                    "dry run — reporting the drift a build would act on; nothing will be written",
            }
        );
    }

    // --- run ----------------------------------------------------------------
    let report = match export_skills(&NativeVfs, &request, &run.core_namespace()) {
        Ok(report) => report,
        // An export has no partial report: its rails fire before anything is
        // staged, and a failed swap rolls back. So a failure means nothing
        // was written and there is no report to print — a run-level blocker.
        Err(err) => {
            let message = err.to_string();
            return blocked(
                ctx.err,
                &format!(
                    "{} failed: {}",
                    verb.as_str(),
                    normalize_thrown_reason(&message)
                ),
            );
        }
    };

    if flags.json {
        match serde_json::to_string_pretty(&report) {
            Ok(document) => {
                let _ = writeln!(ctx.out, "{document}");
            }
            Err(err) => return blocked(ctx.err, &format!("the report would not serialize: {err}")),
        }
    } else {
        for unit in &report.units {
            let _ = writeln!(ctx.out, "{}", render_unit_line(unit, report.mode));
        }
    }

    // Stderr, and not dropped by `--quiet`: each names something published
    // that the author did not write.
    for warning in &report.warnings {
        let _ = writeln!(ctx.err, "{}", render_warning_line(warning));
    }

    if !flags.quiet {
        let suffix = if verb == ExportVerb::Build && flags.dry_run {
            " (dry run)"
        } else {
            ""
        };
        // The leading count and the tally both count units — a plugin row
        // per root plus a manifest row per root — so the two numbers always
        // agree. `report.checked` is a different count (skills discovered)
        // and belongs on the wire, not this line; see
        // [`crate::report::count_checked_units`].
        let _ = writeln!(
            ctx.err,
            "{} checked — {}{suffix}",
            count_checked_units(&report.units),
            render_export_tally(&report.units)
        );
    }

    // A plugin whose members drifted with its own `sw-version` unmoved since
    // is a `check`-only callout — `build` just swapped the drift away, so
    // there is nothing left to suggest bumping. Stderr, never stdout: the
    // human table and `--json` already carry this fact (the report's own
    // `version_bump_suggestion` field), and stdout has to read identically
    // whether or not this advisory exists.
    if verb == ExportVerb::Check && !flags.json {
        for unit in &report.units {
            if let ExportUnit::Plugin {
                root,
                name,
                version_bump_suggestion: Some(vbs),
                ..
            } = unit
            {
                let _ = writeln!(
                    ctx.err,
                    "advisory: {root}/{name} sw-version {} unmoved since members changed — `skillwright bump {name}` is available",
                    vbs.current_version
                );
            }
        }
    }

    // `check` is the CI verb and drift is what it exists to catch, so a
    // drifted marketplace exits 1 (the CLI spec). A build exits 0 whether it
    // swapped or found everything already in place: both are the run
    // completing and every outcome being written or unchanged.
    if verb == ExportVerb::Check && report.changed {
        EXIT_REFUSED
    } else {
        EXIT_OK
    }
}

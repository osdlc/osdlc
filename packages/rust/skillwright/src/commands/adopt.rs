//! `skillwright adopt` — SKILL.md bundles already on disk brought into the
//! vault as notes, with their relative links rewritten to wikilinks and
//! their provenance stamped.
//!
//! The mirror of publish, and it obeys the mirrored rail: adoption writes
//! into the vault by design and never writes into the source it reads. That
//! rail is the core's, like every other decision here — which directories
//! hold a skill, what each adopted note is called, which links become
//! wikilinks, whether a name collides. This file resolves sources against
//! configuration, loops, and renders.
//!
//! # `--dry-run` is the core's mode, never a prediction
//!
//! The flag sets [`AdoptMode::DryRun`] on the request and nothing else. The
//! core runs the identical adoption over its own preview overlay and hands
//! back the report the write would have produced — same names, same
//! collisions, same per-skill refusals.
//!
//! # Replacing a note is per note, and named
//!
//! There is no run-wide force. `--overwrite <path>` names one vault note the
//! run may replace, repeatable, matching the spelling `publish` uses to
//! resolve a conflicted file. A re-adopt reports `unchanged`, `updated`, or
//! `refused` from the core's three-way comparison, and only `refused` needs
//! the flag.
//!
//! # `--from-git` fetches before it adopts
//!
//! [`crate::git_source`] clones a named repository into the checkout cache
//! and hands this file an ordinary directory — the core never learns a URL
//! was involved. A fetch that fails is recorded as a per-source failure
//! rather than aborting the run: the other sources the caller named are
//! still independent adoptions.
//!
//! # Two flags are honestly unimplemented
//!
//! `--as <name>` renames one source on the way in, and the core derives the
//! adopted name itself; `--promote` registers the source as a destination,
//! which is a configuration write this crate never does. Both exit 2 saying
//! so — see `STUB_AS` and `STUB_PROMOTE`.

use std::path::PathBuf;

use serde::Serialize;
use tradecraft_core::{
    AdoptMode, AdoptRequest, AdoptStatus, AdoptedSkill, NativeVfs, adopt_skills,
};

use crate::config::{resolve_against_cwd, resolve_configured_path};
use crate::ctx::CommandContext;
use crate::exit::{EXIT_INTERRUPTED, EXIT_OK, EXIT_REFUSED, blocked, not_implemented, usage_error};
use crate::git_source::{fetch_git_source, parse_git_source};
use crate::prompt::{confirm_write, plan_flow};
use crate::report::{normalize_thrown_reason, render_adopt_tally, render_adopted_line};
use crate::resolve::{CommonFlags, resolve_run, resolve_skills_root};

/// `--as <name>` renames one source on the way in. The core derives the
/// adopted name itself — the source frontmatter's `name` slugified, or the
/// source directory's basename — and [`AdoptRequest`] carries no override,
/// so honouring the flag would mean naming a skill here instead of leaving
/// that to the core.
const STUB_AS: &str = "`--as <name>` renames one source on the way in. The core derives the adopted name itself — the source frontmatter's `name` slugified, or the source directory's basename — and `AdoptRequest` carries no override, so honouring the flag would mean naming a skill here instead of leaving that to the core.";

/// `--promote` registers the source path as a destination, which is a
/// configuration write this crate never does — `init` is the verb that
/// would write configuration, and it is not implemented either.
const STUB_PROMOTE: &str = "`--promote` registers the source path as a destination, which is a configuration write. This crate only ever reads configuration; `init` is the verb that would write it, and it is not implemented either.";

/// The resolved flags of `skillwright adopt`.
pub struct AdoptFlags {
    /// Source paths, positionally.
    pub sources: Vec<String>,
    /// Repeatable. Defaults to every registered scan location.
    pub from: Vec<String>,
    /// Repeatable. Repositories to read: `owner/repo[/path][@ref]`, or a URL.
    pub from_git: Vec<String>,
    /// The plugin group adopted skills are stamped with.
    pub plugin: Option<String>,
    /// Repeatable. What lands in `sw-targets`.
    pub set_targets: Vec<String>,
    /// Repeatable. Adopt only these skills, by name or source-relative path.
    pub only: Vec<String>,
    /// The skills root written under. Overrides the configured one.
    pub into: Option<String>,
    /// Repeatable. Vault notes this run may replace, each named.
    pub overwrite: Vec<String>,
    /// Unimplemented; see `STUB_AS`.
    pub r#as: Option<String>,
    /// Unimplemented; see `STUB_PROMOTE`.
    pub promote: bool,
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

/// One source, ready to adopt: the directory the core reads, and — for a
/// repository — the durable spelling the notes record instead of that
/// directory.
struct ResolvedSource {
    path: PathBuf,
    label: Option<String>,
}

impl ResolvedSource {
    /// The label where there is one: a cache path tells the reader nothing
    /// about what they are about to import.
    fn shown(&self) -> String {
        self.label
            .clone()
            .unwrap_or_else(|| self.path.display().to_string())
    }
}

/// A whole source a rail stopped — a symlink in it, a colliding pair, an
/// unknown target, a skills root that contains it, or a repository that did
/// not fetch.
///
/// Its own shape rather than a refused [`AttributedSkill`], because the
/// core never got as far as naming a skill: a line claiming one would invent
/// the name, the plugin, and the path it would have landed at. This carries
/// only what is true — which source, and the reason.
#[derive(Serialize)]
struct FailedSource {
    source: String,
    reason: String,
}

/// One skill's outcome, attributed to the source it came from.
#[derive(Serialize)]
struct AttributedSkill {
    #[serde(flatten)]
    skill: AdoptedSkill,
    source: String,
}

/// The `--json` document: the skill lines, plus the sources a rail stopped —
/// omitted entirely when there are none, mirroring how the publish document
/// omits `not_published`.
#[derive(Serialize)]
struct AdoptDocument<'a> {
    skills: &'a [AttributedSkill],
    #[serde(skip_serializing_if = "Option::is_none")]
    failed: Option<&'a [FailedSource]>,
}

/// Run `skillwright adopt` and return the exit code.
pub fn run_adopt(flags: &AdoptFlags, ctx: &mut CommandContext<'_>) -> i32 {
    if flags.r#as.is_some() {
        return not_implemented(ctx.err, "adopt --as", STUB_AS);
    }
    if flags.promote {
        return not_implemented(ctx.err, "adopt --promote", STUB_PROMOTE);
    }

    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };

    // --- sources --------------------------------------------------------
    // Positional paths and `--from` are one list, resolved against the
    // shell's cwd; the registered scan locations are the fallback and
    // resolve against the config file's directory, like every other path in
    // it.
    let named: Vec<ResolvedSource> = flags
        .sources
        .iter()
        .chain(flags.from.iter())
        .map(|s| ResolvedSource {
            path: resolve_against_cwd(s, &ctx.cwd),
            label: None,
        })
        .collect();

    // A repository is fetched before anything else: a clone that fails
    // should not happen after the confirmation prompt, and the checkout's
    // path is what the confirmation has to name.
    let mut fetched: Vec<ResolvedSource> = Vec::new();
    // Repositories that would not fetch. Carried, not returned on: this
    // run's contract is that each source is independent, and a network blip
    // on the second of three refs must not discard the first.
    let mut fetch_failed: Vec<FailedSource> = Vec::new();
    for spelling in &flags.from_git {
        let Some(repository) = parse_git_source(spelling) else {
            return usage_error(
                ctx.err,
                &format!(
                    "--from-git wants a repository: `{spelling}` is not one. Try owner/repo, optionally with a path and @ref."
                ),
            );
        };
        if !flags.quiet {
            let _ = writeln!(ctx.err, "fetching {}", repository.url);
        }
        match fetch_git_source(&repository) {
            Ok(resolved) => fetched.push(ResolvedSource {
                path: resolved.source,
                label: Some(resolved.stamped),
            }),
            // Reported with the run's other source-level failures, below —
            // the same line, the same exit code. Returning here would
            // abandon every source the caller also named, including ones
            // already resolved.
            Err(err) => fetch_failed.push(FailedSource {
                source: spelling.clone(),
                reason: err.to_string(),
            }),
        }
    }

    // A repository that failed to fetch still counts as a source the caller
    // named: falling back to the configured scan locations because nothing
    // survived the fetch would adopt something nobody asked for.
    let asked_for_a_source =
        !flags.sources.is_empty() || !flags.from.is_empty() || !flags.from_git.is_empty();
    let sources: Vec<ResolvedSource> = if asked_for_a_source {
        named.into_iter().chain(fetched).collect()
    } else {
        run.config
            .as_ref()
            .map(|c| c.scan_locations.as_slice())
            .unwrap_or_default()
            .iter()
            .map(|s| ResolvedSource {
                path: resolve_configured_path(s, &run.config_dir),
                label: None,
            })
            .collect()
    };
    if sources.is_empty() && fetch_failed.is_empty() {
        return usage_error(
            ctx.err,
            "adopt needs a source: pass a path (or --from <location> / --from-git <ref>), or register scan locations in the configuration",
        );
    }
    // `--only` names skills WITHIN a source, and the core refuses a name
    // that matched nothing — per source. Broadcasting one list across
    // several sources therefore refuses every source that does not hold
    // every name, which reads as the tool failing rather than the flag
    // being aimed wrong.
    if !flags.only.is_empty() && sources.len() > 1 {
        return usage_error(
            ctx.err,
            "--only selects within one source; pass a single source, or drop --only",
        );
    }

    // The one precedence, shared with `build`: what an adoption writes must
    // be what a build scans. A source that is not there is left to the
    // core, which answers `corpus root not found` — checking it here would
    // be a second, stricter spelling of that refusal.
    let skills_root = resolve_skills_root(flags.into.as_deref(), &run, &ctx.cwd);

    // --- confirmation -----------------------------------------------------
    // Adoption writes notes into the vault, so it confirms like a publish.
    // A dry run is the plan alone and is not asked, rather than
    // auto-answered.
    if !flags.dry_run && !flags.yes && !sources.is_empty() {
        let mut plan = vec![format!("adopt {} source(s)", sources.len()), String::new()];
        plan.extend(plan_flow(&[
            (
                "from sources",
                sources.iter().map(|s| s.shown()).collect::<Vec<_>>(),
            ),
            ("into vault", vec![run.vault.display().to_string()]),
        ]));
        let gate = confirm_write("adopt", &plan, ctx.err);
        if gate != EXIT_OK {
            return gate;
        }
    }

    if flags.dry_run {
        let _ = writeln!(
            ctx.err,
            "dry run — reporting the plan; nothing will be written"
        );
    }

    // --- run ----------------------------------------------------------------
    // One timestamp for the whole run, taken once: the core has no clock,
    // and a second read of it per source would stamp one adoption with two
    // times.
    let adopted_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let namespace = run.core_namespace();
    let mut adopted: Vec<AttributedSkill> = Vec::new();
    let mut failed: Vec<FailedSource> = fetch_failed;

    for source in &sources {
        if ctx.is_interrupted() {
            break;
        }
        let shown = source.shown();
        if !flags.quiet {
            let _ = writeln!(ctx.err, "adopting {shown} -> {}", run.vault.display());
        }

        let request = AdoptRequest {
            source: source.path.clone(),
            vault_root: run.vault.clone(),
            skills_root: skills_root.clone(),
            plugin: flags.plugin.clone(),
            source_label: source.label.clone(),
            format: None,
            also_scan: Vec::new(),
            targets: (!flags.set_targets.is_empty()).then_some(flags.set_targets.clone()),
            skills: (!flags.only.is_empty()).then_some(flags.only.clone()),
            overwrite: flags.overwrite.clone(),
            mode: if flags.dry_run {
                AdoptMode::DryRun
            } else {
                AdoptMode::Write
            },
            adopted_at: adopted_at.clone(),
        };

        match adopt_skills(&NativeVfs, &request, &namespace) {
            Ok(report) => {
                for skill in report.skills {
                    adopted.push(AttributedSkill {
                        skill,
                        source: shown.clone(),
                    });
                }
            }
            // A rail stopped this whole source before a byte of it was
            // written. The run continues: each source is an independent
            // adoption, and one with a symlink in it says nothing about the
            // next.
            Err(err) => {
                let message = err.to_string();
                failed.push(FailedSource {
                    source: shown,
                    reason: normalize_thrown_reason(&message).to_string(),
                });
            }
        }
    }

    // --- report ---------------------------------------------------------
    if flags.json {
        let document = AdoptDocument {
            skills: &adopted,
            failed: (!failed.is_empty()).then_some(failed.as_slice()),
        };
        match serde_json::to_string_pretty(&document) {
            Ok(text) => {
                let _ = writeln!(ctx.out, "{text}");
            }
            Err(err) => return blocked(ctx.err, &format!("the report would not serialize: {err}")),
        }
    } else {
        for item in &adopted {
            let _ = writeln!(ctx.out, "{}", render_adopted_line(&item.skill));
        }
    }

    // A failed source goes to stderr, not stdout: the CLI spec gives stdout one
    // line per outcome, and a source the core never opened produced none.
    // Not gated on `--quiet`, whose contract is "drops the progress and the
    // tally" — a quiet run silent about a source that adopted nothing is
    // the failure this line exists to prevent.
    for failure in &failed {
        let _ = writeln!(
            ctx.err,
            "adopt failed for {}: {}",
            failure.source, failure.reason
        );
    }

    if !flags.quiet {
        let skills_only: Vec<AdoptedSkill> = adopted.iter().map(|a| a.skill.clone()).collect();
        let suffix = if flags.dry_run { " (dry run)" } else { "" };
        let _ = writeln!(ctx.err, "{}{suffix}", render_adopt_tally(&skills_only));
    }

    if ctx.is_interrupted() {
        return EXIT_INTERRUPTED;
    }
    // A source-level blocker rides the report and the completed run exits
    // 1 — the same rule a destination-level blocker gives a publish, "even
    // when that destination was the only one". Exit 2 is for a run that
    // never started: no configuration, no vault, no source named at all.
    // Only `refused` is a blocker: `unchanged` and `updated` are what a
    // healthy re-adopt looks like, and exiting 1 on them would make every
    // second run of an unchanged tree read as a failure.
    let refused = adopted
        .iter()
        .any(|a| a.skill.status == AdoptStatus::Refused);
    if refused || !failed.is_empty() {
        EXIT_REFUSED
    } else {
        EXIT_OK
    }
}

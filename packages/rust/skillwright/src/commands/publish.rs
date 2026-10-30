//! `skillwright publish` — argument resolution, fan-out over the core's
//! one-skill/one-destination [`publish_skill`], and reporting; no compile or
//! publish decision is made in this file.
//!
//! A whole-vault run is the same fan-out over a longer list. `--all` — and a
//! bare `publish`, which means the same thing — takes its list from
//! [`discover_components`] and narrows it to the two kinds the publish spec
//! calls publishable UNITS: every skill note and every plugin note, each
//! classified by the core, never by a guess made here.
//!
//! `--dry-run` needs nothing this file doesn't already have: the core carries
//! a `mode` on [`PublishRequest`] ([`PublishMode::Write`], the default, or
//! [`PublishMode::DryRun`]) and runs the identical publish path against a
//! capturing in-memory overlay — classification, refusals, rails,
//! `not_published`, all of it, unchanged. This file's whole job for the flag
//! is setting the one field and skipping the confirmation prompt, which a
//! plan must never trigger.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tradecraft_core::{
    CoreError, EntityKind, KNOWN_TARGETS, NativeVfs, PublishMode, PublishOutcome, PublishReason,
    PublishRequest, PublishStatus, PublishedFile, ReasonToken, SkippedNote, canonical_target,
    discover_components, publish_skill,
};

use crate::config::{normalize_join, relative_path, resolve_against_cwd, resolve_configured_path};
use crate::ctx::CommandContext;
use crate::exit::{EXIT_INTERRUPTED, EXIT_OK, EXIT_REFUSED, blocked, usage_error};
use crate::prompt::{confirm_write, plan_flow};
use crate::report::{
    AttributedExclusion, Attribution, has_refusal, normalize_thrown_reason, render_exclusion,
    render_file_line, render_reason, render_tally, render_unmatched_overwrite, render_warning_line,
};
use crate::resolve::{CommonFlags, resolve_run};

/// The resolved flags of `skillwright publish`.
pub struct PublishFlags {
    /// Vault-relative paths to the notes to publish. Empty means every
    /// publishable unit — the same run `--all` spells explicitly.
    pub notes: Vec<String>,
    /// Repeatable. Destination roots. Requires `--target`.
    pub to: Vec<String>,
    /// Narrows to one target across the destinations selected.
    pub target: Option<String>,
    /// Every publishable unit in the vault. The default when no note is
    /// named; naming both is a usage error rather than a guess.
    pub all: bool,
    /// Repeatable. Resolves exactly one conflicted file, by its
    /// destination-relative path.
    pub overwrite: Vec<String>,
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

/// One resolved destination: an absolute root, and the target rendered onto
/// it.
struct Destination {
    root: PathBuf,
    target: String,
}

/// One outcome, attributed to the (skill, destination, target) that produced
/// it — [`PublishedFile`] plus [`Attribution`], flattened onto the wire the
/// way `--json` prints it.
#[derive(Serialize)]
struct AttributedFile {
    #[serde(flatten)]
    file: PublishedFile,
    skill: String,
    destination: String,
    target: String,
}

/// A destination the note's targets key excluded, in the flat shape
/// `--json` carries — [`AttributedExclusion`] is nested for
/// [`render_exclusion`], but the wire shape has no `attribution` key of its
/// own.
#[derive(Serialize)]
struct NotPublished {
    skill: String,
    destination: String,
    target: String,
    reason: String,
}

/// A member a pack had no place for, named per destination.
#[derive(Serialize)]
struct NotCarried {
    member: String,
    skill: String,
    destination: String,
    target: String,
}

/// The `--json` document: `not_published`, `not_carried` and `skipped` are
/// omitted entirely when empty, mirroring the core's own
/// `skip_serializing_if` on [`tradecraft_core::PublishReport`].
#[derive(Serialize)]
struct PublishDocument<'a> {
    files: &'a [AttributedFile],
    #[serde(skip_serializing_if = "Option::is_none")]
    not_published: Option<&'a [NotPublished]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    not_carried: Option<&'a [NotCarried]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    skipped: Option<&'a [SkippedNote]>,
}

/// Which closed-set token a thrown [`CoreError`] becomes, by variant.
///
/// A throw means the request failed before a file list existed, so the CLI
/// still owes one refused line with a closed-set token. `from_refusal` reads
/// the token out of the message; this table is the fallback for a message
/// that carries none.
fn thrown_reason(err: &CoreError) -> PublishReason {
    let fallback = match err {
        CoreError::Projection(_) => ReasonToken::NoRenderer,
        CoreError::PathEscapesRoot(_) => ReasonToken::UnsafePath,
        CoreError::RootNotFound(_) => ReasonToken::Io,
        CoreError::SkillNotFound(_) => ReasonToken::Io,
        CoreError::Io { .. } => ReasonToken::Io,
        CoreError::SwapFailed(_) => ReasonToken::Io,
        CoreError::Refused(_) => ReasonToken::Io,
        CoreError::Conflict(_) => ReasonToken::Conflict,
    };
    let message = err.to_string();
    PublishReason::from_refusal(normalize_thrown_reason(&message), fallback)
}

/// One `(skill, destination, target)` line's [`Attribution`], read off a
/// resolved destination — the fields every excluded/uncarried/file line
/// needs.
fn attribution_of(skill: &str, dest: &Destination) -> Attribution {
    Attribution {
        skill: skill.to_string(),
        destination: dest.root.display().to_string(),
        target: dest.target.clone(),
    }
}

/// Run `skillwright publish` and return the exit code.
pub fn run_publish(flags: &PublishFlags, ctx: &mut CommandContext<'_>) -> i32 {
    // Named notes are a NARROWING, so naming none is the whole vault.
    if flags.all && !flags.notes.is_empty() {
        return usage_error(ctx.err, "publish takes note paths or --all, not both");
    }
    let whole_vault = flags.all || flags.notes.is_empty();

    // --- configuration, namespace, vault -------------------------------
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };

    // --- the target ------------------------------------------------------
    // Checked here, against the core's own list, so a name the tool does
    // not know is a usage error at exit 3 with the known names on screen.
    // Reaching the core with it instead would report it as one refused line
    // at exit 1, which says a rail stopped a publish rather than "you typed
    // a name that does not exist".
    if let Some(target) = &flags.target
        && !KNOWN_TARGETS.contains(&target.as_str())
    {
        return usage_error(
            ctx.err,
            &format!(
                "unknown target: {target}\nknown targets: {}",
                KNOWN_TARGETS.join(", ")
            ),
        );
    }

    // --- destinations ----------------------------------------------------
    let destinations: Vec<Destination> = if !flags.to.is_empty() {
        let Some(target) = &flags.target else {
            return usage_error(
                ctx.err,
                "--to requires --target when the destination isn't already registered in the configuration",
            );
        };
        flags
            .to
            .iter()
            .map(|root| Destination {
                root: resolve_against_cwd(root, &ctx.cwd),
                target: target.clone(),
            })
            .collect()
    } else {
        let configured = run
            .config
            .as_ref()
            .map(|c| c.destinations.as_slice())
            .filter(|destinations| !destinations.is_empty());
        let Some(configured) = configured else {
            return usage_error(
                ctx.err,
                "no destinations configured; pass --to and --target, or run `skillwright init`",
            );
        };
        let mut destinations: Vec<Destination> = configured
            .iter()
            .map(|d| Destination {
                root: resolve_configured_path(&d.root, &run.config_dir),
                target: d.target.clone(),
            })
            .collect();
        if let Some(target) = &flags.target {
            let mut configured_targets: Vec<String> =
                destinations.iter().map(|d| d.target.clone()).collect();
            configured_targets.sort();
            configured_targets.dedup();
            // Folded through the core's own alias table, never compared as
            // strings: `--target claude` and a destination configured
            // `claude-code` name one place.
            let wanted = canonical_target(target).unwrap_or(target.as_str());
            destinations
                .retain(|d| canonical_target(&d.target).unwrap_or(d.target.as_str()) == wanted);
            if destinations.is_empty() {
                return usage_error(
                    ctx.err,
                    &format!(
                        "no configured destination for target: {target}\nconfigured targets: {}",
                        configured_targets.join(", ")
                    ),
                );
            }
        }
        destinations
    };

    // --- notes -------------------------------------------------------------
    let mut note_paths: Vec<PathBuf> = Vec::new();
    // Notes the vault scan could not read. Only a whole-vault run has any.
    let mut unreadable: Vec<SkippedNote> = Vec::new();
    if whole_vault {
        let scan = match discover_components(&NativeVfs, &run.vault, None, &run.core_namespace()) {
            Ok(scan) => scan,
            // What discovery still refuses is run-level by construction — a
            // duplicate name, a bundle overlap, a symlink, a missing root.
            // None of them is a fact about one note, so none of them leaves
            // a roster worth publishing half of.
            Err(err) => return blocked(ctx.err, &err.to_string()),
        };
        // The kinds the publish spec calls publishable units. A marketplace
        // note names a distribution and publishes to no destination; an
        // agent or a command publishes on its own and is not swept up by a
        // vault run.
        for component in &scan.components {
            if component.kind == EntityKind::Skill || component.kind == EntityKind::Plugin {
                note_paths.push(component.entry_path.clone());
            }
        }
        for warning in &scan.warnings {
            let _ = writeln!(ctx.err, "{}", render_warning_line(warning));
        }
        unreadable = scan.skipped;
        if note_paths.is_empty() && unreadable.is_empty() {
            return blocked(
                ctx.err,
                &format!(
                    "no publishable unit under {}: no note carries a `description`",
                    run.vault.display()
                ),
            );
        }
    } else {
        for note in &flags.notes {
            let note_path = normalize_join(&run.vault, Path::new(note));
            if !note_path.exists() {
                return blocked(ctx.err, &format!("note not found: {}", note_path.display()));
            }
            note_paths.push(note_path);
        }
    }

    // --- confirmation --------------------------------------------------
    // A dry run is the plan alone — it writes nothing, so there is nothing
    // to confirm. Skipped outright, not auto-answered.
    if !flags.dry_run && !flags.yes {
        // Every unit goes to every destination, so the two lists say what a
        // unit-by-destination cross product would say at a fraction of the
        // length — and each side of the write stays readable as one list.
        let mut plan = vec![
            format!(
                "publish {} unit(s) to {} destination(s)",
                note_paths.len(),
                destinations.len()
            ),
            String::new(),
        ];
        plan.extend(plan_flow(&[
            ("from vault", vec![run.vault.display().to_string()]),
            (
                "  units",
                note_paths
                    .iter()
                    .map(|note_path| relative_path(&run.vault, note_path).display().to_string())
                    .collect(),
            ),
            (
                "into",
                destinations
                    .iter()
                    .map(|dest| format!("{} ({})", dest.root.display(), dest.target))
                    .collect(),
            ),
        ]));
        let gate = confirm_write("publish", &plan, ctx.err);
        if gate != EXIT_OK {
            return gate;
        }
    }

    // --- run ---------------------------------------------------------------
    // The report a dry run prints is, by design, byte-for-byte what a real
    // run would print. This line is the one thing that says so, which is
    // why it is not gated on `--quiet`.
    if flags.dry_run {
        let _ = writeln!(
            ctx.err,
            "dry run — reporting the plan; nothing will be written"
        );
    }

    let namespace = run.core_namespace();
    let mut attributed: Vec<AttributedFile> = Vec::new();
    let mut excluded: Vec<AttributedExclusion> = Vec::new();
    // Members a pack had no place for, named per destination.
    let mut uncarried: Vec<NotCarried> = Vec::new();
    // Every destination-relative path the run projected, across every
    // note-and-destination pair, so an `--overwrite` entry can be judged
    // once against the whole run. Collected only when there is an entry to
    // judge.
    let mut projected: HashSet<String> = HashSet::new();
    // Whether any pair produced a report at all — see the warning below.
    let mut reported = false;

    'outer: for note_path in &note_paths {
        let skill_label = relative_path(&run.vault, note_path).display().to_string();
        for dest in &destinations {
            if ctx.is_interrupted() {
                break 'outer;
            }
            if !flags.quiet {
                let _ = writeln!(
                    ctx.err,
                    "publishing {skill_label} -> {} ({})",
                    dest.root.display(),
                    dest.target
                );
            }
            // The core reads no clock, so a caller that wants its manifest
            // timestamped supplies one. A fresh read per pair, not one
            // hoisted for the whole run — the manifest records when THIS
            // file was published.
            let published_at =
                chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
            let request = PublishRequest {
                skill_path: note_path.clone(),
                destination_root: dest.root.clone(),
                target: dest.target.clone(),
                mode: if flags.dry_run {
                    PublishMode::DryRun
                } else {
                    PublishMode::Write
                },
                // The vault root, so the kind gate has its structural layer
                // and the rail protects the whole vault, not just the
                // note's own folder.
                skills_root: Some(run.vault.clone()),
                published_at: Some(published_at),
                overwrite: flags.overwrite.clone(),
            };
            match publish_skill(&NativeVfs, &request, &namespace) {
                Ok(report) => {
                    reported = true;
                    for file in report.files {
                        if !flags.overwrite.is_empty() {
                            projected.insert(file.path.clone());
                        }
                        attributed.push(AttributedFile {
                            file,
                            skill: skill_label.clone(),
                            destination: dest.root.display().to_string(),
                            target: dest.target.clone(),
                        });
                    }
                    // The note's `sw-targets` excluded this destination. Not
                    // a failure and not an outcome.
                    if let Some(reason) = report.not_published {
                        excluded.push(AttributedExclusion {
                            attribution: attribution_of(&skill_label, dest),
                            reason,
                        });
                    }
                    // Members the pack layout had no place for. Not a
                    // refusal — the pack published — and not an outcome
                    // either.
                    for member in report.not_carried {
                        uncarried.push(NotCarried {
                            member,
                            skill: skill_label.clone(),
                            destination: dest.root.display().to_string(),
                            target: dest.target.clone(),
                        });
                    }
                }
                Err(err) => {
                    // The whole request failed before a file list could be
                    // built. Reported as one refused line for the skill
                    // itself — the honest shape when the core hasn't told
                    // us which files it would have touched.
                    let reason = thrown_reason(&err);
                    // One exception, and only on a whole-vault run: a pack
                    // with no member this destination admits produced
                    // nothing here, which is the fact `not_published`
                    // already reports for a note its own targets excluded.
                    // Asked for by name it is a refusal; swept up by
                    // `--all` it is not, or a vault holding one draft pack
                    // could never finish a run.
                    if whole_vault && reason.token == ReasonToken::EmptyPlugin {
                        excluded.push(AttributedExclusion {
                            attribution: attribution_of(&skill_label, dest),
                            reason: render_reason(&reason),
                        });
                        continue;
                    }
                    // `blocked` is the outcome for a rail that stopped the
                    // whole request: no file was classified, so none of the
                    // per-file outcomes applies.
                    attributed.push(AttributedFile {
                        file: PublishedFile {
                            path: skill_label.clone(),
                            status: PublishStatus::Refused,
                            outcome: PublishOutcome::Blocked,
                            reason: Some(reason),
                        },
                        skill: skill_label.clone(),
                        destination: dest.root.display().to_string(),
                        target: dest.target.clone(),
                    });
                }
            }
        }
    }

    // --- report --------------------------------------------------------
    if flags.json {
        let not_published: Vec<NotPublished> = excluded
            .iter()
            .map(|e| NotPublished {
                skill: e.attribution.skill.clone(),
                destination: e.attribution.destination.clone(),
                target: e.attribution.target.clone(),
                reason: e.reason.clone(),
            })
            .collect();
        let document = PublishDocument {
            files: &attributed,
            not_published: (!not_published.is_empty()).then_some(not_published.as_slice()),
            not_carried: (!uncarried.is_empty()).then_some(uncarried.as_slice()),
            skipped: (!unreadable.is_empty()).then_some(unreadable.as_slice()),
        };
        match serde_json::to_string_pretty(&document) {
            Ok(text) => {
                let _ = writeln!(ctx.out, "{text}");
            }
            Err(err) => return blocked(ctx.err, &format!("the report would not serialize: {err}")),
        }
    } else {
        for file in &attributed {
            let _ = writeln!(ctx.out, "{}", render_file_line(&file.file));
        }
        // On stdout with the outcomes: a note the scan could not read is a
        // refusal, not an exclusion. The vault asked for it and did not get
        // it.
        for note in &unreadable {
            let _ = writeln!(
                ctx.out,
                "{}  refused · {}: {}",
                note.path, note.reason, note.detail
            );
        }
    }

    // Excluded destinations go to stderr, not stdout: the CLI spec gives stdout
    // "the report, and nothing else — one line per outcome", and an
    // excluded destination has no outcome to be a line of. Not gated on
    // `--quiet`.
    for exclusion in &excluded {
        let _ = writeln!(ctx.err, "{}", render_exclusion(exclusion));
    }

    // Members a pack had no place for, on stderr with the exclusions.
    for left in &uncarried {
        let _ = writeln!(
            ctx.err,
            "not carried into {} at {} ({}): {} — a pack declares only `skills/`; publish it on its own",
            left.skill, left.destination, left.target, left.member
        );
    }

    // An acknowledgement the core never consulted, on stderr with the rest
    // of what stdout has no line for. Judged across the whole run, once the
    // fan-out has finished. Silent when nothing was reported — a run where
    // every pair threw projected no paths at all.
    if reported {
        for path in &flags.overwrite {
            if !projected.contains(path) {
                let _ = writeln!(ctx.err, "{}", render_unmatched_overwrite(path));
            }
        }
    }

    let files_only: Vec<PublishedFile> = attributed.iter().map(|a| a.file.clone()).collect();

    if !flags.quiet {
        let suffix = if flags.dry_run { " (dry run)" } else { "" };
        let skipped = if unreadable.is_empty() {
            String::new()
        } else {
            format!(", {} skipped", unreadable.len())
        };
        let _ = writeln!(
            ctx.err,
            "{}{skipped}{suffix}",
            render_tally(&files_only, excluded.len())
        );
    }

    if ctx.is_interrupted() {
        return EXIT_INTERRUPTED;
    }
    // An excluded destination does not move the exit code, including when
    // every destination excluded the note and the report is therefore
    // empty. A note the scan could not read moves it the same way a
    // refused file does.
    if has_refusal(&files_only) || !unreadable.is_empty() {
        EXIT_REFUSED
    } else {
        EXIT_OK
    }
}

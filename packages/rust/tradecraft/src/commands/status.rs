//! `tradecraft status` — each unit's publish state at each configured
//! destination.
//!
//! This file decides no state. [`status_of`] runs the core's own
//! classification in dry-run over a capturing overlay, so the answer printed
//! here is the report the publish that follows would produce. What is left
//! for this file is which units to ask about, which destinations to ask at,
//! and what a row means for the exit code.
//!
//! # A refusal the core raises is `unknown`, not an error
//!
//! A whole request the core fails on — a target with no renderer for this
//! unit's kind, an unreadable note — is a state this run could not
//! determine, and `unknown` is the word the status spec give that. Letting it
//! end the run would mean one unrenderable note hides the state of every
//! other destination.
//!
//! # A kind no destination installs is `n/a`, not `unknown`
//!
//! `unknown` says "this run could not determine the state", which invites
//! the reader to publish and look again. For a marketplace note or a hook
//! there is nothing to look again at: the core's kind gate refuses them at
//! every target, forever, so the row could never read anything else and
//! `status --check` could never pass on a vault holding one.
//!
//! So a whole-vault run asks the core only about the kinds it publishes —
//! [`kind_has_renderer`], the core's own gate, not a list kept here — and
//! reports every other kind as [`crate::report::NOT_APPLICABLE`]: one row per
//! destination, naming the kind, counted in the tally and excluded from
//! `--check`'s verdict.
//!
//! A note named on the command line is asked about as given. The caller
//! pointed at that note, and the core's own reason for refusing it is the
//! answer they came for.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tradecraft_core::publish::kind_has_renderer;
use tradecraft_core::status::{PublishState, StatusRequest, VersionBumpSuggestion, status_of};
use tradecraft_core::{NativeVfs, PublishStatus, SkippedNote, discover_components};

use crate::config::{normalize_join, relative_path, resolve_configured_path};
use crate::ctx::CommandContext;
use crate::exit::{EXIT_INTERRUPTED, EXIT_OK, EXIT_REFUSED, blocked, usage_error};
use crate::report::{
    AttributedState, Attribution, RowState, has_drift, normalize_thrown_reason, render_state_line,
    render_state_tally,
};
use crate::resolve::{CommonFlags, resolve_run, resolve_skills_root};

/// The resolved flags of `tradecraft status`.
pub struct StatusFlags {
    /// One note to report on. Absent means every publishable unit the scan
    /// finds.
    pub note: Option<String>,
    /// Exit non-zero when anything is stale, conflicted, or unknown.
    pub check: bool,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

/// The `--json` document: the human table's rows, plus the notes the scan
/// could not read when a whole-vault run had any.
#[derive(Serialize)]
struct StatusDocument<'a> {
    rows: &'a [AttributedState],
    /// Omitted entirely when there is none.
    #[serde(skip_serializing_if = "Option::is_none")]
    skipped: Option<&'a [SkippedNote]>,
}

/// Run `tradecraft status` and return the exit code.
pub fn run_status(flags: &StatusFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let namespace = run.core_namespace();

    let Some(configured) = run
        .config
        .as_ref()
        .map(|c| c.destinations.as_slice())
        .filter(|destinations| !destinations.is_empty())
    else {
        return usage_error(
            ctx.err,
            "no destinations configured; there is nothing to report a state against",
        );
    };
    let destinations: Vec<(PathBuf, String)> = configured
        .iter()
        .map(|d| {
            (
                resolve_configured_path(&d.root, &run.config_dir),
                d.target.clone(),
            )
        })
        .collect();

    let skills_root = resolve_skills_root(None, &run, &ctx.cwd);

    // --- the units ----------------------------------------------------------
    // A named note is taken as given; without one the vault scan supplies the
    // roster, which is the same scan `build` renders from — so `status` with
    // no argument covers exactly what a build would publish.
    let mut note_paths: Vec<PathBuf> = Vec::new();
    // Notes the scan could not read. Only a whole-vault run has any.
    let mut unreadable: Vec<SkippedNote> = Vec::new();
    // Notes whose kind no destination installs, by vault-relative path and
    // kind. Rows, but not questions for the core.
    let mut unpublishable: Vec<(String, String)> = Vec::new();
    match &flags.note {
        Some(note) => {
            let note_path = normalize_join(&run.vault, Path::new(note));
            if !note_path.exists() {
                return blocked(ctx.err, &format!("note not found: {}", note_path.display()));
            }
            note_paths.push(note_path);
        }
        None => {
            match discover_components(&NativeVfs, &run.vault, skills_root.as_deref(), &namespace) {
                Ok(scan) => {
                    for component in &scan.components {
                        if kind_has_renderer(component.kind) {
                            note_paths.push(component.entry_path.clone());
                        } else {
                            unpublishable.push((
                                component.vault_relative_path.clone(),
                                component.kind.as_str().to_string(),
                            ));
                        }
                    }
                    unreadable = scan.skipped;
                }
                // What discovery still fails on is run-level by construction — a
                // duplicate name, a bundle overlap, a symlink, a missing root. A
                // note it cannot read is not one of these; it comes back in
                // `skipped` instead, and stops only itself.
                Err(err) => {
                    let message = err.to_string();
                    return blocked(
                        ctx.err,
                        &format!(
                            "the vault scan could not complete: {}",
                            normalize_thrown_reason(&message)
                        ),
                    );
                }
            }
        }
    }

    // --- the rows -----------------------------------------------------------
    let mut rows: Vec<AttributedState> = Vec::new();
    // A plugin whose members drifted with its own `ap-version` unmoved since,
    // one entry per (skill, destination) row that carries the suggestion —
    // printed after the report as a stderr advisory, never folded into
    // `AttributedState` itself, which `--json` serializes and must not grow a
    // field for this.
    let mut suggestions: Vec<(String, VersionBumpSuggestion)> = Vec::new();
    'outer: for note_path in &note_paths {
        for (root, target) in &destinations {
            if ctx.is_interrupted() {
                break 'outer;
            }
            let skill = relative_path(&run.vault, note_path).display().to_string();
            let attribution = Attribution {
                skill,
                destination: root.display().to_string(),
                target: target.clone(),
            };
            let request = StatusRequest {
                skill_path: note_path.clone(),
                destination_root: root.clone(),
                target: target.clone(),
                // The vault root, so the kind gate has its structural layer: a
                // note in `agents/` declaring no kind is not a skill, and
                // reporting on it as one would state a skill's status for
                // something that is not one.
                skills_root: Some(run.vault.clone()),
            };
            match status_of(&NativeVfs, &request, &namespace) {
                Ok(status) => {
                    if let Some(suggestion) = &status.version_bump_suggestion {
                        suggestions.push((attribution.skill.clone(), suggestion.clone()));
                    }
                    rows.push(AttributedState {
                        attribution,
                        // An excluded destination is the absence of a state, not a
                        // sixth one.
                        state: match status.not_published {
                            Some(_) => None,
                            None => Some(RowState::State(status.state)),
                        },
                        reason: status.reason,
                        published_at: status.published_at,
                        // A conflict has to name the file, not just the state: the
                        // path is what `publish --overwrite` takes.
                        files: if status.state == PublishState::Conflict {
                            status
                                .files
                                .iter()
                                .filter(|f| f.status == PublishStatus::Refused)
                                .map(|f| f.path.clone())
                                .collect()
                        } else {
                            Vec::new()
                        },
                    })
                }
                Err(err) => {
                    let message = err.to_string();
                    rows.push(AttributedState {
                        attribution,
                        state: Some(RowState::State(PublishState::Unknown)),
                        reason: Some(normalize_thrown_reason(&message).to_string()),
                        published_at: None,
                        files: Vec::new(),
                    });
                }
            }
        }
    }

    // Named after the rows the core answered, so the table reads publishable
    // units first and the notes nobody publishes at the end.
    for (path, kind) in &unpublishable {
        for (root, target) in &destinations {
            rows.push(AttributedState {
                attribution: Attribution {
                    skill: path.clone(),
                    destination: root.display().to_string(),
                    target: target.clone(),
                },
                state: Some(RowState::NotApplicable),
                reason: Some(format!("a {kind} is not published to a destination")),
                published_at: None,
                files: Vec::new(),
            });
        }
    }

    // --- the report ---------------------------------------------------------
    // The same tokens either way. `--json` is the human table's rows as one
    // document, not a second vocabulary for them.
    if flags.json {
        let document = StatusDocument {
            rows: &rows,
            skipped: if unreadable.is_empty() {
                None
            } else {
                Some(&unreadable)
            },
        };
        match serde_json::to_string_pretty(&document) {
            Ok(text) => {
                let _ = writeln!(ctx.out, "{text}");
            }
            Err(err) => return blocked(ctx.err, &format!("the report would not serialize: {err}")),
        }
    } else {
        for row in &rows {
            let _ = writeln!(ctx.out, "{}", render_state_line(row));
        }
    }
    // A note the scan could not read is a state this run could not determine
    // either — the same fact `unknown` names for a row, said for a note that
    // never became one.
    for note in &unreadable {
        let _ = writeln!(
            ctx.err,
            "{}  unknown · {}: {}",
            note.path, note.reason, note.detail
        );
    }
    if !flags.quiet {
        let skipped = if unreadable.is_empty() {
            String::new()
        } else {
            format!(", {} skipped", unreadable.len())
        };
        let _ = writeln!(ctx.err, "{}{skipped}", render_state_tally(&rows));
    }

    // Stderr, never stdout: this fact isn't modeled in `AttributedState` or
    // `StatusDocument` at all, and adding it would change `status --json`'s
    // shape — out of scope for this phase.
    if !flags.json {
        for (skill, suggestion) in &suggestions {
            let plugin = Path::new(skill)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(skill.as_str());
            let _ = writeln!(
                ctx.err,
                "advisory: {skill} ap-version {} unmoved since members changed — `tradecraft bump {plugin}` is available",
                suggestion.current_version
            );
        }
    }

    if ctx.is_interrupted() {
        return EXIT_INTERRUPTED;
    }
    // Without `--check` a status is a report, and reporting drift is what it
    // was asked to do — exit 0. `--check` is the CI half: the same rows, and
    // 1 when any of them is stale, conflicted, or unknown — a note the scan
    // could not read is exactly that, for a unit that never became a row.
    if flags.check && (has_drift(&rows) || !unreadable.is_empty()) {
        return EXIT_REFUSED;
    }
    EXIT_OK
}

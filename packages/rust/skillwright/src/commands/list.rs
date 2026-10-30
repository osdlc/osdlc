//! `skillwright list` — the roster, and nothing else.
//!
//! The one read-only verb. It walks the vault's content root through the
//! core's [`discover_components`] and prints what it found: one row per
//! publishable note, with the note's own answer to "where does this
//! publish". It writes nothing, prompts about nothing, and never touches a
//! destination.
//!
//! What it deliberately does not report is each row's state at each
//! destination — never published, current, stale, conflicted. That needs the
//! manifest, and it is `status`'s job (the status spec).
//!
//! A note the scan could not read does not hide the rest of the roster: it
//! is named on the error sink, one line per note.

use tradecraft_core::{NativeVfs, discover_components};

use crate::ctx::CommandContext;
use crate::exit::{EXIT_OK, blocked};
use crate::report::{render_roster, render_roster_tally, render_warning_line, roster_row};
use crate::resolve::{CommonFlags, resolve_run, resolve_skills_root};

/// The resolved flags of `skillwright list`.
pub struct ListFlags {
    /// The content root to scan. Overrides the configured one.
    pub skills_root: Option<String>,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

/// Run `skillwright list` and return the exit code.
pub fn run_list(flags: &ListFlags, ctx: &mut CommandContext<'_>) -> i32 {
    // The same three questions, answered the same way, as every other verb —
    // so `--vault` and `--namespace` behave here exactly as they do on
    // `build`, including their exit codes: 4 with no configuration and no
    // `--vault`, 2 for a vault that is not there.
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let skills_root = resolve_skills_root(flags.skills_root.as_deref(), &run, &ctx.cwd);

    let scan = match discover_components(
        &NativeVfs,
        &run.vault,
        skills_root.as_deref(),
        &run.core_namespace(),
    ) {
        Ok(scan) => scan,
        // What still fails is run-level by construction — a duplicate name, a
        // bundle overlap, a symlink, a missing root — so this stays a blocker
        // rather than a refused row. A note the scan could not read is not
        // one of these; it comes back in `skipped` instead.
        Err(err) => {
            return blocked(ctx.err, &format!("the vault scan could not run: {err}"));
        }
    };

    if flags.json {
        let rows: Vec<_> = scan.components.iter().map(roster_row).collect();
        match serde_json::to_string_pretty(&rows) {
            Ok(document) => {
                let _ = writeln!(ctx.out, "{document}");
            }
            Err(err) => return blocked(ctx.err, &format!("the report would not serialize: {err}")),
        }
    } else {
        for line in render_roster(&scan.components) {
            let _ = writeln!(ctx.out, "{line}");
        }
    }
    for note in &scan.skipped {
        let _ = writeln!(
            ctx.err,
            "{}  skipped · {}: {}",
            note.path, note.reason, note.detail
        );
    }
    for warning in &scan.warnings {
        let _ = writeln!(ctx.err, "{}", render_warning_line(warning));
    }
    if !flags.quiet {
        let skipped = if scan.skipped.is_empty() {
            String::new()
        } else {
            format!(", {} skipped", scan.skipped.len())
        };
        let _ = writeln!(
            ctx.err,
            "{}{skipped}",
            render_roster_tally(&scan.components)
        );
    }

    EXIT_OK
}

//! The confirmation gate the CLI spec requires of any writing command: "On a TTY
//! it prints the plan and waits. The default answer is no. Off a TTY, a
//! writing command without `--yes` is a usage error rather than a silent
//! write."
//!
//! Prompts are progress, not report — they go to the error sink, never
//! stdout.

use std::io::{BufRead, IsTerminal, Write};

use crate::exit::{EXIT_BLOCKED, EXIT_OK, usage_error};

/// True when both stdin and stdout are a real terminal.
pub fn is_interactive() -> bool {
    std::io::stdin().is_terminal() && std::io::stdout().is_terminal()
}

/// The labelled block a writing verb's plan is built around: one row per
/// side of the write, its values on their own lines under an aligned label.
///
/// Every writing verb reads one place and writes another, and a single
/// sentence carrying both makes the person pick which is which out of the
/// middle of a paragraph. A row's first value sits on the label's line and
/// the rest align beneath it, so a list of sources reads as one side of the
/// flow rather than as loose indented text.
///
/// Labels carry their own preposition (`"from vault"`, `"into
/// marketplace"`) — this function only aligns them.
pub fn plan_flow(rows: &[(&str, Vec<String>)]) -> Vec<String> {
    let width = rows
        .iter()
        .filter(|(_, values)| !values.is_empty())
        .map(|(label, _)| label.chars().count())
        .max()
        .unwrap_or(0);
    let mut lines = Vec::new();
    for (label, values) in rows {
        for (index, value) in values.iter().enumerate() {
            let label = if index == 0 { *label } else { "" };
            let pad = " ".repeat(width - label.chars().count());
            lines.push(format!("  {label}{pad}  {value}"));
        }
    }
    lines
}

/// `question [y/N] `, defaulting to no. Writes the question to `err` and
/// reads the answer from stdin.
pub fn confirm(question: &str, err: &mut dyn Write) -> bool {
    let _ = write!(err, "{question} [y/N] ");
    let _ = err.flush();
    let mut answer = String::new();
    if std::io::stdin().lock().read_line(&mut answer).is_err() {
        return false;
    }
    let answer = answer.trim().to_ascii_lowercase();
    answer == "y" || answer == "yes"
}

/// The whole gate, for a verb that is about to write: print the plan, ask,
/// and turn "no" or "not a terminal" into the exit code the CLI spec gives each.
///
/// [`EXIT_OK`] here means *proceed* — the caller returns anything else
/// immediately. Said once because every writing verb owes the identical
/// promise, down to the wording of the off-a-TTY refusal.
///
/// A verb that writes nothing must not call this at all: it has no plan to
/// confirm, and answering on the caller's behalf is not the same as never
/// asking.
pub fn confirm_write(verb: &str, plan: &[String], err: &mut dyn Write) -> i32 {
    if !is_interactive() {
        return usage_error(
            err,
            &format!("{verb} writes files; pass --yes when not running interactively"),
        );
    }
    for line in plan {
        let _ = writeln!(err, "{line}");
    }
    // Nothing attempted, at the user's own request — not a failure.
    if confirm("Proceed?", err) {
        EXIT_OK
    } else {
        EXIT_BLOCKED
    }
}

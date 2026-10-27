//! Exit codes.
//!
//! | Code | Means |
//! |---|---|
//! | 0 | The run completed and every outcome was written/unchanged/adopted/updated |
//! | 1 | The run completed and something was refused: a file, a skill, a whole source a rail stopped — or, for `check`, a drifted root |
//! | 2 | A run-level blocker. Nothing was attempted |
//! | 3 | Usage error |
//! | 4 | No configuration, and none supplied |
//! | 130 | Interrupted |
//!
//! The four helpers below each write their message to the caller's error
//! sink — never stdout — and return the matching code, so a command's
//! `return blocked(err, ...)` is both the message and the exit in one
//! expression.

use std::io::Write;

/// The run completed and nothing was refused.
pub const EXIT_OK: i32 = 0;
/// The run completed and something was refused, or `check` found drift.
pub const EXIT_REFUSED: i32 = 1;
/// A run-level blocker: nothing was attempted.
pub const EXIT_BLOCKED: i32 = 2;
/// Usage error.
pub const EXIT_USAGE: i32 = 3;
/// No configuration, and none supplied.
pub const EXIT_NO_CONFIG: i32 = 4;
/// The run was interrupted.
pub const EXIT_INTERRUPTED: i32 = 130;

/// A run-level blocker: nothing was attempted, the report is empty.
pub fn blocked(err: &mut dyn Write, message: &str) -> i32 {
    let _ = writeln!(err, "{message}");
    EXIT_BLOCKED
}

/// An unknown flag, a missing argument, an unknown target or destination.
pub fn usage_error(err: &mut dyn Write, message: &str) -> i32 {
    let _ = writeln!(err, "usage error: {message}");
    EXIT_USAGE
}

/// No configuration found, and none supplied on the command line.
pub fn no_config(err: &mut dyn Write, message: &str) -> i32 {
    let _ = writeln!(err, "{message}");
    EXIT_NO_CONFIG
}

/// A verb (or a flag on a verb) whose capability the core doesn't carry yet.
/// Exits 2 — a run-level blocker — never a silent no-op and never a
/// fabricated report.
pub fn not_implemented(err: &mut dyn Write, what: &str, waits_on: &str) -> i32 {
    let _ = writeln!(err, "not implemented: {what}\n{waits_on}");
    EXIT_BLOCKED
}

#[cfg(test)]
mod tests {
    use super::*;

    fn written(f: impl FnOnce(&mut dyn Write) -> i32) -> (i32, String) {
        let mut buf: Vec<u8> = Vec::new();
        let code = f(&mut buf);
        (code, String::from_utf8(buf).unwrap())
    }

    #[test]
    fn blocked_writes_the_message_and_returns_2() {
        let (code, out) = written(|w| blocked(w, "nothing to do"));
        assert_eq!(code, EXIT_BLOCKED);
        assert_eq!(out, "nothing to do\n");
    }

    #[test]
    fn usage_error_prefixes_and_returns_3() {
        let (code, out) = written(|w| usage_error(w, "unknown flag --bogus"));
        assert_eq!(code, EXIT_USAGE);
        assert_eq!(out, "usage error: unknown flag --bogus\n");
    }

    #[test]
    fn no_config_writes_the_message_and_returns_4() {
        let (code, out) = written(|w| no_config(w, "no vault"));
        assert_eq!(code, EXIT_NO_CONFIG);
        assert_eq!(out, "no vault\n");
    }

    #[test]
    fn not_implemented_writes_both_lines_and_returns_2() {
        let (code, out) = written(|w| not_implemented(w, "adopt --dry-run", "waits on D-1"));
        assert_eq!(code, EXIT_BLOCKED);
        assert_eq!(out, "not implemented: adopt --dry-run\nwaits on D-1\n");
    }
}

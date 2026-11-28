//! Classifying a failed run into a kind a caller can branch on.

use std::ffi::{OsStr, OsString};

use crate::result::{
    CommandResult, FailureText, Outcome, SpawnProblem, StopReason, first_line, signal_name,
};

/// The kinds of failure a run can have.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CommandFailureKind {
    /// The binary is not installed or not on `PATH`.
    NotInstalled,
    /// The binary exists but cannot be run.
    NotExecutable,
    /// The working directory is missing or is not a directory.
    BadCwd,
    /// The runner killed the child at its timeout.
    Timeout,
    /// The child wrote more output than allowed.
    OutputCap,
    /// A signal ended the child.
    Signal,
    /// The run was stopped before it finished.
    Aborted,
    /// The child could not be started for another reason, or waiting on it
    /// failed and the runner killed it.
    Spawn,
    /// The child exited non-zero.
    Exit,
    /// The child exited with an accepted code, but [`CommandResult::output_incomplete`] is set.
    OutputIncomplete,
}

impl CommandFailureKind {
    /// The stable kebab-case name, such as `not-installed`, to print or log.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::NotInstalled => "not-installed",
            Self::NotExecutable => "not-executable",
            Self::BadCwd => "bad-cwd",
            Self::Timeout => "timeout",
            Self::OutputCap => "output-cap",
            Self::Signal => "signal",
            Self::Aborted => "aborted",
            Self::Spawn => "spawn",
            Self::Exit => "exit",
            Self::OutputIncomplete => "output-incomplete",
        }
    }
}

/// A classified failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandFailure {
    /// What went wrong.
    pub kind: CommandFailureKind,
    /// A one-line, human-readable summary.
    pub message: String,
    /// More text, such as stderr and stdout or the OS error.
    pub detail: Option<String>,
    /// The binary the runner was bound to, when it was bound to one.
    pub binary: Option<OsString>,
    /// The arguments of the run.
    pub args: Vec<OsString>,
    /// The exit code, or `None` when the child never exited.
    pub exit_code: Option<i32>,
    /// The signal that ended the child, when one did.
    pub signal: Option<i32>,
}

/// Context for [`classify_failure`] and [`build_failure`].
#[derive(Debug, Clone, Default)]
pub struct ClassifyContext<'a> {
    /// The binary, used in messages. `None` reads "The command".
    pub binary: Option<&'a OsStr>,
    /// The arguments, copied into the failure.
    pub args: &'a [OsString],
    /// Exit codes that count as success. Empty means just `0`.
    pub ok_exit_codes: &'a [i32],
}

impl ClassifyContext<'_> {
    fn accepts(&self, code: i32) -> bool {
        if self.ok_exit_codes.is_empty() {
            code == 0
        } else {
            self.ok_exit_codes.contains(&code)
        }
    }
}

/// Classifies `result`: `None` when it exited with an accepted code and its
/// output is whole, else the failure, as [`crate::run_failed`] reads it.
pub fn classify_failure(
    result: &CommandResult,
    context: &ClassifyContext<'_>,
) -> Option<CommandFailure> {
    if let Outcome::Exited(code) = result.outcome
        && context.accepts(code)
        && !result.output_incomplete
    {
        return None;
    }
    Some(build_failure(result, context))
}

/// Builds the failure for `result` without asking whether it failed.
pub fn build_failure(result: &CommandResult, context: &ClassifyContext<'_>) -> CommandFailure {
    let subject = match context.binary {
        Some(b) => format!("`{}`", b.to_string_lossy()),
        None => "The command".to_string(),
    };
    let exit_code = result.exit_code();
    let (signal, error) = match result.stop() {
        Some(stop) => (stop.signal, stop.error.clone().filter(|e| !e.is_empty())),
        None => (None, None),
    };
    let make = |kind, message: String, detail: Option<String>| CommandFailure {
        kind,
        message,
        detail,
        binary: context.binary.map(OsStr::to_os_string),
        args: context.args.to_vec(),
        exit_code,
        signal,
    };

    let stop = match &result.outcome {
        Outcome::Stopped(stop) => stop,
        Outcome::Exited(code) => {
            let text = FailureText::of(result);
            let detail = text.both();
            // A code that is not accepted is the failure to report, cut short
            // or not: the code is the child's own, only the output is in doubt.
            let (kind, message) = if result.output_incomplete && context.accepts(*code) {
                (
                    CommandFailureKind::OutputIncomplete,
                    format!("{subject} exited {code}, but its output was cut short."),
                )
            } else {
                let message = match text.preferred() {
                    // Trimmed and non-empty, so the fallback is never read.
                    Some(text) => first_line(text, "").to_string(),
                    None => format!("exit {code}"),
                };
                (CommandFailureKind::Exit, message)
            };
            return make(kind, message, (!detail.is_empty()).then_some(detail));
        }
    };

    match stop.reason {
        StopReason::Spawn(problem) => {
            let (kind, message) = match problem {
                SpawnProblem::BadCwd => (
                    CommandFailureKind::BadCwd,
                    "The working directory is missing or is not a directory.".to_string(),
                ),
                SpawnProblem::NotFound => (
                    CommandFailureKind::NotInstalled,
                    format!("{subject} is not installed or not on PATH."),
                ),
                SpawnProblem::NotExecutable => (
                    CommandFailureKind::NotExecutable,
                    format!("{subject} cannot be run: permission denied or not an executable."),
                ),
                SpawnProblem::Other if stop.wait_failed() => (
                    CommandFailureKind::Spawn,
                    format!("{subject} was stopped: waiting on it failed."),
                ),
                SpawnProblem::Other => (
                    CommandFailureKind::Spawn,
                    format!("{subject} could not be started."),
                ),
            };
            make(kind, message, error)
        }
        StopReason::Timeout => make(
            CommandFailureKind::Timeout,
            format!("{subject} timed out and was stopped."),
            error,
        ),
        StopReason::Output => make(
            CommandFailureKind::OutputCap,
            format!("{subject} wrote more output than allowed and was stopped."),
            error,
        ),
        StopReason::Abort => make(
            CommandFailureKind::Aborted,
            format!("{subject} was stopped before it finished."),
            error,
        ),
        StopReason::Signal => {
            let message = match stop.signal {
                Some(n) => match signal_name(n) {
                    Some(name) => format!("{subject} was ended by {name}."),
                    None => format!("{subject} was ended by signal {n}."),
                },
                None => format!("{subject} was ended by a signal."),
            };
            make(CommandFailureKind::Signal, message, error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx<'a>(binary: Option<&'a str>, args: &'a [OsString]) -> ClassifyContext<'a> {
        ClassifyContext {
            binary: binary.map(OsStr::new),
            args,
            ok_exit_codes: &[],
        }
    }

    fn spawn(problem: SpawnProblem, error: &str) -> CommandResult {
        CommandResult::stopped(StopReason::Spawn(problem))
            .stop_details(None, Some(error.to_string()))
    }

    #[test]
    fn a_missing_binary_is_not_installed() {
        let f = classify_failure(
            &spawn(SpawnProblem::NotFound, "No such file"),
            &ctx(Some("gh"), &[]),
        )
        .unwrap();
        assert_eq!(f.kind, CommandFailureKind::NotInstalled);
        assert_eq!(f.message, "`gh` is not installed or not on PATH.");
        assert_eq!(f.detail.as_deref(), Some("No such file"));
        assert_eq!(f.exit_code, None);
    }

    #[test]
    fn a_missing_cwd_is_bad_cwd_not_not_installed() {
        let f =
            classify_failure(&spawn(SpawnProblem::BadCwd, "gone"), &ctx(Some("gh"), &[])).unwrap();
        assert_eq!(f.kind, CommandFailureKind::BadCwd);
    }

    #[test]
    fn a_failed_wait_does_not_say_the_child_never_started() {
        // As the runner records it: the child ran, so it was sent a signal.
        let r = CommandResult::stopped(StopReason::Spawn(SpawnProblem::Other))
            .stop_details(Some(9), Some("wait: Interrupted".to_string()));
        let f = classify_failure(&r, &ctx(Some("gh"), &[])).unwrap();
        assert_eq!(f.kind, CommandFailureKind::Spawn);
        assert_eq!(f.message, "`gh` was stopped: waiting on it failed.");
        assert_eq!(f.detail.as_deref(), Some("wait: Interrupted"));
        assert_eq!(f.signal, Some(9));

        let f = classify_failure(&r, &ctx(None, &[])).unwrap();
        assert_eq!(f.message, "The command was stopped: waiting on it failed.");

        let f = classify_failure(&spawn(SpawnProblem::Other, "e"), &ctx(Some("gh"), &[])).unwrap();
        assert_eq!(f.message, "`gh` could not be started.");
    }

    #[test]
    fn a_timeout_is_timeout() {
        let r = CommandResult::stopped(StopReason::Timeout).stop_details(Some(9), None);
        let f = classify_failure(&r, &ctx(Some("sleep"), &[])).unwrap();
        assert_eq!(f.kind, CommandFailureKind::Timeout);
        assert_eq!(f.message, "`sleep` timed out and was stopped.");
        assert_eq!(f.signal, Some(9));
    }

    #[test]
    fn output_abort_and_signal_kinds() {
        let kind = |reason| {
            classify_failure(&CommandResult::stopped(reason), &ctx(None, &[]))
                .unwrap()
                .kind
        };
        assert_eq!(kind(StopReason::Output), CommandFailureKind::OutputCap);
        assert_eq!(kind(StopReason::Abort), CommandFailureKind::Aborted);
        assert_eq!(kind(StopReason::Signal), CommandFailureKind::Signal);
        assert_eq!(
            kind(StopReason::Spawn(SpawnProblem::NotExecutable)),
            CommandFailureKind::NotExecutable
        );
        assert_eq!(
            kind(StopReason::Spawn(SpawnProblem::Other)),
            CommandFailureKind::Spawn
        );
    }

    #[test]
    fn a_signal_without_a_name_still_classifies() {
        let r = CommandResult::stopped(StopReason::Signal).stop_details(Some(77), None);
        let f = classify_failure(&r, &ctx(None, &[])).unwrap();
        assert_eq!(f.message, "The command was ended by signal 77.");
        let r = CommandResult::stopped(StopReason::Signal).stop_details(Some(15), None);
        let f = classify_failure(&r, &ctx(Some("x"), &[])).unwrap();
        assert_eq!(f.message, "`x` was ended by SIGTERM.");
    }

    #[test]
    fn a_non_zero_exit_is_exit_with_first_line_and_both_streams() {
        let r = CommandResult::exited(128)
            .stderr("\nfatal: broken\nhint\n")
            .stdout("partial\n");
        let args = [OsString::from("status")];
        let f = classify_failure(&r, &ctx(Some("git"), &args)).unwrap();
        assert_eq!(f.kind, CommandFailureKind::Exit);
        assert_eq!(f.message, "fatal: broken");
        assert_eq!(f.detail.as_deref(), Some("fatal: broken\nhint\npartial"));
        assert_eq!(f.exit_code, Some(128));
        assert_eq!(f.args, args);
    }

    #[test]
    fn an_exit_with_no_output_says_the_exit_code() {
        let f = classify_failure(&CommandResult::exited(2), &ctx(None, &[])).unwrap();
        assert_eq!(f.message, "exit 2");
        assert_eq!(f.detail, None);
    }

    #[test]
    fn success_is_none_and_ok_exit_codes_decide_what_success_is() {
        assert!(classify_failure(&CommandResult::exited(0), &ctx(None, &[])).is_none());
        let c = ClassifyContext {
            ok_exit_codes: &[0, 1],
            ..ClassifyContext::default()
        };
        assert!(classify_failure(&CommandResult::exited(1), &c).is_none());
        assert!(classify_failure(&CommandResult::exited(2), &c).is_some());
    }

    #[test]
    fn an_accepted_exit_with_output_cut_short_is_output_incomplete() {
        let cut = |code| CommandResult::exited(code).stdout("half\n").cut_short();
        let f = classify_failure(&cut(0), &ctx(Some("gh"), &[])).unwrap();
        assert_eq!(f.kind, CommandFailureKind::OutputIncomplete);
        assert_eq!(f.message, "`gh` exited 0, but its output was cut short.");
        assert_eq!(f.detail.as_deref(), Some("half"));
        assert_eq!(f.exit_code, Some(0));

        let c = ClassifyContext {
            ok_exit_codes: &[0, 1],
            ..ClassifyContext::default()
        };
        let kind = |code| classify_failure(&cut(code), &c).unwrap().kind;
        assert_eq!(kind(1), CommandFailureKind::OutputIncomplete);
        // A code that is not accepted is still the failure to report.
        assert_eq!(kind(2), CommandFailureKind::Exit);
    }

    #[test]
    fn a_run_that_never_exited_fails_whatever_codes_are_accepted() {
        let c = ClassifyContext {
            ok_exit_codes: &[0, 1],
            ..ClassifyContext::default()
        };
        let r = CommandResult::stopped(StopReason::Timeout);
        assert!(classify_failure(&r, &c).is_some());
    }

    #[test]
    fn every_kind_has_a_kebab_case_name() {
        use CommandFailureKind as K;
        let names = [
            (K::NotInstalled, "not-installed"),
            (K::NotExecutable, "not-executable"),
            (K::BadCwd, "bad-cwd"),
            (K::Timeout, "timeout"),
            (K::OutputCap, "output-cap"),
            (K::Signal, "signal"),
            (K::Aborted, "aborted"),
            (K::Spawn, "spawn"),
            (K::Exit, "exit"),
            (K::OutputIncomplete, "output-incomplete"),
        ];
        for (kind, name) in names {
            assert_eq!(kind.as_str(), name);
        }
        let distinct: std::collections::HashSet<_> = names.iter().map(|(_, n)| n).collect();
        assert_eq!(distinct.len(), names.len());
    }

    #[test]
    fn the_unknown_binary_reads_the_command() {
        let f = classify_failure(&spawn(SpawnProblem::NotFound, ""), &ctx(None, &[])).unwrap();
        assert_eq!(f.message, "The command is not installed or not on PATH.");
        assert_eq!(f.detail, None);
    }
}

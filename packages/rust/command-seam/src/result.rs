//! What a run produced, and helpers that read it.
//!
//! None of the helpers fail for a failed command: a failure stays a value the
//! caller reads. [`crate::run_checked`] is the form that stops on failure.

use std::borrow::Cow;
use std::time::Duration;

/// Why a spawn did not produce a child, as far as `std` can tell.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpawnProblem {
    /// The binary was not found.
    NotFound,
    /// The binary exists but cannot be executed (permission denied, not an
    /// executable).
    NotExecutable,
    /// The working directory is missing or is not a directory.
    BadCwd,
    /// Any other spawn error, or a failed wait on a started child.
    /// [`Stop::wait_failed`] tells the two apart.
    Other,
}

/// Why a run ended without an exit status it reports.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    /// The child never started, or waiting on it failed and the runner killed
    /// it.
    Spawn(SpawnProblem),
    /// The timeout passed and the runner killed the child.
    Timeout,
    /// Something stopped the run on purpose. [`crate::SpawnRunner`] reports it
    /// for [`crate::ProcessGroups::stop_all`], including a run that never
    /// started and one whose leader had exited while a pipe was still held.
    Abort,
    /// A signal not sent by the runner ended the child.
    Signal,
    /// The child wrote more than `max_output_bytes` to a stream, and was
    /// killed if it was still running.
    Output,
}

/// A run that ended without an exit code it reports.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stop {
    /// Why the run ended.
    pub reason: StopReason,
    /// The signal that ended the child, as a number, when there was one. For a
    /// run the runner stopped, the last signal it sent.
    pub signal: Option<i32>,
    /// A human-readable explanation, such as the OS error of a failed spawn.
    pub error: Option<String>,
}

impl Stop {
    /// Whether waiting on a started child failed, as opposed to its spawn: the
    /// runner sets [`Stop::signal`] (the kill it sent) on a
    /// [`SpawnProblem::Other`] stop only then.
    pub fn wait_failed(&self) -> bool {
        self.reason == StopReason::Spawn(SpawnProblem::Other) && self.signal.is_some()
    }
}

/// How a run ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// The child exited with this code (any code, including non-zero).
    Exited(i32),
    /// The child produced no exit code (it never started, or a signal ended
    /// it), or the runner stopped the run. An exit code the child produced
    /// before the stop is not kept.
    Stopped(Stop),
}

/// The value a run returns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandResult {
    /// How the run ended.
    pub outcome: Outcome,
    /// Captured stdout bytes.
    pub stdout: Vec<u8>,
    /// Captured stderr bytes.
    pub stderr: Vec<u8>,
    /// Wall-clock time from just before the spawn until the child was reaped.
    pub duration: Duration,
    /// Set when the output may have been cut short: the run was stopped (a
    /// timeout, the output cap, `stop_all` or a failed wait), or a pipe, as a
    /// grandchild can hold, was still open when the grace after the child's
    /// exit ran out. On unix a busy machine does not cause it. One flag covers
    /// both streams, and the checked forms fail such a run; to keep stdout when
    /// stderr alone was cut short, run unchecked.
    pub output_incomplete: bool,
}

impl CommandResult {
    /// A result for a child that exited with `code` and printed nothing.
    pub fn exited(code: i32) -> Self {
        Self::with_outcome(Outcome::Exited(code))
    }

    /// A result for a run that ended without an exit code.
    pub fn stopped(reason: StopReason) -> Self {
        Self::with_outcome(Outcome::Stopped(Stop {
            reason,
            signal: None,
            error: None,
        }))
    }

    fn with_outcome(outcome: Outcome) -> Self {
        Self {
            outcome,
            stdout: Vec::new(),
            stderr: Vec::new(),
            duration: Duration::ZERO,
            output_incomplete: false,
        }
    }

    /// Sets the captured standard output.
    #[must_use]
    pub fn stdout(mut self, bytes: impl Into<Vec<u8>>) -> Self {
        self.stdout = bytes.into();
        self
    }

    /// Sets the captured standard error.
    #[must_use]
    pub fn stderr(mut self, bytes: impl Into<Vec<u8>>) -> Self {
        self.stderr = bytes.into();
        self
    }

    /// Sets the error text and signal of a stopped run. Does nothing for a
    /// run that exited.
    #[must_use]
    pub fn stop_details(mut self, signal: Option<i32>, error: Option<String>) -> Self {
        if let Outcome::Stopped(stop) = &mut self.outcome {
            stop.signal = signal;
            stop.error = error;
        }
        self
    }

    /// This result with its output marked as cut short.
    #[cfg(test)]
    #[must_use]
    pub(crate) fn cut_short(mut self) -> Self {
        self.output_incomplete = true;
        self
    }

    /// The exit code, or `None` when the run never exited.
    pub fn exit_code(&self) -> Option<i32> {
        match self.outcome {
            Outcome::Exited(code) => Some(code),
            Outcome::Stopped(_) => None,
        }
    }

    /// The stop details, or `None` when the child exited.
    pub fn stop(&self) -> Option<&Stop> {
        match &self.outcome {
            Outcome::Exited(_) => None,
            Outcome::Stopped(stop) => Some(stop),
        }
    }

    /// Whether the runner killed the child for passing its timeout.
    pub fn timed_out(&self) -> bool {
        self.stop().is_some_and(|s| s.reason == StopReason::Timeout)
    }

    /// [`Stop::signal`], or `None` for a child that exited.
    pub fn signal(&self) -> Option<i32> {
        self.stop().and_then(|s| s.signal)
    }

    /// Stdout decoded as UTF-8, with invalid sequences replaced.
    pub fn stdout_lossy(&self) -> Cow<'_, str> {
        String::from_utf8_lossy(&self.stdout)
    }

    /// Stderr decoded as UTF-8, with invalid sequences replaced.
    pub fn stderr_lossy(&self) -> Cow<'_, str> {
        String::from_utf8_lossy(&self.stderr)
    }
}

/// Whether the process started and exited 0.
pub fn ran(result: &CommandResult) -> bool {
    result.exit_code() == Some(0)
}

/// Whether a run must be read as a failure before its output is parsed: it
/// never exited, its output is incomplete, or it exited non-zero and
/// `is_answer`, asked only then, does not take the exit for an answer ("not
/// there").
pub fn run_failed(result: &CommandResult, is_answer: impl Fn(&CommandResult) -> bool) -> bool {
    match result.outcome {
        Outcome::Stopped(_) => true,
        Outcome::Exited(_) if result.output_incomplete => true,
        Outcome::Exited(code) => code != 0 && !is_answer(result),
    }
}

/// A stream decoded as UTF-8 and trimmed. Valid UTF-8, the usual case, is
/// borrowed, so a large stream is not copied to be read.
fn trimmed(bytes: &[u8]) -> Cow<'_, str> {
    match String::from_utf8_lossy(bytes) {
        Cow::Borrowed(text) => Cow::Borrowed(text.trim()),
        Cow::Owned(text) => Cow::Owned(text.trim().to_owned()),
    }
}

/// [`stderr_or_error`] for a caller inside the crate that only reads the text.
pub(crate) fn stderr_or_error_text(result: &CommandResult) -> Cow<'_, str> {
    let stderr = trimmed(&result.stderr);
    if !stderr.is_empty() {
        return stderr;
    }
    let error = result.stop().and_then(|s| s.error.as_deref());
    Cow::Borrowed(error.map_or("", str::trim))
}

/// The trimmed stderr, or the trimmed error text when stderr is empty.
pub fn stderr_or_error(result: &CommandResult) -> String {
    stderr_or_error_text(result).into_owned()
}

/// The two texts a failure is described with, each decoded and trimmed once:
/// [`stderr_or_error`]'s and stdout's.
pub(crate) struct FailureText<'a> {
    stderr: Cow<'a, str>,
    stdout: Cow<'a, str>,
}

impl<'a> FailureText<'a> {
    pub(crate) fn of(result: &'a CommandResult) -> Self {
        Self {
            stderr: stderr_or_error_text(result),
            stdout: trimmed(&result.stdout),
        }
    }

    fn texts(&self) -> impl Iterator<Item = &str> {
        [&*self.stderr, &*self.stdout]
            .into_iter()
            .filter(|text| !text.is_empty())
    }

    /// Stderr, else stdout, or `None` when neither has text.
    pub(crate) fn preferred(&self) -> Option<&str> {
        self.texts().next()
    }

    /// The non-empty ones of stderr and stdout joined by a newline.
    pub(crate) fn both(&self) -> String {
        self.texts().collect::<Vec<_>>().join("\n")
    }
}

/// Text that says why a run failed, never empty: stderr or the stop's error
/// text, else stdout, else `exit N`, or `did not exit` for a run that has no
/// exit code.
pub fn failure_text(result: &CommandResult) -> String {
    let stderr = stderr_or_error_text(result);
    if !stderr.is_empty() {
        return stderr.into_owned();
    }
    let stdout = trimmed(&result.stdout);
    if !stdout.is_empty() {
        return stdout.into_owned();
    }
    match result.exit_code() {
        Some(code) => format!("exit {code}"),
        None => "did not exit".to_string(),
    }
}

/// The non-empty ones of stderr (or the stop's error text) and stdout, joined
/// by a newline. Empty when neither has text.
pub fn failure_text_both(result: &CommandResult) -> String {
    FailureText::of(result).both()
}

/// The first non-blank line of `text`, trimmed, or `fallback` when there is
/// none.
pub fn first_line<'a>(text: &'a str, fallback: &'a str) -> &'a str {
    text.lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or(fallback)
}

/// The conventional name of a unix signal number, for the common ones.
pub fn signal_name(signal: i32) -> Option<&'static str> {
    Some(match signal {
        1 => "SIGHUP",
        2 => "SIGINT",
        3 => "SIGQUIT",
        6 => "SIGABRT",
        9 => "SIGKILL",
        11 => "SIGSEGV",
        13 => "SIGPIPE",
        14 => "SIGALRM",
        15 => "SIGTERM",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ran_means_exited_zero() {
        assert!(ran(&CommandResult::exited(0)));
        assert!(!ran(&CommandResult::exited(1)));
        assert!(!ran(&CommandResult::stopped(StopReason::Timeout)));
    }

    #[test]
    fn run_failed_treats_incomplete_output_and_stops_as_failures() {
        let no = |_: &CommandResult| false;
        assert!(!run_failed(&CommandResult::exited(0), no));
        assert!(run_failed(&CommandResult::exited(1), no));
        assert!(run_failed(&CommandResult::stopped(StopReason::Signal), no));
        assert!(run_failed(&CommandResult::exited(0).cut_short(), no));
    }

    #[test]
    fn run_failed_lets_a_caller_accept_an_exit_code_as_an_answer() {
        let one_is_answer = |r: &CommandResult| r.exit_code() == Some(1);
        assert!(!run_failed(&CommandResult::exited(1), one_is_answer));
        assert!(run_failed(&CommandResult::exited(2), one_is_answer));
        // A run that never exited is never an answer.
        assert!(run_failed(
            &CommandResult::stopped(StopReason::Timeout),
            |_| true
        ));
    }

    #[test]
    fn stderr_or_error_falls_back_to_the_error_text() {
        let r = CommandResult::stopped(StopReason::Spawn(SpawnProblem::Other))
            .stop_details(None, Some(" boom \n".into()));
        assert_eq!(stderr_or_error(&r), "boom");
        let r = r.stderr(" bad \n");
        assert_eq!(stderr_or_error(&r), "bad");
    }

    #[test]
    fn failure_text_prefers_stderr_then_stdout_then_the_exit_code() {
        let r = CommandResult::exited(3);
        assert_eq!(failure_text(&r), "exit 3");
        let r = r.stdout("out\n");
        assert_eq!(failure_text(&r), "out");
        let r = r.stderr("err\n");
        assert_eq!(failure_text(&r), "err");
    }

    #[test]
    fn failure_text_reads_the_stop_and_says_when_a_run_has_no_exit_code() {
        let r = CommandResult::stopped(StopReason::Timeout);
        assert_eq!(failure_text(&r), "did not exit");
        let r = r.stop_details(Some(9), Some(" timed out \n".into()));
        assert_eq!(failure_text(&r), "timed out");
    }

    #[test]
    fn failure_text_both_joins_the_streams_and_may_be_empty() {
        let r = CommandResult::exited(3).stdout("out\n");
        assert_eq!(failure_text_both(&r), "out");
        let r = r.stderr("err\n");
        assert_eq!(failure_text_both(&r), "err\nout");
        assert_eq!(failure_text_both(&CommandResult::exited(3)), "");
    }

    #[test]
    fn first_line_skips_blank_lines_and_trims() {
        assert_eq!(first_line("\n  \n  hi  \nmore", "x"), "hi");
        assert_eq!(first_line("  \n", "fallback"), "fallback");
    }

    #[test]
    fn signal_names() {
        assert_eq!(signal_name(9), Some("SIGKILL"));
        assert_eq!(signal_name(200), None);
    }
}

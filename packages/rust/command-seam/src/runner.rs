//! The runner trait, its options, the real runner and the checked form.

use std::collections::BTreeMap;
use std::ffi::{OsStr, OsString};
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

use crate::failure::{ClassifyContext, CommandFailure, classify_failure};
use crate::group::ProcessGroups;
#[cfg(unix)]
use crate::pipes_poll::drain;
#[cfg(not(unix))]
use crate::pipes_threads::drain;
use crate::quote::shell_join;
use crate::result::{
    CommandResult, Outcome, SpawnProblem, Stop, StopReason, failure_text_both, stderr_or_error_text,
};

/// The most each of stdout and stderr keeps when `max_output_bytes` is unset.
pub(crate) const DEFAULT_OUTPUT_CAP: usize = 256 * 1024 * 1024;

/// How long the runner waits for a held pipe after the child is reaped; see
/// [`SpawnRunner`].
pub(crate) const PIPE_GRACE: Duration = Duration::from_secs(1);

/// How much one read asks a pipe for.
pub(crate) const READ_CHUNK: usize = 64 * 1024;

/// The shortest pause between checks that the child has exited.
pub(crate) const MIN_POLL: Duration = Duration::from_micros(200);

/// The longest pause between checks that the child has exited.
pub(crate) const MAX_POLL: Duration = Duration::from_millis(20);

/// Converts anything string-like into the argument list a runner takes.
pub fn args<I, S>(items: I) -> Vec<OsString>
where
    I: IntoIterator<Item = S>,
    S: Into<OsString>,
{
    items.into_iter().map(Into::into).collect()
}

/// What environment a child gets.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum EnvMode {
    /// The parent's environment, unchanged.
    #[default]
    Inherit,
    /// The parent's environment with these changes: `Some` sets a variable,
    /// `None` removes an inherited one.
    Extend(BTreeMap<OsString, Option<OsString>>),
    /// Exactly these variables and nothing inherited.
    Replace(BTreeMap<OsString, OsString>),
}

/// Options for one run.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunOptions {
    /// The working directory. `None` inherits the parent's.
    pub cwd: Option<PathBuf>,
    /// The child's environment.
    pub env: EnvMode,
    /// Bytes written to the child's stdin, which is then closed. `None` gives
    /// the null device.
    pub input: Option<Vec<u8>>,
    /// How long the child may run before it is killed. `None`, or a duration
    /// too long for the clock to reach, waits forever; zero times out at once.
    pub timeout: Option<Duration>,
    /// The most bytes kept from each of stdout and stderr; more stops the run
    /// for [`StopReason::Output`]. `None` means 256 MiB.
    pub max_output_bytes: Option<usize>,
    /// Start the child in a new process group and stop the whole group;
    /// `stop_all` on the handle stops the run. Only unix starts a group.
    pub process_group: Option<ProcessGroups>,
    /// With a process group: the time between SIGTERM and SIGKILL. `None`
    /// means [`DEFAULT_KILL_GRACE`](crate::DEFAULT_KILL_GRACE).
    pub kill_grace: Option<Duration>,
}

impl RunOptions {
    /// Options with the given working directory.
    #[must_use]
    pub fn in_dir(cwd: impl Into<PathBuf>) -> Self {
        Self::default().cwd(cwd)
    }

    /// Runs the command in this working directory.
    #[must_use]
    pub fn cwd(mut self, cwd: impl Into<PathBuf>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    /// Sets one variable. Under [`EnvMode::Inherit`] this switches to
    /// [`EnvMode::Extend`]; under [`EnvMode::Replace`] it adds to the set.
    #[must_use]
    pub fn env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self {
        let (key, value) = (key.into(), value.into());
        match &mut self.env {
            EnvMode::Replace(vars) => {
                vars.insert(key, value);
            }
            EnvMode::Extend(vars) => {
                vars.insert(key, Some(value));
            }
            EnvMode::Inherit => {
                self.env = EnvMode::Extend(BTreeMap::from([(key, Some(value))]));
            }
        }
        self
    }

    /// Removes one variable from what the child sees.
    #[must_use]
    pub fn env_remove(mut self, key: impl Into<OsString>) -> Self {
        let key = key.into();
        match &mut self.env {
            EnvMode::Replace(vars) => {
                vars.remove(&key);
            }
            EnvMode::Extend(vars) => {
                vars.insert(key, None);
            }
            EnvMode::Inherit => {
                self.env = EnvMode::Extend(BTreeMap::from([(key, None)]));
            }
        }
        self
    }

    /// Gives the child exactly these variables and nothing inherited.
    #[must_use]
    /// Replaces the whole environment with these variables.
    pub fn env_replace<I, K, V>(mut self, vars: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<OsString>,
        V: Into<OsString>,
    {
        self.env = EnvMode::Replace(
            vars.into_iter()
                .map(|(k, v)| (k.into(), v.into()))
                .collect(),
        );
        self
    }

    /// Writes these bytes to the child's standard input, then closes it.
    #[must_use]
    pub fn input(mut self, input: impl Into<Vec<u8>>) -> Self {
        self.input = Some(input.into());
        self
    }

    /// Stops the run after this long.
    #[must_use]
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    /// Caps each of stdout and stderr at this many bytes.
    #[must_use]
    pub fn max_output_bytes(mut self, max: usize) -> Self {
        self.max_output_bytes = Some(max);
        self
    }

    /// Runs the child as the leader of its own process group, tracked in `groups`.
    #[must_use]
    pub fn process_group(mut self, groups: &ProcessGroups) -> Self {
        self.process_group = Some(groups.clone());
        self
    }

    /// How long a stopped group has to exit after SIGTERM before SIGKILL.
    #[must_use]
    pub fn kill_grace(mut self, grace: Duration) -> Self {
        self.kill_grace = Some(grace);
        self
    }
}

/// The seam: something that runs a command and says what happened. A failed
/// command is a [`CommandResult`], not a panic; [`run_checked`] makes it an `Err`.
pub trait CommandRunner: Send + Sync {
    /// The binary this runner is bound to, if any, for failure messages.
    fn binary(&self) -> Option<&OsStr> {
        None
    }

    /// Runs the command with `args` and returns what happened.
    fn run(&self, args: &[OsString], opts: &RunOptions) -> CommandResult;
}

/// Runs a real child process through `std::process`: no shell, stdout and
/// stderr captured, and a timeout enforced by killing the child.
///
/// On unix one `poll` loop on the calling thread reads both pipes, writes
/// stdin and waits for the child, so a full pipe cannot deadlock it and no
/// thread is started. Other platforms read each pipe on its own thread.
///
/// A timeout or the output cap kills the child alone (SIGKILL on unix),
/// unless the run sets [`RunOptions::process_group`]: then either, or
/// [`ProcessGroups::stop_all`], sends the group SIGTERM, then SIGKILL after
/// `kill_grace`.
///
/// A grandchild that keeps a pipe open after the child is reaped does not hold
/// the run: one second later, with or without a timeout, if the last look at
/// the pipes found nothing, the runner returns what it has read and marks the
/// output incomplete. On unix the pipes are then closed from this end, so the
/// grandchild's next write fails; a `stop_all` during that second stops the
/// group and starts the second over; and a busy machine neither shortens the
/// wait nor marks a complete run incomplete, as the thread form can.
#[derive(Debug, Clone)]
pub struct SpawnRunner {
    binary: OsString,
}

impl SpawnRunner {
    /// A runner bound to `binary`, looked up on `PATH` like a shell would.
    pub fn new(binary: impl Into<OsString>) -> Self {
        Self {
            binary: binary.into(),
        }
    }
}

impl CommandRunner for SpawnRunner {
    fn binary(&self) -> Option<&OsStr> {
        Some(&self.binary)
    }

    fn run(&self, args: &[OsString], opts: &RunOptions) -> CommandResult {
        run_process(&self.binary, args, opts)
    }
}

/// The error of [`run_checked`]: the run did not exit 0, or its output was
/// cut short.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{message}")]
pub struct CommandFailed {
    /// The classified failure.
    pub failure: CommandFailure,
    /// The whole run, with its output.
    pub result: CommandResult,
    message: String,
}

impl CommandFailed {
    fn new(failure: CommandFailure, result: CommandResult) -> Self {
        let status = match result.exit_code() {
            Some(code) if result.output_incomplete => format!("exit {code}, output cut short"),
            Some(code) => format!("exit {code}"),
            None => format!("did not exit: {}", failure.kind.as_str()),
        };
        let words: Vec<String> = failure
            .binary
            .iter()
            .chain(&failure.args)
            .map(|w| w.to_string_lossy().into_owned())
            .collect();
        let mut message = format!("command failed ({status}): {}", shell_join(&words));
        let stderr = stderr_or_error_text(&result);
        if !stderr.is_empty() {
            message.push('\n');
            message.push_str(&stderr);
        }
        Self {
            failure,
            result,
            message,
        }
    }

    /// The text of both streams, stderr first, with empty ones dropped; the
    /// stop's error text stands in for an empty stderr. Empty when neither has
    /// text.
    pub fn detail(&self) -> String {
        failure_text_both(&self.result)
    }
}

/// Runs the command and returns its result when it exited 0 with its output
/// whole.
///
/// # Errors
/// A boxed [`CommandFailed`] holding the whole result for any other run. That
/// includes an exit 0 with [`CommandResult::output_incomplete`] set, which the
/// caller would otherwise read as the whole answer. The flag covers both
/// streams; to keep stdout when stderr alone was cut short, call
/// [`CommandRunner::run`].
pub fn run_checked<R: CommandRunner + ?Sized>(
    runner: &R,
    args: &[OsString],
    opts: &RunOptions,
) -> Result<CommandResult, Box<CommandFailed>> {
    let result = runner.run(args, opts);
    let context = ClassifyContext {
        binary: runner.binary(),
        args,
        ok_exit_codes: &[],
    };
    match classify_failure(&result, &context) {
        None => Ok(result),
        Some(failure) => Err(Box::new(CommandFailed::new(failure, result))),
    }
}

fn spawn_failure(problem: SpawnProblem, error: String, start: Instant) -> CommandResult {
    let mut result =
        CommandResult::stopped(StopReason::Spawn(problem)).stop_details(None, Some(error));
    result.duration = start.elapsed();
    result
}

/// The errno of a file that is not an executable format.
const ENOEXEC: i32 = 8;

fn spawn_problem(error: &std::io::Error) -> SpawnProblem {
    match error.kind() {
        ErrorKind::NotFound => SpawnProblem::NotFound,
        ErrorKind::PermissionDenied => SpawnProblem::NotExecutable,
        _ if cfg!(unix) && error.raw_os_error() == Some(ENOEXEC) => SpawnProblem::NotExecutable,
        _ => SpawnProblem::Other,
    }
}

fn run_process(binary: &OsStr, args: &[OsString], opts: &RunOptions) -> CommandResult {
    let start = Instant::now();
    let name = binary.to_string_lossy();

    // `std` reports a missing working directory as NotFound, the same as a
    // missing binary, so check it first to tell the two apart.
    if let Some(cwd) = &opts.cwd
        && !cwd.is_dir()
    {
        let error = format!("spawn {name}: cwd {cwd:?} is missing or is not a directory");
        return spawn_failure(SpawnProblem::BadCwd, error, start);
    }

    let mut cmd = Command::new(binary);
    cmd.args(args);
    if let Some(cwd) = &opts.cwd {
        cmd.current_dir(cwd);
    }
    apply_env(&mut cmd, &opts.env);
    if let Some(groups) = &opts.process_group {
        if groups.is_stopped() {
            let mut result = CommandResult::stopped(StopReason::Abort).stop_details(
                None,
                Some("stopped before it started by ProcessGroups::stop_all".to_string()),
            );
            result.duration = start.elapsed();
            return result;
        }
        #[cfg(unix)]
        std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
    }
    cmd.stdin(if opts.input.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            return spawn_failure(spawn_problem(&e), format!("spawn {name}: {e}"), start);
        }
    };

    let cap = opts.max_output_bytes.unwrap_or(DEFAULT_OUTPUT_CAP);
    // A timeout too long to add to the clock can never pass, so it is no
    // deadline.
    let deadline = opts.timeout.and_then(|t| start.checked_add(t));
    let Drained {
        status,
        killed,
        reaped_at,
        stdout,
        stderr,
        whole,
        capped,
    } = drain(&mut child, opts.input.clone(), deadline, opts);

    let stopped = |reason, signal, error| {
        Outcome::Stopped(Stop {
            reason,
            signal,
            error,
        })
    };
    let outcome = match (&killed, capped, status.and_then(|s| s.code())) {
        (Some(Killed::Abort(signal)), _, _) => stopped(
            StopReason::Abort,
            Some(*signal),
            Some("stopped by ProcessGroups::stop_all".to_string()),
        ),
        (Some(Killed::Timeout(signal)), _, _) => stopped(
            StopReason::Timeout,
            Some(*signal),
            Some(format!(
                "timed out after {}ms",
                opts.timeout.unwrap_or_default().as_millis()
            )),
        ),
        (Some(Killed::Failed(signal, e)), _, _) => stopped(
            StopReason::Spawn(SpawnProblem::Other),
            Some(*signal),
            Some(e.clone()),
        ),
        (Some(Killed::Output(signal)), _, _) => stopped(
            StopReason::Output,
            Some(*signal),
            Some(format!("output passed {cap} bytes")),
        ),
        (None, true, _) => stopped(
            StopReason::Output,
            None,
            Some(format!("output passed {cap} bytes")),
        ),
        (None, false, Some(code)) => Outcome::Exited(code),
        (None, false, None) => stopped(StopReason::Signal, status.and_then(exit_signal), None),
    };

    CommandResult {
        outcome,
        stdout,
        stderr,
        duration: reaped_at.duration_since(start),
        output_incomplete: killed.is_some() || capped || !whole,
    }
}

/// The signal number of SIGKILL on every unix this crate targets.
const SIGKILL: i32 = 9;

#[cfg(unix)]
fn exit_signal(status: ExitStatus) -> Option<i32> {
    std::os::unix::process::ExitStatusExt::signal(&status)
}

#[cfg(not(unix))]
fn exit_signal(_status: ExitStatus) -> Option<i32> {
    None
}

fn apply_env(cmd: &mut Command, env: &EnvMode) {
    match env {
        EnvMode::Inherit => {}
        EnvMode::Extend(vars) => {
            for (k, v) in vars {
                match v {
                    Some(v) => cmd.env(k, v),
                    None => cmd.env_remove(k),
                };
            }
        }
        EnvMode::Replace(vars) => {
            cmd.env_clear();
            cmd.envs(vars);
        }
    }
}

/// What `drain` found: how the child ended and what it wrote.
pub(crate) struct Drained {
    /// `None` when waiting failed.
    pub(crate) status: Option<ExitStatus>,
    /// Why the runner stopped the child, when it did.
    pub(crate) killed: Option<Killed>,
    /// When the child was reaped; `duration` runs to here.
    pub(crate) reaped_at: Instant,
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
    /// Both pipes reached their end: none was still open when the grace ended.
    pub(crate) whole: bool,
    /// A stream passed its cap.
    pub(crate) capped: bool,
}

/// Why the runner killed the child, and the last signal it sent.
pub(crate) enum Killed {
    Timeout(i32),
    Output(i32),
    /// [`ProcessGroups::stop_all`] was called.
    Abort(i32),
    /// Waiting on the child failed; the text says how.
    Failed(i32, String),
}

/// Kills the run: its whole process group when it has one on unix, else the
/// child alone. Returns the leader's status and the signal sent last.
pub(crate) fn stop(child: &mut Child, opts: &RunOptions) -> (Option<ExitStatus>, i32) {
    #[cfg(unix)]
    if opts.process_group.is_some() {
        let grace = opts.kill_grace.unwrap_or(crate::group::DEFAULT_KILL_GRACE);
        return crate::group::stop_group(child, grace);
    }
    #[cfg(not(unix))]
    let _ = opts;
    (kill(child), SIGKILL)
}

fn kill(child: &mut Child) -> Option<ExitStatus> {
    // Killing a child that already exited is not an error worth reporting.
    let _ = child.kill();
    child.wait().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::failure::CommandFailureKind;
    use crate::testing::FakeRunner;

    #[test]
    fn run_checked_fails_an_exit_zero_whose_output_was_cut_short() {
        let fake = FakeRunner::new().bound_to("gh").answer(
            "api",
            CommandResult::exited(0).stdout("half an ans").cut_short(),
        );
        let err = run_checked(&fake, &args(["api"]), &RunOptions::default()).unwrap_err();
        assert_eq!(err.failure.kind, CommandFailureKind::OutputIncomplete);
        assert_eq!(
            err.to_string(),
            "command failed (exit 0, output cut short): gh api"
        );
        assert_eq!(err.result.stdout_lossy(), "half an ans");
    }

    #[test]
    fn a_non_zero_exit_cut_short_stays_an_exit_failure_and_says_both() {
        let fake = FakeRunner::new()
            .bound_to("gh")
            .answer("api", CommandResult::exited(4).cut_short());
        let err = run_checked(&fake, &args(["api"]), &RunOptions::default()).unwrap_err();
        assert_eq!(err.failure.kind, CommandFailureKind::Exit);
        assert_eq!(
            err.to_string(),
            "command failed (exit 4, output cut short): gh api"
        );
    }
}

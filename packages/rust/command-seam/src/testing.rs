//! A recording fake runner for tests.
//!
//! [`FakeRunner`] answers calls from a table keyed by the shell-quoted
//! arguments, or from a closure, and records every call. An unanswered call
//! is a failed spawn that names the key it wanted.

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::sync::Mutex;

use crate::quote::shell_quote;
use crate::result::{CommandResult, SpawnProblem, StopReason};
use crate::runner::{CommandRunner, RunOptions};

/// One call a [`FakeRunner`] saw.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FakeCall {
    /// The arguments, copied at call time.
    pub args: Vec<OsString>,
    /// The options, copied at call time.
    pub opts: RunOptions,
}

type Responder = Box<dyn Fn(&[OsString], &RunOptions) -> Option<CommandResult> + Send + Sync>;

/// A [`CommandRunner`] with scripted answers that records its calls.
pub struct FakeRunner {
    binary: Option<OsString>,
    answers: HashMap<String, CommandResult>,
    responder: Option<Responder>,
    calls: Mutex<Vec<FakeCall>>,
}

impl Default for FakeRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl FakeRunner {
    /// A fake with no answers: every call is an unanswered spawn failure.
    pub fn new() -> Self {
        Self {
            binary: None,
            answers: HashMap::new(),
            responder: None,
            calls: Mutex::new(Vec::new()),
        }
    }

    /// A fake that asks `responder` for every call. `None` means unanswered.
    pub fn from_fn<F>(responder: F) -> Self
    where
        F: Fn(&[OsString], &RunOptions) -> Option<CommandResult> + Send + Sync + 'static,
    {
        Self {
            responder: Some(Box::new(responder)),
            ..Self::new()
        }
    }

    /// Answers calls whose arguments quote to `key` (see [`key_of`]).
    #[must_use]
    pub fn answer(mut self, key: &str, result: CommandResult) -> Self {
        self.answers.insert(key.to_string(), result);
        self
    }

    /// Reports `binary` from [`CommandRunner::binary`].
    #[must_use]
    pub fn bound_to(mut self, binary: impl Into<OsString>) -> Self {
        self.binary = Some(binary.into());
        self
    }

    /// The calls made so far, oldest first.
    pub fn calls(&self) -> Vec<FakeCall> {
        self.lock().clone()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<FakeCall>> {
        // A panic in another test thread must not hide the calls.
        self.calls.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl CommandRunner for FakeRunner {
    fn binary(&self) -> Option<&OsStr> {
        self.binary.as_deref()
    }

    fn run(&self, args: &[OsString], opts: &RunOptions) -> CommandResult {
        self.lock().push(FakeCall {
            args: args.to_vec(),
            opts: opts.clone(),
        });
        let found = match &self.responder {
            Some(f) => f(args, opts),
            None => self.answers.get(&key_of(args)).cloned(),
        };
        found.unwrap_or_else(|| {
            CommandResult::stopped(StopReason::Spawn(SpawnProblem::Other)).stop_details(
                None,
                Some(format!("FakeRunner: no answer for: {}", key_of(args))),
            )
        })
    }
}

/// The key an answer is registered under: each argument shell-quoted, joined
/// by spaces. A first argument holding `=` is not specially quoted.
pub fn key_of(args: &[OsString]) -> String {
    args.iter()
        .map(|a| shell_quote(&a.to_string_lossy()))
        .collect::<Vec<_>>()
        .join(" ")
}

/// A result for a run that never exited, with the fields the real runner sets
/// for `reason`; a spawn or abort is filled as for a run that never started.
pub fn fake_never_exited(reason: StopReason) -> CommandResult {
    let (signal, error) = match reason {
        StopReason::Spawn(_) => (None, Some("fake: spawn")),
        StopReason::Timeout => (Some(9), Some("fake: timeout")),
        StopReason::Abort => (None, Some("fake: abort")),
        StopReason::Signal => (Some(15), None),
        StopReason::Output => (Some(9), Some("fake: output")),
    };
    CommandResult::stopped(reason).stop_details(signal, error.map(str::to_string))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::result::{Outcome, ran};
    use crate::runner::{args, run_checked};

    #[test]
    fn an_unanswered_call_reports_a_failed_spawn_that_names_the_args() {
        let fake = FakeRunner::new();
        let r = fake.run(&args(["status", "-s"]), &RunOptions::default());
        assert!(!ran(&r));
        let stop = r.stop().unwrap();
        assert_eq!(stop.reason, StopReason::Spawn(SpawnProblem::Other));
        assert_eq!(
            stop.error.as_deref(),
            Some("FakeRunner: no answer for: status -s")
        );
    }

    #[test]
    fn an_answer_keeps_every_field_it_sets() {
        let fake = FakeRunner::new().answer(
            "x",
            fake_never_exited(StopReason::Timeout).stdout("partial"),
        );
        let r = fake.run(&args(["x"]), &RunOptions::default());
        assert!(r.timed_out());
        assert_eq!(r.stdout_lossy(), "partial");
        assert_eq!(r.signal(), Some(9));
    }

    #[test]
    fn a_key_quotes_each_argument() {
        let fake = FakeRunner::new().answer("echo 'a b'", CommandResult::exited(0).stdout("ok"));
        let r = fake.run(&args(["echo", "a b"]), &RunOptions::default());
        assert_eq!(r.stdout_lossy(), "ok");
        let r = fake.run(&args(["echo", "a", "b"]), &RunOptions::default());
        assert!(r.stop().is_some());
    }

    #[test]
    fn a_first_argument_with_equals_needs_no_quotes() {
        assert_eq!(key_of(&args(["A=b", "c"])), "A=b c");
    }

    #[test]
    fn calls_hold_copies_and_record_options() {
        let fake = FakeRunner::from_fn(|_, _| Some(CommandResult::exited(0)));
        let mut opts = RunOptions::in_dir("/work").env("A", "1");
        fake.run(&args(["a"]), &opts);
        opts.cwd = Some("/elsewhere".into());
        let calls = fake.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].args, args(["a"]));
        assert_eq!(calls[0].opts.cwd.as_deref(), Some("/work".as_ref()));
    }

    #[test]
    fn a_closure_can_decide_per_call() {
        let fake = FakeRunner::from_fn(|a, _| {
            (a.first().map(|s| s.as_os_str()) == Some(OsStr::new("go")))
                .then(|| CommandResult::exited(0).stdout("went"))
        });
        assert!(ran(&fake.run(&args(["go"]), &RunOptions::default())));
        assert!(!ran(&fake.run(&args(["stop"]), &RunOptions::default())));
        assert_eq!(fake.calls().len(), 2);
    }

    #[test]
    fn fake_never_exited_fills_the_fields_the_runners_set() {
        let r = fake_never_exited(StopReason::Timeout);
        assert_eq!(r.signal(), Some(9));
        assert_eq!(r.stop().unwrap().error.as_deref(), Some("fake: timeout"));
        let r = fake_never_exited(StopReason::Signal);
        assert_eq!(r.signal(), Some(15));
        assert_eq!(r.stop().unwrap().error, None);
        assert!(matches!(
            fake_never_exited(StopReason::Abort).outcome,
            Outcome::Stopped(_)
        ));
    }

    #[test]
    fn works_through_run_checked_with_the_bound_binary() {
        let fake = FakeRunner::new()
            .bound_to("git")
            .answer("status", CommandResult::exited(128).stderr("fatal: nope\n"));
        let err = run_checked(&fake, &args(["status"]), &RunOptions::default()).unwrap_err();
        assert_eq!(
            err.to_string(),
            "command failed (exit 128): git status\nfatal: nope"
        );
        assert_eq!(err.detail(), "fatal: nope");
    }
}

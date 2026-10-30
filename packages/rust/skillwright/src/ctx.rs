//! What a command is given instead of reaching for the process: a working
//! directory, two streams, a way to ask whether the user has interrupted, and
//! a runner for external commands.
//!
//! Every verb takes one, so every verb is testable by calling it — the tests
//! in this crate drive [`crate::cli::run_with`] in-process rather than
//! spawning a binary, and this is the seam that lets them.
//!
//! # The interrupt poll
//!
//! Nothing in this crate installs a SIGINT handler. Rust's default handler
//! terminates the process, which is what a run with no per-unit loop wants:
//! `build` and `check` are each one long call into the core, so there is no
//! point between units at which either could act on a flag. Claiming the
//! signal to set one would take Ctrl-C away from the shell and give nothing
//! back.
//!
//! `status` is the verb that could act on one — it calls the core once per
//! row — so the poll exists for it, and for a host that already traps the
//! signal and can hand this context a flag to read. Left at its default it
//! answers `false` for the whole run.

use std::io::Write;
use std::path::{Path, PathBuf};

use crate::commands::harness::cli_runner::{ProcessRunner, Runner};

/// What a command is given instead of the process.
pub struct CommandContext<'a> {
    /// The working directory relative paths resolve against.
    pub cwd: PathBuf,
    /// The report. The CLI spec reserves it for that alone.
    pub out: &'a mut dyn Write,
    /// Progress, tallies, prompts, and every message an exit code carries.
    pub err: &'a mut dyn Write,
    interrupted: Box<dyn Fn() -> bool + 'a>,
    /// Spawns the external commands a verb runs.
    pub runner: &'a dyn Runner,
}

impl<'a> CommandContext<'a> {
    /// A context that is never interrupted and runs real processes.
    pub fn new(cwd: impl AsRef<Path>, out: &'a mut dyn Write, err: &'a mut dyn Write) -> Self {
        Self {
            cwd: cwd.as_ref().to_path_buf(),
            out,
            err,
            interrupted: Box::new(|| false),
            runner: &ProcessRunner,
        }
    }

    /// Read this instead of a flag of its own: a host that traps SIGINT
    /// supplies the poll, and the commands never learn where it came from.
    pub fn with_interrupt(mut self, poll: impl Fn() -> bool + 'a) -> Self {
        self.interrupted = Box::new(poll);
        self
    }

    /// Replace the process runner, e.g. with a scripted fake in tests.
    pub fn with_runner(mut self, runner: &'a dyn Runner) -> Self {
        self.runner = runner;
        self
    }

    /// Polled between units of work.
    pub fn is_interrupted(&self) -> bool {
        (self.interrupted)()
    }
}

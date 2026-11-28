//! A seam for running child processes.
//!
//! Callers take a [`CommandRunner`] instead of spawning directly, so a test can
//! hand in a [`testing::FakeRunner`]. [`SpawnRunner`] is the real one: no shell,
//! captured output, optional stdin, environment control, a timeout and, on
//! request, a process group stopped as a whole (see [`ProcessGroups`]). A failed
//! run is a value ([`CommandResult`]); [`run_checked`] turns any run that did not
//! exit 0, or whose output was cut short, into a [`CommandFailed`].
//!
//! The Rust twin of the TypeScript `@osdlc/command-seam`.
//!
//! ```
//! use command_seam::{args, run_checked, RunOptions, SpawnRunner};
//!
//! let sh = SpawnRunner::new("sh");
//! let result = run_checked(&sh, &args(["-c", "echo hi"]), &RunOptions::default()).unwrap();
//! assert_eq!(result.stdout_lossy(), "hi\n");
//! ```

#![forbid(unsafe_code)]

mod failure;
mod group;
#[cfg(unix)]
mod pipes_poll;
#[cfg(not(unix))]
mod pipes_threads;
mod quote;
mod result;
mod runner;
mod signals;
pub mod testing;
mod which;

pub use failure::{
    ClassifyContext, CommandFailure, CommandFailureKind, build_failure, classify_failure,
};
pub use group::{DEFAULT_KILL_GRACE, ProcessGroups};
pub use quote::{shell_join, shell_quote};
pub use result::{
    CommandResult, Outcome, SpawnProblem, Stop, StopReason, failure_text, failure_text_both,
    first_line, ran, run_failed, signal_name, stderr_or_error,
};
pub use runner::{
    CommandFailed, CommandRunner, EnvMode, RunOptions, SpawnRunner, args, run_checked,
};
/// SIGBUS on this platform, for a caller that reads a child's end by signal: a program that maps a
/// file gets it when the file shrinks under it.
#[cfg(unix)]
pub use signal_hook::consts::SIGBUS;
pub use signals::Forwarded;
pub use which::which;

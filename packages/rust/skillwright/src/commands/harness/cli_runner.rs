//! The one place the `harness` verbs spawn a process. Tests swap in a fake
//! through [`crate::ctx::CommandContext::with_runner`].

use std::path::Path;
use std::process::Command;

/// A command line as its arguments, program first.
pub type Argv = Vec<String>;

/// What a finished process left behind.
pub struct RunResult {
    /// `None` when the process could not be started or was killed by a signal.
    pub code: Option<i32>,
    /// Captured standard output.
    pub stdout: String,
    /// Captured standard error.
    pub stderr: String,
}

impl RunResult {
    /// True when the process exited with code 0.
    pub fn ok(&self) -> bool {
        self.code == Some(0)
    }
}

/// Runs external commands.
pub trait Runner {
    /// Run `argv` in `cwd` and block until it exits.
    fn run(&self, argv: &[String], cwd: &Path) -> RunResult;
}

/// The runner that spawns real processes.
pub struct ProcessRunner;

impl Runner for ProcessRunner {
    fn run(&self, argv: &[String], cwd: &Path) -> RunResult {
        let Some((program, args)) = argv.split_first() else {
            return RunResult {
                code: None,
                stdout: String::new(),
                stderr: "empty command".to_string(),
            };
        };
        match Command::new(program).args(args).current_dir(cwd).output() {
            Ok(output) => RunResult {
                code: output.status.code(),
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            },
            Err(e) => RunResult {
                code: None,
                stdout: String::new(),
                stderr: format!("{program} could not be started: {e}"),
            },
        }
    }
}

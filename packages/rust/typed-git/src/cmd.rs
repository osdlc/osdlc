//! The low-level git command builder.
//!
//! Every function in this crate runs git through [`GitCommand`], which
//! spawns `git <args>` in a working directory, captures stdout and stderr,
//! checks the exit status and returns a typed result or a [`GitError`].
//!
//! Three ways to run a command:
//!
//! - [`run`](GitCommand::run): trimmed stdout on success, an error on a
//!   non-zero exit.
//! - [`run_raw`](GitCommand::run_raw): the full [`Output`], to read stderr or
//!   handle a non-zero exit yourself.
//! - [`check`](GitCommand::check): a yes-or-no probe (exit 0 is `true`).
//!
//! Arguments are passed to the process as a list, never through a shell.
//!
//! ```
//! use typed_git::git;
//!
//! let version = git().arg("--version").run()?;
//! assert!(version.starts_with("git version"));
//!
//! let dir = tempfile::tempdir().unwrap();
//! let in_repo = git()
//!     .dir(dir.path())
//!     .args(&["rev-parse", "--is-inside-work-tree"])
//!     .check()?;
//! assert!(!in_repo);
//! # Ok::<(), typed_git::GitError>(())
//! ```

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Output, Stdio};

use crate::GitError;

/// Starts a [`GitCommand`] with no arguments and the current directory.
///
/// `git().dir(repo).args(&["status"]).run()`
pub fn git() -> GitCommand {
    GitCommand::new()
}

/// One `git` invocation being built: its arguments, working directory,
/// environment and stdin.
#[derive(Debug, Clone)]
pub struct GitCommand {
    args: Vec<String>,
    cwd: Option<PathBuf>,
    envs: Vec<(String, String)>,
    stdin: Option<Vec<u8>>,
}

impl Default for GitCommand {
    fn default() -> Self {
        Self::new()
    }
}
impl GitCommand {
    /// An empty command: no arguments, the current directory, the parent's
    /// environment and no stdin. [`git()`] is the short form.
    pub fn new() -> Self {
        Self {
            args: Vec::new(),
            cwd: None,
            envs: Vec::new(),
            stdin: None,
        }
    }

    /// Runs git in `cwd` instead of the current directory.
    pub fn dir(&mut self, cwd: impl Into<PathBuf>) -> &mut Self {
        self.cwd = Some(cwd.into());
        self
    }

    /// Set an environment variable for the git subprocess.
    pub fn env(&mut self, key: impl Into<String>, val: impl Into<String>) -> &mut Self {
        self.envs.push((key.into(), val.into()));
        self
    }

    /// Set multiple environment variables for the git subprocess.
    pub fn envs<I, K, V>(&mut self, vars: I) -> &mut Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        for (k, v) in vars {
            self.envs.push((k.into(), v.into()));
        }
        self
    }

    /// Append a single argument.
    pub fn arg(&mut self, arg: impl AsRef<str>) -> &mut Self {
        self.args.push(arg.as_ref().to_string());
        self
    }

    /// Feed `bytes` to the subprocess on stdin.
    ///
    /// Spares callers of `--stdin`-shaped subcommands (`hash-object`,
    /// `update-index`, `mktree`) a temp file per invocation.
    pub fn stdin(&mut self, bytes: impl Into<Vec<u8>>) -> &mut Self {
        self.stdin = Some(bytes.into());
        self
    }

    /// Append multiple arguments.
    pub fn args(&mut self, args: &[&str]) -> &mut Self {
        self.args.extend(args.iter().map(|s| s.to_string()));
        self
    }

    /// Run the command. Returns trimmed stdout on success, GitError on failure.
    pub fn run(&self) -> Result<String, GitError> {
        let output = self.run_raw()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(GitError::Command {
                command: self.label(),
                stderr,
            });
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Run the command and return the raw `Output`.
    ///
    /// Use this when you need to inspect stderr or handle non-zero exits yourself.
    pub fn run_raw(&self) -> Result<Output, GitError> {
        let mut cmd = Command::new("git");
        cmd.args(&self.args);

        if let Some(cwd) = &self.cwd {
            cmd.current_dir(cwd);
        }

        for (k, v) in &self.envs {
            cmd.env(k, v);
        }

        let Some(bytes) = &self.stdin else {
            return cmd.output().map_err(GitError::Exec);
        };
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(GitError::Exec)?;
        let mut pipe = child.stdin.take().expect("stdin was piped");
        let bytes = bytes.clone();
        // The write goes off-thread so this one can drain stdout and stderr
        // meanwhile. Written inline, a command that fills a pipe buffer
        // (~64 KiB) before it has read all of its input deadlocks: it cannot
        // read until we drain, and we cannot drain until we finish writing.
        // Dropping the handle at the end of the closure closes the pipe,
        // which is what git waits for.
        let writer = std::thread::spawn(move || pipe.write_all(&bytes));
        let output = child.wait_with_output().map_err(GitError::Exec)?;
        match writer.join() {
            Ok(Ok(())) => Ok(output),
            // A command that stops reading early closes the pipe under us.
            // Its exit status is the real story, so hand that back instead.
            Ok(Err(e)) if e.kind() == std::io::ErrorKind::BrokenPipe => Ok(output),
            Ok(Err(e)) => Err(GitError::Exec(e)),
            Err(_) => Err(GitError::Exec(std::io::Error::other(
                "the stdin writer panicked",
            ))),
        }
    }

    /// Run the command as a boolean probe.
    ///
    /// Returns `Ok(true)` on exit 0, `Ok(false)` on non-zero.
    /// Only returns `Err` if the process failed to spawn.
    pub fn check(&self) -> Result<bool, GitError> {
        let output = self.run_raw()?;
        Ok(output.status.success())
    }

    /// Human-readable label for error messages.
    fn label(&self) -> String {
        format!("git {}", self.args.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use super::GitCommand;

    #[test]
    fn test_api() {
        let mut cmd = GitCommand::new();
        cmd.arg("--version");
        let result = cmd.run().unwrap();
        assert!(result.contains("git version"));
    }

    #[test]
    fn a_large_output_does_not_deadlock_the_stdin_write() {
        // `cat-file --batch` echoes a blob per requested oid, so asking for a
        // large blob repeatedly makes the child write far past one pipe
        // buffer while the caller is still feeding it. Written inline, this
        // hangs forever.
        let repo = std::env::temp_dir().join(format!(
            "typed-git-stdin-{}-{:?}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&repo).unwrap();
        let mut init = GitCommand::new();
        init.args(&["init", "-q", "--bare"])
            .dir(&repo)
            .run()
            .unwrap();

        let mut write = GitCommand::new();
        write
            .args(&["hash-object", "-w", "--stdin"])
            .dir(&repo)
            .stdin("x".repeat(128 * 1024));
        let oid = write.run().unwrap();

        let mut batch = GitCommand::new();
        batch
            .args(&["cat-file", "--batch"])
            .dir(&repo)
            .stdin(format!("{oid}\n").repeat(16));
        let out = batch.run().unwrap();

        std::fs::remove_dir_all(&repo).ok();
        assert!(
            out.len() > 64 * 1024,
            "the child must outrun one pipe buffer"
        );
    }

    #[test]
    fn stdin_feeds_the_subprocess() {
        let mut cmd = GitCommand::new();
        cmd.args(&["hash-object", "--stdin"]).stdin("hi\n");
        assert_eq!(
            cmd.run().unwrap(),
            "45b983be36b73c0788dc9cbcb76cbb80fc7bb057"
        );
    }
}

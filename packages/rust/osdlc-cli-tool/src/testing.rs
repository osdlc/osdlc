//! Run an app in process and read back what it printed, for a tool's own tests.
//! Nothing here depends on a test runner.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::de::DeserializeOwned;

use crate::io::{CapturedIo, Context};

/// What [`run_app`] returns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppRun {
    /// The exit code.
    pub exit: i32,
    /// Everything written to stdout.
    pub out: String,
    /// Everything written to stderr.
    pub err: String,
}

impl AppRun {
    /// stdout parsed as JSON.
    ///
    /// # Errors
    /// Fails when stdout is not JSON of the requested shape.
    pub fn json<T: DeserializeOwned>(&self) -> serde_json::Result<T> {
        serde_json::from_str(&self.out)
    }
}

/// The ambient values of a test run.
///
/// The default is isolated from the machine: the working directory is the
/// system temp directory and the environment is empty, so a command that
/// reads `HOME` or `XDG_*` sees nothing rather than the developer's files.
#[derive(Debug, Clone, Default)]
pub struct RunOptions {
    /// The working directory. Default: the system temp directory.
    pub cwd: Option<PathBuf>,
    /// The environment. Default: empty.
    pub env: BTreeMap<String, String>,
    /// Whether stdout reports as a terminal. Default: no.
    pub terminal: bool,
}

impl RunOptions {
    /// Options with `cwd` as the working directory.
    #[must_use]
    pub fn cwd(mut self, cwd: impl Into<PathBuf>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    /// Options with one more environment variable.
    #[must_use]
    pub fn env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.insert(key.into(), value.into());
        self
    }
}

/// Run `app` against `argv` with captured output. `argv` includes the program
/// name first, as clap expects. `app` is typically a closure around
/// [`run`](crate::run):
///
/// ```ignore
/// let run = run_app(&["greeter", "greet", "ada"], RunOptions::default(), |argv, ctx| {
///     cli_tool::run::<Cli, _, _, _>(argv.iter().copied(), ctx, handle)
/// });
/// assert_eq!(run.exit, 0);
/// ```
pub fn run_app<F>(argv: &[&str], options: RunOptions, app: F) -> AppRun
where
    F: FnOnce(&[&str], &mut Context<'_>) -> i32,
{
    let mut captured = CapturedIo::default();
    let exit = {
        let mut ctx = Context::new(&mut captured.out, &mut captured.err)
            .with_cwd(options.cwd.unwrap_or_else(std::env::temp_dir))
            .with_env(options.env)
            .with_terminal(options.terminal);
        app(argv, &mut ctx)
    };
    AppRun {
        exit,
        out: captured.out_text(),
        err: captured.err_text(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_argv_cwd_env_and_collects_output() {
        let run = run_app(
            &["t", "x"],
            RunOptions::default().cwd("/work").env("K", "v"),
            |argv, ctx| {
                writeln!(ctx.io.out, "{} {}", argv.len(), ctx.cwd.display()).unwrap();
                let k = ctx.env("K").unwrap_or("unset").to_owned();
                writeln!(ctx.io.err, "{k}").unwrap();
                7
            },
        );
        assert_eq!(run.exit, 7);
        assert_eq!(run.out, "2 /work\n");
        assert_eq!(run.err, "v\n");
    }

    #[test]
    fn the_default_environment_is_empty() {
        let run = run_app(&["t"], RunOptions::default(), |_, ctx| {
            i32::from(ctx.env("HOME").is_some() || ctx.env("PATH").is_some())
        });
        assert_eq!(run.exit, 0);
    }
}

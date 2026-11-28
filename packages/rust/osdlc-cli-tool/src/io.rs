//! The output seam and the context a command runs in.
//!
//! A command that prints with `println!` cannot be tested without capturing the
//! process's stdout. A command that writes to an injected [`Io`] can be run in
//! process and its output read back.
//!
//! Streams carry what each is for: results on `out`, diagnostics (errors,
//! warnings, progress) on `err`. Exit codes are not part of [`Io`]; they are
//! return values.

use std::collections::BTreeMap;
use std::io::{self, IsTerminal, Write};
use std::path::PathBuf;

/// The two output streams a command writes through, instead of naming
/// `stdout()` or `stderr()` itself.
pub struct Io<'a> {
    /// Results: what a pipe or a script reads.
    pub out: &'a mut dyn Write,
    /// Diagnostics: errors, warnings and progress.
    pub err: &'a mut dyn Write,
}

/// Buffers that stand in for the streams, for tests asserting on output.
///
/// ```
/// use cli_tool::{CapturedIo, Context};
///
/// let mut captured = CapturedIo::default();
/// let mut ctx = Context::new(&mut captured.out, &mut captured.err);
/// use std::io::Write;
/// writeln!(ctx.io.out, "hello").unwrap();
/// assert_eq!(captured.out_text(), "hello\n");
/// ```
#[derive(Debug, Default, Clone)]
pub struct CapturedIo {
    /// Everything written to the result stream.
    pub out: Vec<u8>,
    /// Everything written to the diagnostic stream.
    pub err: Vec<u8>,
}

impl CapturedIo {
    /// The result stream as text (invalid UTF-8 is replaced).
    pub fn out_text(&self) -> String {
        String::from_utf8_lossy(&self.out).into_owned()
    }

    /// The diagnostic stream as text (invalid UTF-8 is replaced).
    pub fn err_text(&self) -> String {
        String::from_utf8_lossy(&self.err).into_owned()
    }
}

/// What a command needs from its environment: where its output goes, the
/// working directory, the environment variables, and whether stdout is a
/// terminal.
///
/// `cwd` and the environment are values, not reads of the process, so a test
/// runs a whole command against a temporary directory and a chosen
/// environment. A new context has the working directory `.`, an empty
/// environment and no terminal, which is the safe reading: no color, no
/// prompt.
pub struct Context<'a> {
    /// Where output goes.
    pub io: Io<'a>,
    /// The directory relative paths resolve against.
    pub cwd: PathBuf,
    env: BTreeMap<String, String>,
    /// Whether stdout is a terminal.
    pub stdout_is_terminal: bool,
}

impl<'a> Context<'a> {
    /// A context writing to `out` and `err`, with `.` as the working
    /// directory, an empty environment and no terminal.
    pub fn new(out: &'a mut dyn Write, err: &'a mut dyn Write) -> Self {
        Self {
            io: Io { out, err },
            cwd: PathBuf::from("."),
            env: BTreeMap::new(),
            stdout_is_terminal: false,
        }
    }

    /// The real ambient context: this process's directory and environment, and
    /// whether its stdout is a terminal. A variable whose name or value is not
    /// UTF-8 is left out, and the directory is `.` when the process's cannot
    /// be read. Pass the process's streams, not locked (see
    /// [`run_main`](crate::run_main)); this is the only constructor that reads
    /// the process.
    pub fn from_process(out: &'a mut dyn Write, err: &'a mut dyn Write) -> Self {
        let env = std::env::vars_os()
            .filter_map(|(k, v)| Some((k.into_string().ok()?, v.into_string().ok()?)))
            .collect();
        Self {
            io: Io { out, err },
            cwd: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            env,
            stdout_is_terminal: io::stdout().is_terminal(),
        }
    }

    /// This context with `cwd` as its working directory.
    #[must_use]
    pub fn with_cwd(mut self, cwd: impl Into<PathBuf>) -> Self {
        self.cwd = cwd.into();
        self
    }

    /// This context with exactly these environment variables.
    #[must_use]
    pub fn with_env<K, V>(mut self, vars: impl IntoIterator<Item = (K, V)>) -> Self
    where
        K: Into<String>,
        V: Into<String>,
    {
        self.env = vars
            .into_iter()
            .map(|(k, v)| (k.into(), v.into()))
            .collect();
        self
    }

    /// This context with stdout reported as a terminal or not.
    #[must_use]
    pub fn with_terminal(mut self, stdout_is_terminal: bool) -> Self {
        self.stdout_is_terminal = stdout_is_terminal;
        self
    }

    /// The value of environment variable `key`, if set.
    pub fn env(&self, key: &str) -> Option<&str> {
        self.env.get(key).map(String::as_str)
    }

    /// Every environment variable this context holds, by name.
    pub fn vars(&self) -> &BTreeMap<String, String> {
        &self.env
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_context_is_inert() {
        let mut c = CapturedIo::default();
        let ctx = Context::new(&mut c.out, &mut c.err);
        assert_eq!(ctx.cwd, PathBuf::from("."));
        assert_eq!(ctx.env("HOME"), None);
        assert!(!ctx.stdout_is_terminal);
    }

    #[test]
    fn injected_values_are_what_the_context_reports() {
        let mut c = CapturedIo::default();
        let ctx = Context::new(&mut c.out, &mut c.err)
            .with_cwd("/work")
            .with_env([("A", "1")])
            .with_terminal(true);
        assert_eq!(ctx.cwd, PathBuf::from("/work"));
        assert_eq!(ctx.env("A"), Some("1"));
        assert_eq!(ctx.env("B"), None);
        assert!(ctx.stdout_is_terminal);
    }

    #[test]
    fn vars_returns_every_injected_variable() {
        let mut c = CapturedIo::default();
        let ctx = Context::new(&mut c.out, &mut c.err).with_env([("B", "2"), ("A", "1")]);
        let names: Vec<_> = ctx
            .vars()
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        assert_eq!(names, [("A", "1"), ("B", "2")]);
        let mut d = CapturedIo::default();
        assert!(Context::new(&mut d.out, &mut d.err).vars().is_empty());
    }

    #[test]
    fn streams_stay_separate() {
        let mut c = CapturedIo::default();
        {
            let ctx = Context::new(&mut c.out, &mut c.err);
            writeln!(ctx.io.out, "result").unwrap();
            writeln!(ctx.io.err, "diagnostic").unwrap();
        }
        assert_eq!(c.out_text(), "result\n");
        assert_eq!(c.err_text(), "diagnostic\n");
    }
}

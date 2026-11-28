//! The clap layer: parse argv, run a handler, and turn its result or failure
//! into output on the right stream and an exit code.

use std::ffi::OsString;
use std::io::{self, Write};

use clap::error::ErrorKind;
use clap::{Args, Parser};
use serde::Serialize;

use crate::document::{ErrorDocument, SCHEMA_VERSION, envelope_json};
use crate::exit::Exit;
use crate::failure::{Failure, render_error};
use crate::io::Context;
use crate::safe::safe;

/// The global `--json` flag. Flatten it into the top-level parser and
/// implement [`HasGlobals`] to expose it:
///
/// ```ignore
/// #[derive(Parser)]
/// struct Cli {
///     #[command(flatten)]
///     globals: GlobalArgs,
///     #[command(subcommand)]
///     command: Cmd,
/// }
/// ```
// `about = None` keeps the doc comment above out of the help of the command it joins.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Args)]
#[command(about = None, long_about = None)]
pub struct GlobalArgs {
    /// Print the result as a versioned JSON document on stdout; a run that fails prints the
    /// error document there instead, whose schema `schema error` prints
    #[arg(long, global = true)]
    pub json: bool,
}

/// A parsed command line that carries the [`GlobalArgs`].
pub trait HasGlobals {
    /// The global flags of this command line.
    fn globals(&self) -> &GlobalArgs;
}

/// What a successful command produces: text for people and a payload for
/// `--json`, so one handler serves both.
///
/// The payload must be one [`envelope_json`] accepts, or `--json` fails the
/// run. A command with several outputs implements this on an enum and returns
/// the right [`kind`](Report::kind) per variant.
pub trait Report: Serialize {
    /// The document's `kind`, such as `greeting`.
    fn kind(&self) -> &str;

    /// The document's `schemaVersion`. Bump it when the payload changes
    /// incompatibly.
    fn schema_version(&self) -> u32 {
        SCHEMA_VERSION
    }

    /// The text printed on stdout without `--json`, with its trailing newline.
    fn render_text(&self) -> String;

    /// This result, printed as usual, with the run ending in `exit`: 1 for a
    /// query that matched nothing, or a tool's own outcome
    /// ([`is_domain_exit`](crate::is_domain_exit)).
    fn with_exit(self, exit: i32) -> Outcome
    where
        Self: Sized + 'static,
    {
        Outcome::new(self, exit)
    }
}

/// [`Report`] with its payload type erased, so each subcommand arm can return
/// its own report as a `Box<dyn DynReport>`. Every [`Report`] is one.
pub trait DynReport {
    /// The document's `kind`.
    fn kind(&self) -> &str;
    /// The document's `schemaVersion`.
    fn schema_version(&self) -> u32;
    /// The text printed on stdout without `--json`.
    fn render_text(&self) -> String;
    /// The pretty-printed envelope for `--json`, without a trailing newline.
    ///
    /// # Errors
    /// As [`envelope_json`].
    fn envelope(&self) -> serde_json::Result<String>;
}

impl<R: Report> DynReport for R {
    fn kind(&self) -> &str {
        Report::kind(self)
    }
    fn schema_version(&self) -> u32 {
        Report::schema_version(self)
    }
    fn render_text(&self) -> String {
        Report::render_text(self)
    }
    fn envelope(&self) -> serde_json::Result<String> {
        envelope_json(Report::schema_version(self), Report::kind(self), self)
    }
}

/// A successful result and the exit code the run ends with; the document is
/// printed as for exit 0, not as an error document.
///
/// A handler returns anything that converts into one: a [`Report`] or a
/// `Box<dyn DynReport>` (exit 0), or an `Outcome` from [`Report::with_exit`].
pub struct Outcome {
    report: Box<dyn DynReport>,
    exit: i32,
    written: bool,
}

impl Outcome {
    /// `report` with the exit code `exit`.
    pub fn new(report: impl Report + 'static, exit: i32) -> Self {
        Self {
            report: Box::new(report),
            exit,
            written: false,
        }
    }

    /// An outcome whose handler wrote all of stdout itself, in its own format:
    /// [`run`] prints nothing more, even under `--json`, and returns `exit`.
    pub fn written(exit: i32) -> Self {
        Self {
            report: Box::new(Written {}),
            exit,
            written: true,
        }
    }

    /// This outcome with a different exit code.
    #[must_use]
    pub fn with_exit(mut self, exit: i32) -> Self {
        self.exit = exit;
        self
    }

    /// The exit code the run ends with.
    pub fn exit(&self) -> i32 {
        self.exit
    }
}

impl<R: Report + 'static> From<R> for Outcome {
    fn from(report: R) -> Self {
        Self::new(report, Exit::Ok.code())
    }
}

impl From<Box<dyn DynReport>> for Outcome {
    fn from(report: Box<dyn DynReport>) -> Self {
        Self {
            report,
            exit: Exit::Ok.code(),
            written: false,
        }
    }
}

/// The report of [`Outcome::written`], never printed.
#[derive(Serialize)]
struct Written {}

impl Report for Written {
    fn kind(&self) -> &str {
        "written"
    }

    fn render_text(&self) -> String {
        String::new()
    }
}

/// Why a handler did not produce a [`Report`].
///
/// An [`io::Error`] does not convert with `?`, since it does not say what
/// failed: one from the handler's own work becomes [`Failure::io`], naming
/// what was being done; one from writing the tool's output becomes
/// [`CommandError::Io`].
///
/// ```compile_fail,E0277
/// fn handler() -> Result<(), cli_tool::CommandError> {
///     std::fs::read("settings.toml")?;
///     Ok(())
/// }
/// ```
///
/// ```
/// use cli_tool::{CommandError, Context, Failure};
/// use std::io::Write;
///
/// fn handler(ctx: &mut Context<'_>) -> Result<(), CommandError> {
///     let text = std::fs::read_to_string("settings.toml")
///         .map_err(|e| Failure::io("cannot read settings.toml", &e))?;
///     write!(ctx.io.out, "{text}").map_err(CommandError::Io)?;
///     Ok(())
/// }
/// ```
#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    /// A classified failure; exits with its class's code.
    #[error(transparent)]
    Failure(#[from] Failure),
    /// The command line parsed but cannot run as typed (a combination clap
    /// cannot see); exits with the usage code.
    #[error("{0}")]
    Usage(String),
    /// A failure with a code name and exit code the tool chooses: one of its
    /// own in the domain band, or `error` and 1 from [`CommandError::failed`].
    #[error("{message}")]
    Coded {
        /// The stable name for the error document.
        code: String,
        /// What went wrong.
        message: String,
        /// The exit code.
        exit: i32,
        /// What to do next.
        hint: Option<String>,
    },
    /// Writing to the tool's own output ([`Context::io`]) failed. A closed pipe
    /// ends the run quietly with exit 0, anything else as an ordinary failure;
    /// never use it for a pipe to a child process, whose closing is a failure.
    #[error("output failed: {0}")]
    Io(#[source] io::Error),
}

impl CommandError {
    /// An ordinary failed run: code `error`, exit 1.
    pub fn failed(message: impl Into<String>) -> Self {
        Self::Coded {
            code: "error".to_owned(),
            message: message.into(),
            exit: Exit::Error.code(),
            hint: None,
        }
    }
}

/// Run a command line: parse `argv` (program name first) as `P`, call
/// `handler`, and print its result. Returns the exit code; never ends the
/// process.
///
/// - `--help` and `--version` print on stdout and return 0.
/// - Another parse error prints clap's message on stderr and returns 2. With a
///   `--json` token in the raw argv before any `--`, the error document
///   (`code: "usage"`) also goes to stdout.
/// - A success prints [`Report::render_text`], or under `--json` the document,
///   and returns 0 or the [`Outcome`]'s code; an [`Outcome::written`] prints
///   nothing.
/// - A failure prints its message on stderr and returns its code: a
///   [`Failure`] its class's, [`CommandError::Usage`] 2, anything else 1 or
///   its own. A [`Failure`] is one line, message then hint; a
///   [`CommandError::Coded`] hint follows on its own lines. Under `--json` the
///   error document also goes to stdout.
/// - A closed stdout (`tool | head`) is not an error: the run keeps its code.
pub fn run<P, R, F, A>(argv: A, ctx: &mut Context<'_>, handler: F) -> i32
where
    P: Parser + HasGlobals,
    R: Into<Outcome>,
    F: FnOnce(&P, &mut Context<'_>) -> Result<R, CommandError>,
    A: IntoIterator,
    A::Item: Into<OsString>,
{
    let name = P::command().get_name().to_owned();
    let argv: Vec<OsString> = argv.into_iter().map(Into::into).collect();
    let wants_json = argv
        .iter()
        .skip(1)
        .take_while(|word| *word != "--")
        .any(|word| word == "--json");
    let parsed = match P::try_parse_from(&argv) {
        Ok(parsed) => parsed,
        Err(error) => {
            // clap renders help and version as "errors"; they are answers.
            let text = error.render().to_string();
            return match error.kind() {
                ErrorKind::DisplayHelp | ErrorKind::DisplayVersion => {
                    let _ = put(ctx.io.out, &text);
                    Exit::Ok.code()
                }
                _ => {
                    // clap's text is "error: <message>", a blank line, then
                    // tips and usage; all after the blank line is the hint.
                    let body = text.trim().trim_start_matches("error: ");
                    let (message, hint) = body.split_once("\n\n").unwrap_or((body, ""));
                    let shown = Shown {
                        code: "usage".to_owned(),
                        message: message.trim().to_owned(),
                        exit: Exit::Usage.code(),
                        hint: Some(hint.to_owned()),
                        stderr_text: text,
                    };
                    emit_error(ctx, wants_json, &shown)
                }
            };
        }
    };
    let json = parsed.globals().json;
    match handler(&parsed, ctx) {
        Ok(result) => print_report(&result.into(), json, &name, ctx),
        Err(error) => print_error(error, json, &name, ctx),
    }
}

/// Returns the outcome's exit code, or a failure's when the report does not
/// serialize or stdout fails.
fn print_report(outcome: &Outcome, json: bool, name: &str, ctx: &mut Context<'_>) -> i32 {
    if outcome.written {
        return outcome.exit;
    }
    let report = &outcome.report;
    let text = if json {
        match report.envelope().map(|doc| doc + "\n") {
            Ok(doc) => doc,
            Err(error) => {
                let message = format!("the result does not serialize: {error}");
                return print_error(CommandError::failed(message), json, name, ctx);
            }
        }
    } else {
        report.render_text()
    };
    match put(ctx.io.out, &text) {
        Ok(()) => outcome.exit,
        Err(error) => print_error(CommandError::Io(error), json, name, ctx),
    }
}

/// A failure ready for [`emit_error`]: its error document's fields and its
/// stderr text. Every failure a run can end with becomes one.
struct Shown {
    code: String,
    message: String,
    exit: i32,
    hint: Option<String>,
    /// Ends with a newline.
    stderr_text: String,
}

impl Shown {
    /// A failure that is not a [`Failure`]: the message on one line, then a
    /// hint that is not blank on lines of its own.
    fn plain(code: &str, message: String, exit: i32, hint: Option<String>, name: &str) -> Self {
        let mut stderr_text = render_error(&message, Some(name));
        if let Some(hint) = hint.as_deref().filter(|h| !h.trim().is_empty()) {
            stderr_text.push_str(&safe(hint));
            if !stderr_text.ends_with('\n') {
                stderr_text.push('\n');
            }
        }
        Self {
            code: code.to_owned(),
            message,
            exit,
            hint,
            stderr_text,
        }
    }
}

/// Print a handler's failure. Returns the exit code.
fn print_error(error: CommandError, json: bool, name: &str, ctx: &mut Context<'_>) -> i32 {
    let shown = match error {
        CommandError::Failure(f) => Shown {
            exit: f.exit_code(),
            stderr_text: f.render(Some(name)),
            code: f.kind,
            message: f.message,
            hint: f.hint,
        },
        CommandError::Usage(message) => {
            Shown::plain("usage", message, Exit::Usage.code(), None, name)
        }
        CommandError::Coded {
            code,
            message,
            exit,
            hint,
        } => Shown::plain(&code, message, exit, hint, name),
        CommandError::Io(error) if error.kind() == io::ErrorKind::BrokenPipe => {
            return Exit::Ok.code();
        }
        CommandError::Io(error) => Shown::plain(
            "error",
            format!("output failed: {error}"),
            Exit::Error.code(),
            None,
            name,
        ),
    };
    emit_error(ctx, json, &shown)
}

/// Print a failure: its text on stderr, and under `--json` the error document
/// on stdout too. Returns the exit code.
fn emit_error(ctx: &mut Context<'_>, json: bool, shown: &Shown) -> i32 {
    let _ = put(ctx.io.err, &shown.stderr_text);
    if json {
        let doc = ErrorDocument::new(
            &shown.code,
            &shown.message,
            shown.exit,
            shown.hint.as_deref(),
        );
        let _ = put(ctx.io.out, &(doc.to_json() + "\n"));
    }
    shown.exit
}

/// Write and flush `text`. A closed pipe counts as written: its reader has
/// what it wanted.
fn put(stream: &mut dyn Write, text: &str) -> io::Result<()> {
    match stream
        .write_all(text.as_bytes())
        .and_then(|()| stream.flush())
    {
        Err(error) if error.kind() == io::ErrorKind::BrokenPipe => Ok(()),
        other => other,
    }
}

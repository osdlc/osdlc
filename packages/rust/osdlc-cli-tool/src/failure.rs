//! How a CLI reports a classified failure: one line on stderr and one exit code
//! from a table every tool built on this crate shares.
//!
//! A library below the CLI reports a missing tool, a signed-out service or a
//! network failure as a [`Failure`] with a `kind`, a message and a hint.
//! Without this module each CLI would map those to a message and a number by
//! itself, and two tools would disagree.
//!
//! Failures are grouped into the categories a script acts on differently, with
//! one code each, see [`FailureClass`]. Every other kind is an ordinary failed
//! run and exits [`Exit::Error`].

use crate::exit::{EXIT_MISSING_TOOL, EXIT_REPOSITORY, EXIT_SERVICE, EXIT_UNREACHABLE, Exit};
use crate::safe::safe;

/// The category of a failure: what a script should do about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FailureClass {
    /// A program the run needs is not installed or cannot be run. Install it
    /// ([`EXIT_MISSING_TOOL`]).
    MissingTool,
    /// A service answered and refused, or its answer was unusable: not signed
    /// in, no token, not found, a certificate that fails TLS verification, an
    /// HTTP error. Fix the credentials or the name; retrying will not help
    /// ([`EXIT_SERVICE`]).
    Service,
    /// There is no repository, or no usable remote, to work on. Run it
    /// somewhere else, or name one ([`EXIT_REPOSITORY`]).
    Repository,
    /// The service could not be reached in time, or limited the caller. The
    /// same command may work later ([`EXIT_UNREACHABLE`]).
    Unreachable,
    /// Any other kind: an ordinary failed run ([`Exit::Error`]).
    Other,
}

impl FailureClass {
    /// The class of a failure `kind`. A kind not in the table is
    /// [`FailureClass::Other`].
    pub fn of_kind(kind: &str) -> Self {
        match kind {
            "not-installed" | "not-executable" => Self::MissingTool,
            "not-authenticated" | "missing-token" | "not-found" | "tls" | "http" | "unreadable"
            | "unsupported" => Self::Service,
            "not-a-repo" | "no-remote" | "bad-remote" | "bad-cwd" => Self::Repository,
            "network" | "remote-unreachable" | "timeout" | "rate-limited" => Self::Unreachable,
            _ => Self::Other,
        }
    }

    /// The exit code of this class.
    pub const fn exit_code(self) -> i32 {
        match self {
            Self::MissingTool => EXIT_MISSING_TOOL,
            Self::Service => EXIT_SERVICE,
            Self::Repository => EXIT_REPOSITORY,
            Self::Unreachable => EXIT_UNREACHABLE,
            Self::Other => Exit::Error.code(),
        }
    }
}

/// A classified failure: a stable `kind` a script can branch on, a message
/// for people, and optionally a hint (what to do next) and the raw detail.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{message}")]
pub struct Failure {
    /// A stable name such as `not-installed` or `rate-limited`.
    pub kind: String,
    /// One sentence saying what went wrong.
    pub message: String,
    /// What to do next, when there is something to do.
    pub hint: Option<String>,
    /// The raw tool output. Never printed by this crate.
    pub detail: Option<String>,
}

impl Failure {
    /// A failure with no hint or detail.
    pub fn new(kind: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            message: message.into(),
            hint: None,
            detail: None,
        }
    }

    /// This failure with a hint.
    #[must_use]
    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    /// This failure with raw detail.
    #[must_use]
    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }

    /// An [`io::Error`](std::io::Error) from the tool's own work (a file it
    /// reads, a process it feeds) as an ordinary failed run: kind `io`,
    /// message `<what>: <error>`. `what` says what was being done, such as
    /// `cannot read settings.toml`, which the error alone does not.
    pub fn io(what: impl std::fmt::Display, error: &std::io::Error) -> Self {
        Self::new("io", format!("{what}: {error}"))
    }

    /// The category of this failure's kind.
    pub fn class(&self) -> FailureClass {
        FailureClass::of_kind(&self.kind)
    }

    /// The exit code for this failure: its class's code, else [`Exit::Error`].
    pub fn exit_code(&self) -> i32 {
        self.class().exit_code()
    }

    /// One plain line for people: the message, then the hint when there is one.
    pub fn describe(&self) -> String {
        match self.hint.as_deref() {
            None | Some("") => self.message.clone(),
            Some(hint) => format!("{} {hint}", self.message),
        }
    }

    /// The one line a CLI prints for this failure: `<name>: <message> <hint>`
    /// with a newline, made safe as [`render_error`] makes it. Only the message
    /// and hint show; the raw detail is left to a caller that wants it.
    pub fn render(&self, name: Option<&str>) -> String {
        error_line(name, &self.message, self.hint.as_deref())
    }
}

/// The line a CLI prints for an error: `<name>: <message>` with a newline, and
/// terminal controls removed (line feeds and tabs stay). The message may quote
/// repository or service text, so printing it must not move the cursor,
/// recolor the terminal or set its title.
pub fn render_error(message: &str, name: Option<&str>) -> String {
    error_line(name, message, None)
}

/// `<name>: <message> <hint>` and a newline, leaving out a name or hint that
/// is absent or empty. Each part is made safe by itself and then joined: an
/// escape sequence that one part leaves unfinished would otherwise run on
/// through the next part and the newline.
fn error_line(name: Option<&str>, message: &str, hint: Option<&str>) -> String {
    let mut line = String::new();
    if let Some(name) = name.filter(|n| !n.is_empty()) {
        line.push_str(&safe(name));
        line.push_str(": ");
    }
    line.push_str(&safe(message));
    if let Some(hint) = hint.filter(|h| !h.is_empty()) {
        line.push(' ');
        line.push_str(&safe(hint));
    }
    line.push('\n');
    line
}

#[cfg(test)]
mod tests {
    use super::*;

    fn failure(kind: &str) -> Failure {
        Failure::new(kind, format!("{kind} happened."))
    }

    #[test]
    fn each_kind_exits_its_category_code() {
        let table = [
            ("not-installed", 22),
            ("not-executable", 22),
            ("not-authenticated", 23),
            ("missing-token", 23),
            ("not-found", 23),
            ("tls", 23),
            ("http", 23),
            ("unreadable", 23),
            ("unsupported", 23),
            ("not-a-repo", 24),
            ("no-remote", 24),
            ("bad-remote", 24),
            ("bad-cwd", 24),
            ("network", 25),
            ("remote-unreachable", 25),
            ("timeout", 25),
            ("rate-limited", 25),
        ];
        for (kind, code) in table {
            assert_eq!(failure(kind).exit_code(), code, "{kind}");
        }
    }

    #[test]
    fn ordinary_or_unknown_kinds_exit_1() {
        for kind in [
            "exit",
            "spawn",
            "signal",
            "aborted",
            "output-cap",
            "something-new",
            "toString",
        ] {
            assert_eq!(failure(kind).exit_code(), 1, "{kind}");
            assert_eq!(failure(kind).class(), FailureClass::Other);
        }
    }

    #[test]
    fn an_io_error_becomes_an_ordinary_failure_that_says_what_was_being_done() {
        let gone = std::io::Error::from(std::io::ErrorKind::BrokenPipe);
        let f = Failure::io("cannot write to the helper", &gone);
        assert_eq!(f.kind, "io");
        assert_eq!(f.message, format!("cannot write to the helper: {gone}"));
        assert_eq!(f.exit_code(), 1);
    }

    #[test]
    fn the_four_categories_are_distinct_and_in_the_domain_band() {
        let codes = [
            FailureClass::MissingTool,
            FailureClass::Service,
            FailureClass::Repository,
            FailureClass::Unreachable,
        ]
        .map(FailureClass::exit_code);
        for (i, a) in codes.iter().enumerate() {
            assert!(crate::exit::is_domain_exit(*a));
            for b in &codes[i + 1..] {
                assert_ne!(a, b);
            }
        }
    }

    #[test]
    fn render_is_one_line_message_then_hint_and_never_the_detail() {
        let f = Failure::new("network", "network happened.")
            .with_hint("Check your network.")
            .with_detail("dial tcp: lookup x");
        assert_eq!(
            f.render(Some("tooly")),
            "tooly: network happened. Check your network.\n"
        );
        assert_eq!(failure("exit").render(None), "exit happened.\n");
    }

    #[test]
    fn render_error_names_the_tool_and_strips_controls() {
        assert_eq!(
            render_error("bad thing", Some("tooly")),
            "tooly: bad thing\n"
        );
        assert_eq!(render_error("bad thing", None), "bad thing\n");
        assert_eq!(
            render_error("a\u{1b}[2Jb\u{9b}31mc\td\ne", Some("tooly")),
            "tooly: abc\td\ne\n"
        );
    }

    #[test]
    fn an_unfinished_escape_in_one_part_takes_nothing_from_the_next() {
        // Each of these ends in a sequence that never finishes: a title with
        // no terminator, a bare escape, a CSI with no final byte.
        for message in ["bad\u{1b}]0;pwned", "bad\u{1b}", "bad\u{9b}31"] {
            let f = Failure::new("not-found", message).with_hint("Check it.");
            assert_eq!(f.render(Some("tooly")), "tooly: bad Check it.\n");
            assert_eq!(f.render(None), "bad Check it.\n");
            assert_eq!(render_error(message, Some("tooly")), "tooly: bad\n");
            assert_eq!(render_error(message, None), "bad\n");
        }
        assert_eq!(render_error("bad", Some("to\u{9d}ol")), "to: bad\n");
    }

    #[test]
    fn render_strips_controls_from_message_and_hint() {
        let f =
            Failure::new("not-found", "no \u{1b}]0;pwned\u{7}x.").with_hint("Check \u{9b}2Jit.");
        assert_eq!(f.render(Some("tooly")), "tooly: no x. Check it.\n");
    }
}

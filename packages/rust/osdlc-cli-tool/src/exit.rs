//! What a CLI's exit code means.
//!
//! Three codes are universal: the run worked (0), it failed against the state
//! it found (1), or the command could not be run as typed (2). `2` is the same
//! in every tool, so a script can tell "fix the command line" from "look at the
//! state" without learning each tool's numbers.
//!
//! A tool that must tell apart outcomes of its work ("nothing to do" versus
//! "something failed") numbers them from [`DOMAIN_EXIT_MIN`] to
//! [`DOMAIN_EXIT_MAX`], avoiding the [`crate::FailureClass`] codes 22-25. Those
//! are outcomes, never other spellings of the universal codes.

/// The three universal exit codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Exit {
    /// The command did what it was asked (0).
    Ok,
    /// A well-formed command that failed against the state it found (1).
    Error,
    /// The command cannot run as typed, such as an unknown flag or a missing
    /// argument (2). Decided from the arguments alone, so a retry fails the
    /// same way.
    Usage,
}

impl Exit {
    /// The process exit code.
    pub const fn code(self) -> i32 {
        match self {
            Exit::Ok => 0,
            Exit::Error => 1,
            Exit::Usage => 2,
        }
    }
}

impl From<Exit> for i32 {
    fn from(exit: Exit) -> i32 {
        exit.code()
    }
}

/// First code a tool may use for an outcome of its own.
pub const DOMAIN_EXIT_MIN: i32 = 10;

/// Last such code: `sysexits.h` takes 64-78, and a shell 126 and up.
pub const DOMAIN_EXIT_MAX: i32 = 63;

/// A program the run needs is not installed or cannot be run.
pub const EXIT_MISSING_TOOL: i32 = 22;
/// A service refused the caller or gave an unusable answer.
pub const EXIT_SERVICE: i32 = 23;
/// There is no repository or remote to work on.
pub const EXIT_REPOSITORY: i32 = 24;
/// The service could not be reached, or limited the caller. Try again later.
pub const EXIT_UNREACHABLE: i32 = 25;

/// Whether `code` is in the range a tool may define meanings in.
pub const fn is_domain_exit(code: i32) -> bool {
    code >= DOMAIN_EXIT_MIN && code <= DOMAIN_EXIT_MAX
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_universal_codes_are_0_1_2() {
        assert_eq!(Exit::Ok.code(), 0);
        assert_eq!(Exit::Error.code(), 1);
        assert_eq!(Exit::Usage.code(), 2);
        assert_eq!(i32::from(Exit::Usage), 2);
    }

    #[test]
    fn domain_range_is_10_to_63() {
        assert!(!is_domain_exit(9));
        assert!(is_domain_exit(10));
        assert!(is_domain_exit(63));
        assert!(!is_domain_exit(64));
        assert!(!is_domain_exit(-1));
    }

    #[test]
    fn failure_codes_are_in_the_domain_range() {
        for code in [
            EXIT_MISSING_TOOL,
            EXIT_SERVICE,
            EXIT_REPOSITORY,
            EXIT_UNREACHABLE,
        ] {
            assert!(is_domain_exit(code));
        }
    }
}

//! The body of a `main`: the one place that touches the process.
//!
//! A command returns an exit code and never ends the process; this module turns
//! it into an [`ExitCode`] and flushes the real streams. Rust ignores `SIGPIPE`,
//! so a closed pipe (`tool list | head`) is a `BrokenPipe` write error, which
//! this crate's writers drop where `println!` would panic.

use std::io::{self, Write};
use std::process::ExitCode;

use crate::exit::Exit;
use crate::io::Context;

/// Run `f` with the process's context (real streams, directory, environment):
///
/// ```no_run
/// # use std::process::ExitCode;
/// fn main() -> ExitCode {
///     cli_tool::run_main(|ctx| {
///         // cli_tool::run::<Cli, _, _, _>(std::env::args_os(), ctx, handler)
///         # let _ = ctx;
///         0
///     })
/// }
/// ```
///
/// Neither stream is locked while `f` runs, so another thread (a worker, a
/// dependency's logger) can print meanwhile. Both are flushed before returning;
/// see [`settle`] for a flush error.
pub fn run_main<F>(f: F) -> ExitCode
where
    F: FnOnce(&mut Context<'_>) -> i32,
{
    let (mut out, mut err) = (io::stdout(), io::stderr());
    let code = f(&mut Context::from_process(&mut out, &mut err));
    let flushed = out.flush().and(err.flush());
    exit_code(settle(code, flushed))
}

/// The exit code after the flush: a closed pipe changes nothing; another flush
/// error turns a success into [`Exit::Error`].
pub fn settle(code: i32, flushed: io::Result<()>) -> i32 {
    match flushed {
        Err(error) if error.kind() != io::ErrorKind::BrokenPipe && code == Exit::Ok.code() => {
            Exit::Error.code()
        }
        _ => code,
    }
}

/// `code` as a process exit code; one outside 0..=255, which the OS cannot
/// report, becomes 1.
pub fn exit_code(code: i32) -> ExitCode {
    u8::try_from(code).map_or(ExitCode::FAILURE, ExitCode::from)
}

#[cfg(test)]
mod tests {
    use std::process::{Command, Stdio};
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    use super::*;

    const CHILD: &str = "main_shim::tests::child_prints_from_a_worker_thread_inside_run_main";

    /// Run uncaptured in a child process by the test below, so its prints take
    /// the real stream locks; a blocked print fails the child at the time limit.
    #[test]
    #[ignore = "run in a child process by another_thread_can_print_while_the_handler_runs"]
    fn child_prints_from_a_worker_thread_inside_run_main() {
        let code = run_main(|_ctx| {
            let (printed, wait) = mpsc::channel();
            thread::spawn(move || {
                println!("worker wrote to stdout");
                eprintln!("worker wrote to stderr");
                let _ = printed.send(());
            });
            i32::from(wait.recv_timeout(Duration::from_secs(20)).is_err())
        });
        assert_eq!(code, ExitCode::SUCCESS);
    }

    #[test]
    fn another_thread_can_print_while_the_handler_runs() {
        let child = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", CHILD, "--ignored", "--nocapture"])
            .stdin(Stdio::null())
            .output()
            .unwrap();
        let out = String::from_utf8_lossy(&child.stdout);
        assert!(child.status.success(), "{out}");
        // Proof the child ran the handler, not an empty filter.
        assert!(out.contains("worker wrote to stdout"), "{out}");
    }

    #[test]
    fn codes_in_range_pass_through_and_others_fail() {
        assert_eq!(exit_code(0), ExitCode::from(0));
        assert_eq!(exit_code(25), ExitCode::from(25));
        assert_eq!(exit_code(300), ExitCode::FAILURE);
        assert_eq!(exit_code(-1), ExitCode::FAILURE);
    }

    #[test]
    fn a_broken_pipe_on_flush_is_quiet() {
        let broken = || Err(io::Error::from(io::ErrorKind::BrokenPipe));
        assert_eq!(settle(0, broken()), 0);
        assert_eq!(settle(23, broken()), 23);
    }

    #[test]
    fn another_flush_error_fails_a_success_only() {
        let other = || Err(io::Error::other("disk full"));
        assert_eq!(settle(0, other()), 1);
        assert_eq!(settle(23, other()), 23);
        assert_eq!(settle(0, Ok(())), 0);
    }
}

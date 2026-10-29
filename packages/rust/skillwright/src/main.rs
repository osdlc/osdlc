//! The `skillwright` binary: real argv, real streams, and the exit code
//! [`skillwright::cli::run`] returns.
//!
//! Everything else is in the library, so the tests drive the same entry
//! point this does without spawning a process.

use std::io::Write;

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let stdout = std::io::stdout();
    let stderr = std::io::stderr();
    let mut out = stdout.lock();
    let mut err = stderr.lock();
    let code = skillwright::cli::run(&argv, &mut out, &mut err);
    let _ = out.flush();
    let _ = err.flush();
    std::process::exit(code);
}

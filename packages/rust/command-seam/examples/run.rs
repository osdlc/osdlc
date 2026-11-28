//! Run a program with a timeout, as a value and then checked.
//!
//! Run with `cargo run -p command-seam --example run`.

use std::time::Duration;

use command_seam::{CommandRunner, RunOptions, SpawnRunner, args, run_checked};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let echo = SpawnRunner::new("echo");
    let opts = RunOptions::default().timeout(Duration::from_secs(5));

    // A value: nothing fails here, the caller inspects it.
    let result = echo.run(&args(["hello"]), &opts);
    println!("timed out: {}", result.timed_out());

    // Checked: a non-zero exit, a missing program, a timeout or cut-off
    // output is an `Err`.
    let ok = run_checked(&echo, &args(["hello", "again"]), &opts)?;
    print!("{}", ok.stdout_lossy());
    Ok(())
}

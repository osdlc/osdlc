//! Writes `generated/core.generated.ts`, inside this crate, from the Rust
//! source.
//!
//! `cargo run -p tradecraft-typegen` regenerates. `--check` reports drift and
//! writes nothing, which is what a run inside an editor or a hook wants; CI
//! regenerates and diffs instead, so a red run hands the reviewer the patch.
//!
//! Paths are resolved from `CARGO_MANIFEST_DIR`, so the working directory does
//! not matter.

use tradecraft_typegen::{OUTPUT, emit, generate, read};

use std::path::{Path, PathBuf};
use std::process::ExitCode;

fn main() -> ExitCode {
    let check_only = std::env::args().any(|arg| arg == "--check");
    match run(check_only) {
        Ok(message) => {
            println!("{message}");
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("tradecraft-typegen: {message}");
            ExitCode::FAILURE
        }
    }
}

fn run(check_only: bool) -> Result<String, String> {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let rust_root = rust_root();
    let generated = generate(&rust_root)?;
    let output = crate_dir.join(OUTPUT);

    let current = std::fs::read_to_string(&output).unwrap_or_default();
    if current == generated {
        return Ok(format!("{OUTPUT} is up to date"));
    }
    if check_only {
        return Err(format!(
            "{OUTPUT} does not match the Rust source. Run `cargo run -p tradecraft-typegen`."
        ));
    }
    if let Some(dir) = output.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("creating {}: {e}", dir.display()))?;
    }
    std::fs::write(&output, &generated)
        .map_err(|e| format!("writing {}: {e}", output.display()))?;
    Ok(format!(
        "wrote {OUTPUT}\n{}",
        emit::summary(&read(&rust_root)?).join("\n")
    ))
}

/// The Cargo workspace directory, one level above this crate.
fn rust_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("the crate sits one level below the workspace directory")
        .to_path_buf()
}

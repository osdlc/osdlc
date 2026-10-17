//! Read, change and write a file without losing a concurrent edit.
//!
//! Run with `cargo run --example counter`. It bumps a counter in a file,
//! simulates another writer changing the file between the read and the
//! write, sees the conflict, re-reads and retries.

use std::fs;
use std::path::Path;

use etag_write::{WriteError, etag, etag_of_file, write_atomic, write_cas, write_if_changed};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

fn bump(path: &Path, mut interfere: bool) -> Result<u64> {
    loop {
        let bytes = fs::read(path)?;
        let seen = etag(&bytes);
        let n: u64 = String::from_utf8_lossy(&bytes).trim().parse().unwrap_or(0);

        if interfere {
            // Another writer gets in between our read and our write.
            write_atomic(path, b"100\n")?;
            interfere = false;
        }

        let next = n + 1;
        match write_cas(path, format!("{next}\n").as_bytes(), Some(&seen)) {
            Ok(_) => return Ok(next),
            Err(WriteError::Conflict { .. }) => {
                println!("conflict: the file changed since it was read; retrying");
            }
            Err(e) => return Err(e.into()),
        }
    }
}

fn main() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let path = dir.path().join("counter.txt");

    // First write: no file yet, so no etag.
    write_cas(&path, b"0\n", None)?;
    println!("created, etag {}", etag_of_file(&path)?.unwrap_or_default());

    println!("bumped to {}", bump(&path, false)?);
    println!("bumped to {}", bump(&path, true)?);

    // Writing the same bytes again leaves the file (and its mtime) alone.
    let current = fs::read(&path)?;
    let wrote = write_if_changed(&path, &current)?;
    println!("rewrite of identical bytes wrote: {wrote}");
    Ok(())
}

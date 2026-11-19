//! Bump a counter file under the lock, `times` times:
//!
//! ```sh
//! cargo run -p osdlc-file-lock --example interop-counter -- <counter> <lock> <times>
//! ```
//!
//! Each bump re-reads the counter, adds one and writes it back. Run several at
//! once, alongside `@osdlc/file-lock`'s `withLock` doing the same, and no bump
//! is lost: the two take turns on one lock file.

use std::path::PathBuf;
use std::time::Duration;

use osdlc_file_lock::{LockOptions, with_lock};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let (Some(counter), Some(lock), Some(times)) = (args.next(), args.next(), args.next()) else {
        return Err("usage: interop-counter <counter> <lock> <times>".into());
    };
    let (counter, lock) = (PathBuf::from(counter), PathBuf::from(lock));
    let options = LockOptions::new().timeout(Duration::from_secs(60));
    for _ in 0..times.parse::<u32>()? {
        with_lock(&lock, &options, || -> std::io::Result<()> {
            let n: u64 = std::fs::read_to_string(&counter)?
                .trim()
                .parse()
                .unwrap_or(0);
            std::thread::sleep(Duration::from_millis(1)); // widen the read-to-write window
            std::fs::write(&counter, (n + 1).to_string())
        })??;
    }
    Ok(())
}

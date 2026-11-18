//! Cross-process exclusive file locks, on the same protocol as the npm package
//! `@osdlc/file-lock`, so a Rust process and a Node.js process can take turns
//! holding one lock file.
//!
//! There are two shapes, built on one mechanism:
//!
//! - **A held lock**, [`claim_lock`], for something a process owns for as long
//!   as it runs. The lock names its holder, and you choose when a holder counts
//!   as gone. [`touch_lock`], [`update_lock`] and [`release_lock`] act only
//!   while the lock still holds the claim's token.
//! - **A short critical section**, [`with_lock`], for a re-read, check and
//!   rewrite of one file that two processes may do at once.
//!
//! A claim writes the whole content to a temp file and hard-links it into
//! place, so the lock never exists empty. A stale lock is taken over through a
//! marker that only one reaper can create, and it is removed only if it still
//! reads exactly as it did when it was judged stale.
//!
//! ```
//! use std::time::Duration;
//!
//! use osdlc_file_lock::{LockOptions, with_lock};
//!
//! let dir = tempfile::tempdir()?;
//! let counter = dir.path().join("counter");
//! std::fs::write(&counter, "0")?;
//! let options = LockOptions::new().timeout(Duration::from_secs(5));
//! with_lock(&dir.path().join("counter.lock"), &options, || -> std::io::Result<()> {
//!     let n: u32 = std::fs::read_to_string(&counter)?.parse().unwrap_or(0);
//!     std::fs::write(&counter, (n + 1).to_string())
//! })??;
//! assert_eq!(std::fs::read_to_string(&counter)?, "1");
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```
//!
//! One machine only: `link()` and `rename()` must be atomic, so network file
//! systems are not supported, and a file system without hard links fails the
//! claim with the error `link()` gives.

mod held;
mod rules;
mod section;

pub use held::{
    HeldLock, LockClaim, LockContent, MARKER_STALE, StaleRule, claim_lock, marker_for,
    release_lock, touch_lock, update_lock,
};
pub use rules::{untouched_for, untouched_for_at};
pub use section::{LockError, LockOptions, with_lock};

/// Runs the README's code blocks as doc-tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;

//! Time as a port, in unix seconds, so window and replay tests need not sleep.

use std::sync::atomic::{AtomicI64, Ordering};

/// A source of the current time, in whole seconds since the Unix epoch.
///
/// [`Signer`](crate::Signer) and [`Verifier`](crate::Verifier) take one so a test can move time by
/// hand ([`ManualClock`]) and production uses [`SystemClock`].
pub trait Clock: Send + Sync {
    /// Seconds since 1970-01-01T00:00:00Z.
    fn now_unix(&self) -> i64;
}

/// The wall clock. A system clock set before 1970 reads as 0, which makes every request stale
/// (the verifier fails closed); one past `i64::MAX` seconds reads as `i64::MAX`.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_unix(&self) -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
    }
}

/// A clock a test moves by hand. It never moves on its own.
#[derive(Debug, Default)]
pub struct ManualClock(AtomicI64);

impl ManualClock {
    /// A clock that reads `now_unix` until it is moved.
    pub fn new(now_unix: i64) -> Self {
        Self(AtomicI64::new(now_unix))
    }

    /// Set the clock to `now_unix`.
    pub fn set(&self, now_unix: i64) {
        self.0.store(now_unix, Ordering::SeqCst);
    }

    /// Move the clock by `secs` (negative to move it back).
    pub fn advance(&self, secs: i64) {
        self.0.fetch_add(secs, Ordering::SeqCst);
    }
}

impl Clock for ManualClock {
    fn now_unix(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
}

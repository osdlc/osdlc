//! The time source a cache asks "how long ago was that".
//!
//! A cache with a time-to-live needs the current time, and
//! `std::time::Instant::now` and `SystemTime::now` panic on
//! `wasm32-unknown-unknown`. So the time comes from the host, through
//! [`Clock`]. [`SystemClock`] is the real one for native hosts. [`FixedClock`]
//! is a clock a test moves by hand, so a test of a time-to-live does not sleep.

use std::cell::Cell;

/// Milliseconds since the Unix epoch, as the host knows them.
///
/// Only differences between two readings are meaningful to the caches that
/// use this, so a host whose clock starts elsewhere (a page's
/// `performance.now()`, say) is fine as long as it never goes backwards.
pub trait Clock {
    /// The current time in milliseconds.
    fn now_ms(&self) -> i64;
}

/// The system clock, `SystemTime::now()`. Native hosts only:
/// `wasm32-unknown-unknown` has no clock to read.
#[cfg(feature = "native")]
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

#[cfg(feature = "native")]
impl Clock for SystemClock {
    fn now_ms(&self) -> i64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(d) => i64::try_from(d.as_millis()).unwrap_or(i64::MAX),
            Err(e) => -i64::try_from(e.duration().as_millis()).unwrap_or(i64::MAX),
        }
    }
}

/// A clock that only moves when told to.
#[derive(Debug, Default)]
pub struct FixedClock {
    now: Cell<i64>,
}

impl FixedClock {
    /// A clock that reads `now_ms` until it is moved.
    pub fn new(now_ms: i64) -> Self {
        Self {
            now: Cell::new(now_ms),
        }
    }

    /// Sets the time.
    pub fn set(&self, now_ms: i64) {
        self.now.set(now_ms);
    }

    /// Moves the time forward by `ms`.
    pub fn advance(&self, ms: i64) {
        self.now.set(self.now.get() + ms);
    }
}

impl Clock for FixedClock {
    fn now_ms(&self) -> i64 {
        self.now.get()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fixed_clock_moves_only_when_told() {
        let clock = FixedClock::new(1_000);
        assert_eq!(clock.now_ms(), 1_000);
        clock.advance(500);
        assert_eq!(clock.now_ms(), 1_500);
        clock.set(7);
        assert_eq!(clock.now_ms(), 7);
    }

    #[cfg(feature = "native")]
    #[test]
    fn the_system_clock_is_after_2020() {
        assert!(SystemClock.now_ms() > 1_577_836_800_000);
    }
}

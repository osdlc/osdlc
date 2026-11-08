//! Ready-made staleness rules for [`claim_lock`](crate::claim_lock).

use std::time::{Duration, SystemTime};

use crate::held::HeldLock;

/// Stale once the lock has not been written or touched for longer than
/// `limit`. A live holder whose work outlasts `limit` loses the lock, so keep
/// `limit` far above the longest hold, or refresh the lock with
/// [`touch_lock`](crate::touch_lock). A lock whose mtime is in the future is
/// not stale.
pub fn untouched_for(limit: Duration) -> impl Fn(&HeldLock) -> bool + Clone + Send + Sync {
    untouched_for_at(limit, SystemTime::now)
}

/// [`untouched_for`] with the clock passed in.
pub fn untouched_for_at(
    limit: Duration,
    now: impl Fn() -> SystemTime + Clone + Send + Sync,
) -> impl Fn(&HeldLock) -> bool + Clone + Send + Sync {
    move |held: &HeldLock| {
        now()
            .duration_since(held.modified)
            .is_ok_and(|age| age > limit)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn held_at(modified: SystemTime) -> HeldLock {
        HeldLock {
            content: None,
            modified,
            raw: String::new(),
        }
    }

    #[test]
    fn stale_once_untouched_for_longer_than_the_limit() {
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000);
        let at = |secs| move || t0 + Duration::from_secs(secs);
        let limit = Duration::from_secs(10);
        assert!(!untouched_for_at(limit, at(10))(&held_at(t0)));
        assert!(untouched_for_at(limit, at(11))(&held_at(t0)));
    }

    #[test]
    fn a_lock_from_the_future_is_not_stale() {
        let later = SystemTime::now() + Duration::from_secs(3_600);
        assert!(!untouched_for(Duration::ZERO)(&held_at(later)));
    }
}

//! File timestamps in the representation node speaks: node's
//! `statSync()` millisecond floats.
//!
//! # Why the arithmetic is spelled out rather than `as_secs_f64`
//!
//! Node computes `mtimeMs` in `node_file.cc` as `sec * 1000 + nsec / 1000000`
//! in `double` arithmetic. Computing it as `as_secs_f64() * 1000.0` — the
//! obvious one-liner — divides once and multiplies once more, and the extra
//! rounding lands in the last ulp for most real files.
//!
//! That is not academic. A signature cache that tests usability
//! with `cached.mtimeMs == file.mtimeMs`, an **exact** float comparison, so a
//! one-ulp difference invalidates every cache entry the other arm wrote and
//! re-derives the whole vault. Same two operations, same order, same types is
//! the whole requirement.
//!
//! One implementation, in the crate that owns `stat`. A second one is a trap:
//! the index's `system_time_ms` used the `as_secs_f64` form and was safe only
//! because its callers rounded to whole milliseconds first, and nothing said
//! so.

use std::fs::Metadata;
use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the epoch, node's arithmetic exactly.
///
/// Pre-1970 timestamps exist on restored archives; node reports them negative
/// rather than clamping, so this does too.
pub fn ms_since_epoch(t: SystemTime) -> f64 {
    match t.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_secs() as f64 * 1000.0 + f64::from(d.subsec_nanos()) / 1_000_000.0,
        Err(e) => {
            let d = e.duration();
            -(d.as_secs() as f64 * 1000.0 + f64::from(d.subsec_nanos()) / 1_000_000.0)
        }
    }
}

/// `statSync().mtimeMs`. `0.0` when the platform cannot supply one — which a
/// cache must treat as never-fresh rather than as a valid timestamp.
pub fn mtime_ms(meta: &Metadata) -> f64 {
    meta.modified().map(ms_since_epoch).unwrap_or(0.0)
}

/// `st.birthtimeMs || st.ctimeMs` — birthtime where the platform has it,
/// falling back to mtime.
///
/// JavaScript's `||` also falls through on `0`, which is what a filesystem
/// without birthtime reports, so the fallback is not merely a null check.
pub fn created_ms(meta: &Metadata) -> f64 {
    let birth = meta.created().map(ms_since_epoch).unwrap_or(0.0);
    if birth != 0.0 {
        return birth;
    }
    mtime_ms(meta)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn the_arithmetic_is_nodes_and_not_the_convenient_one() {
        // The divergence this module exists to prevent, on a timestamp whose
        // nanoseconds do not divide evenly: `as_secs_f64() * 1000.0` rounds
        // twice and lands elsewhere.
        let t = UNIX_EPOCH + Duration::new(1_784_508_521, 15_838);
        let ours = ms_since_epoch(t);
        let convenient = t.duration_since(UNIX_EPOCH).unwrap().as_secs_f64() * 1000.0;
        assert_ne!(
            ours.to_bits(),
            convenient.to_bits(),
            "if these agree the fixture no longer exercises the difference"
        );
        assert_eq!(ours, 1_784_508_521_000.015_9);
        assert_eq!(convenient, 1_784_508_521_000.015_6);
    }

    #[test]
    fn a_pre_epoch_timestamp_is_negative_rather_than_clamped() {
        let t = UNIX_EPOCH - Duration::from_millis(1500);
        assert_eq!(ms_since_epoch(t), -1500.0);
    }

    #[test]
    fn created_falls_back_to_mtime_when_birthtime_is_absent() {
        // Not asserting WHICH is used — that is the platform's business — only
        // that a real file gets a real timestamp from either path.
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.md");
        std::fs::write(&p, "x").unwrap();
        let meta = std::fs::metadata(&p).unwrap();
        assert!(created_ms(&meta) > 0.0);
        assert!(mtime_ms(&meta) > 0.0);
    }
}

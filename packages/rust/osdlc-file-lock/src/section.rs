//! The short critical section: hold a lock for the length of a closure, such
//! as a re-read, validate and rewrite of one file.

use std::fmt;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::held::{HeldLock, LockClaim, PreparedClaim, release_lock};
use crate::rules::untouched_for;

/// What a [`with_lock`] lock records: the holder's pid.
#[derive(serde::Serialize)]
struct SectionHolder {
    pid: u32,
}

type Rule = Box<dyn Fn(&HeldLock) -> bool + Send + Sync>;

/// Options for [`with_lock`]. The defaults match `@osdlc/file-lock`'s
/// `withLock`: a 10 s stale age, a 30 s timeout and a 5 ms retry.
pub struct LockOptions {
    stale: Duration,
    timeout: Duration,
    retry: Duration,
    is_stale: Option<Rule>,
}

impl Default for LockOptions {
    fn default() -> Self {
        Self {
            stale: Duration::from_secs(10),
            timeout: Duration::from_secs(30),
            retry: Duration::from_millis(5),
            is_stale: None,
        }
    }
}

impl fmt::Debug for LockOptions {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LockOptions")
            .field("stale", &self.stale)
            .field("timeout", &self.timeout)
            .field("retry", &self.retry)
            .field("is_stale", &self.is_stale.as_ref().map(|_| "custom"))
            .finish()
    }
}

impl LockOptions {
    /// The defaults.
    pub fn new() -> Self {
        Self::default()
    }

    /// A lock untouched for longer than this is a dead holder's and is taken
    /// over. Unused when [`is_stale`](Self::is_stale) sets a rule.
    pub fn stale(mut self, stale: Duration) -> Self {
        self.stale = stale;
        self
    }

    /// Give up with [`LockError::Timeout`] after waiting this long. Zero
    /// tries once.
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// The pause between attempts.
    pub fn retry(mut self, retry: Duration) -> Self {
        self.retry = retry;
        self
    }

    /// Replaces the age rule: when a held lock may be taken over.
    pub fn is_stale(mut self, rule: impl Fn(&HeldLock) -> bool + Send + Sync + 'static) -> Self {
        self.is_stale = Some(Box::new(rule));
        self
    }
}

/// Why [`with_lock`] did not run the closure.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum LockError {
    /// The lock stayed held for the whole timeout.
    #[error("timed out waiting for lock {}", path.display())]
    Timeout {
        /// The lock that stayed held.
        path: PathBuf,
        /// The holder seen last, or `None` when the lock kept changing.
        holder: Option<HeldLock>,
    },
    /// Writing the claim file or linking it failed, for a reason other than
    /// "already held": a missing directory, a read-only file system.
    #[error("cannot take lock {}: {source}", path.display())]
    Io {
        /// The lock.
        path: PathBuf,
        /// The error.
        source: io::Error,
    },
}

/// Releases the lock when the section ends, also when it panics.
struct Release<'a> {
    path: &'a Path,
    token: String,
}

impl Drop for Release<'_> {
    fn drop(&mut self) {
        // Best effort: a lock that cannot be removed is taken over once stale.
        let _ = release_lock(self.path, &self.token);
    }
}

/// Run `f` holding the lock at `path`, and release it when `f` returns or
/// panics. The lock records this process's pid. Waiting blocks the thread,
/// so keep the section short.
///
/// When the lock cannot be taken, `f` is not called and the error says why.
/// A release that fails after `f` ran is not reported: the lock is then left
/// for the staleness rule to take over, and `f`'s result is returned.
///
/// By default a lock untouched for the stale age is taken to be a killed
/// holder's. A live holder whose section outlasts it loses its lock to the
/// next waiter, and both then run. Keep the stale age far above the longest
/// section, or set a rule that does not guess by age.
pub fn with_lock<T>(
    path: &Path,
    options: &LockOptions,
    f: impl FnOnce() -> T,
) -> Result<T, LockError> {
    let io_error = |source| LockError::Io {
        path: path.to_path_buf(),
        source,
    };
    let age_rule;
    let is_stale: &dyn Fn(&HeldLock) -> bool = match &options.is_stale {
        Some(rule) => rule,
        None => {
            age_rule = untouched_for(options.stale);
            &age_rule
        }
    };
    let deadline = Instant::now() + options.timeout;
    // The temp file is written once; each retry only tries the link again.
    let prepared = PreparedClaim::new(
        path,
        &SectionHolder {
            pid: std::process::id(),
        },
    )
    .map_err(io_error)?;
    let token = loop {
        match prepared.attempt(is_stale).map_err(io_error)? {
            LockClaim::Claimed { token } => break token,
            LockClaim::Held { holder } => {
                let now = Instant::now();
                if now >= deadline {
                    return Err(LockError::Timeout {
                        path: path.to_path_buf(),
                        holder,
                    });
                }
                std::thread::sleep(options.retry.min(deadline - now));
            }
        }
    };
    drop(prepared);
    let _release = Release { path, token };
    Ok(f())
}

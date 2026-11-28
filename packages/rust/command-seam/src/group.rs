//! Process groups: the handle that stops them and the stop sequence.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// How long a process group has between SIGTERM and SIGKILL when the run sets
/// no `kill_grace`.
pub const DEFAULT_KILL_GRACE: Duration = Duration::from_secs(1);

/// A handle shared by runs started in their own process group, and the way to
/// stop them. Clones share one state and compare equal.
#[derive(Debug, Clone, Default)]
pub struct ProcessGroups {
    stopped: Arc<AtomicBool>,
}

impl ProcessGroups {
    /// A handle on which `stop_all` has not been called.
    pub fn new() -> Self {
        Self::default()
    }

    /// Stops every run started with this handle, now and from now on. Returns
    /// at once; each run stops its own group within its `kill_grace` plus one
    /// poll, and returns up to a second later while a process that has left
    /// the group holds a pipe. Off unix a run kills its child alone.
    pub fn stop_all(&self) {
        self.stopped.store(true, Ordering::SeqCst);
    }

    /// Whether `stop_all` has been called on this handle or a clone of it.
    pub fn is_stopped(&self) -> bool {
        self.stopped.load(Ordering::SeqCst)
    }

    /// The flag `stop_all` sets, for a signal action to set.
    #[cfg(unix)]
    pub(crate) fn stopped_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.stopped)
    }
}

impl PartialEq for ProcessGroups {
    fn eq(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.stopped, &other.stopped)
    }
}

impl Eq for ProcessGroups {}

/// Stops the child's process group: SIGTERM, then SIGKILL if the group is not
/// empty after `grace`. Returns the leader's status, when reaped, and the last
/// signal sent. An error other than "no such process" kills the child alone.
#[cfg(unix)]
pub(crate) fn stop_group(
    child: &mut std::process::Child,
    grace: Duration,
) -> (Option<std::process::ExitStatus>, i32) {
    use rustix::io::Errno;
    use rustix::process::{Pid, Signal, kill_process_group, test_kill_process_group};
    use std::time::Instant;

    const SIGTERM: i32 = 15;
    const SIGKILL: i32 = 9;
    const POLL: Duration = Duration::from_millis(20);

    let fallback = |child: &mut std::process::Child, status: Option<std::process::ExitStatus>| {
        let _ = child.kill();
        (status.or_else(|| child.wait().ok()), SIGKILL)
    };

    let pgid = Pid::from_child(child);
    match kill_process_group(pgid, Signal::TERM) {
        Ok(()) | Err(Errno::SRCH) => {}
        Err(_) => return fallback(child, None),
    }

    let deadline = Instant::now().checked_add(grace);
    let mut status = None;
    loop {
        if status.is_none() {
            match child.try_wait() {
                Ok(s) => status = s,
                Err(_) => return fallback(child, None),
            }
        }
        if status.is_some() && test_kill_process_group(pgid) == Err(Errno::SRCH) {
            return (status, SIGTERM);
        }
        let now = Instant::now();
        if deadline.is_some_and(|d| now >= d) {
            break;
        }
        let nap = deadline.map_or(POLL, |d| (d - now).min(POLL));
        std::thread::sleep(nap);
    }

    match kill_process_group(pgid, Signal::KILL) {
        Ok(()) | Err(Errno::SRCH) => {}
        Err(_) => return fallback(child, status),
    }
    (status.or_else(|| child.wait().ok()), SIGKILL)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clones_are_equal_and_a_fresh_handle_is_not() {
        let a = ProcessGroups::new();
        assert_eq!(a, a.clone());
        assert_ne!(a, ProcessGroups::new());
    }

    #[test]
    fn stop_all_on_one_clone_is_seen_on_another() {
        let a = ProcessGroups::new();
        let b = a.clone();
        assert!(!b.is_stopped());
        a.stop_all();
        assert!(b.is_stopped());
    }
}

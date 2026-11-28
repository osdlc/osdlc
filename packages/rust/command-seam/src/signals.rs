//! Opt-in forwarding of SIGINT, SIGTERM and SIGHUP to [`ProcessGroups::stop_all`].
//!
//! A child that leads its own process group does not get the terminal's Ctrl-C. Without this, a
//! signal ends the host by the default action and leaves the groups running with no parent.

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use crate::group::ProcessGroups;

/// What a forwarded signal leaves for the host to read. Clones share one state, and every
/// `Forwarded` the process has been given reports the same signal.
#[derive(Debug, Clone)]
pub struct Forwarded {
    /// The first signal's number (see [`Forwarded::signal`]); 0 while none has come.
    signal: Arc<AtomicUsize>,
}

impl Forwarded {
    fn new() -> Self {
        Forwarded {
            signal: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// The first signal forwarded, or `None` before one. Two signals within one run of the
    /// signal handler may both count as the first; the later one's number is kept.
    pub fn signal(&self) -> Option<i32> {
        match self.signal.load(Ordering::SeqCst) {
            0 => None,
            n => i32::try_from(n).ok(),
        }
    }

    /// `128 + signal`, the shell's convention, or `None` while no signal has been forwarded.
    pub fn exit_code(&self) -> Option<i32> {
        self.signal().map(|signal| 128 + signal)
    }
}

impl ProcessGroups {
    /// From this call to the end of the process, SIGINT, SIGTERM and SIGHUP call
    /// [`stop_all`](Self::stop_all) on this handle instead of ending the process. The host reads
    /// [`Forwarded::signal`] once its runs have returned, and exits with
    /// [`Forwarded::exit_code`].
    ///
    /// A second signal, of any of the three, ends the process by its default action, so a host
    /// blocked outside a run can still be ended from the keyboard. Runs in flight send their
    /// groups SIGTERM within one poll of the first signal; a group that ignores it can outlive the
    /// host.
    ///
    /// A signal ignored at the first call (under `nohup`, or SIGINT in a background job of a
    /// non-interactive shell) stays ignored. That is read from `/proc/self/status`, so on Linux
    /// only; elsewhere, or when that file cannot be read, all three are registered and `nohup`
    /// does not keep a hangup from stopping the runs.
    ///
    /// There is no uninstall: call it at the program's start. A later call, on any handle, adds
    /// that handle: the first signal stops every handle added, and every `Forwarded` reports it.
    /// A handle added after a signal is stopped at once.
    ///
    /// Off unix it does nothing, and the `Forwarded` never reports a signal.
    ///
    /// # Errors
    /// Registering a signal action failed; some may already be registered.
    pub fn stop_on_signals(&self) -> std::io::Result<Forwarded> {
        imp::stop_on_signals(self)
    }
}

#[cfg(unix)]
mod imp {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, PoisonError};

    use signal_hook::consts::{SIGHUP, SIGINT, SIGTERM};
    use signal_hook::flag;

    use super::Forwarded;
    use crate::group::ProcessGroups;

    const SIGNALS: [i32; 3] = [SIGINT, SIGTERM, SIGHUP];

    /// Process-wide state, registered once. Every handle is registered for `signals`, those not
    /// ignored at the first call.
    struct Installed {
        seen: Arc<AtomicBool>,
        forwarded: Forwarded,
        signals: Vec<i32>,
    }

    static INSTALLED: Mutex<Option<Installed>> = Mutex::new(None);

    pub(super) fn stop_on_signals(groups: &ProcessGroups) -> std::io::Result<Forwarded> {
        let mut installed = INSTALLED.lock().unwrap_or_else(PoisonError::into_inner);
        let state = match installed.take() {
            Some(state) => state,
            None => install()?,
        };
        let seen = Arc::clone(&state.seen);
        let forwarded = state.forwarded.clone();
        let signals = state.signals.clone();
        *installed = Some(state);
        for signal in signals {
            flag::register(signal, groups.stopped_flag())?;
        }
        // A signal that came before this handle's actions were registered did not reach it.
        if seen.load(Ordering::SeqCst) {
            groups.stop_all();
        }
        Ok(forwarded)
    }

    /// Registers, for each signal not ignored and in this order (signal-hook runs a signal's
    /// actions in registration order): the default action if `seen` is set; recording the
    /// number; setting `seen`. Once any action is registered the default no longer runs by
    /// itself, so the first signal only records and a later one runs the default.
    fn install() -> std::io::Result<Installed> {
        let seen = Arc::new(AtomicBool::new(false));
        let forwarded = Forwarded::new();
        let ignored = ignored();
        let signals: Vec<i32> = SIGNALS
            .into_iter()
            .filter(|signal| !ignored.contains(signal))
            .collect();
        for &signal in &signals {
            flag::register_conditional_default(signal, Arc::clone(&seen))?;
            let number = usize::try_from(signal).map_err(std::io::Error::other)?;
            flag::register_usize(signal, Arc::clone(&forwarded.signal), number)?;
            flag::register(signal, Arc::clone(&seen))?;
        }
        Ok(Installed {
            seen,
            forwarded,
            signals,
        })
    }

    /// Which of [`SIGNALS`] the process ignores now, from the `SigIgn` mask of `/proc/self/status`
    /// (bit `n - 1` for signal `n`). Empty when that cannot be read: none is taken as ignored.
    #[cfg(target_os = "linux")]
    fn ignored() -> Vec<i32> {
        std::fs::read_to_string("/proc/self/status")
            .ok()
            .and_then(|status| ignored_in(&status))
            .unwrap_or_default()
    }

    /// Elsewhere there is no safe way to ask: none is taken as ignored.
    #[cfg(not(target_os = "linux"))]
    fn ignored() -> Vec<i32> {
        Vec::new()
    }

    /// The signals of [`SIGNALS`] whose bit is set in the `SigIgn` line of `status`, the text of
    /// `/proc/<pid>/status`; `None` without such a line or when its mask does not parse.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    pub(super) fn ignored_in(status: &str) -> Option<Vec<i32>> {
        let mask = status
            .lines()
            .find_map(|line| line.strip_prefix("SigIgn:"))
            .and_then(|hex| u64::from_str_radix(hex.trim(), 16).ok())?;
        Some(
            SIGNALS
                .into_iter()
                .filter(|&signal| {
                    u32::try_from(signal - 1)
                        .ok()
                        .and_then(|bit| mask.checked_shr(bit))
                        .is_some_and(|shifted| shifted & 1 == 1)
                })
                .collect(),
        )
    }
}

#[cfg(not(unix))]
mod imp {
    use super::Forwarded;
    use crate::group::ProcessGroups;

    pub(super) fn stop_on_signals(_groups: &ProcessGroups) -> std::io::Result<Forwarded> {
        Ok(Forwarded::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_is_reported_before_a_signal() {
        let forwarded = Forwarded::new();
        assert_eq!(forwarded.signal(), None);
        assert_eq!(forwarded.exit_code(), None);
    }

    #[cfg(unix)]
    #[test]
    fn the_ignored_signals_are_read_from_the_mask() {
        // SIGHUP is bit 0, SIGINT bit 1, SIGTERM bit 14; SIGPIPE (bit 12) is not one of the three.
        let status = "Name:\tx\nSigBlk:\t0000000000000003\nSigIgn:\t0000000000001001\n";
        assert_eq!(imp::ignored_in(status), Some(vec![1]));
        let all = "SigIgn:\t0000000000004003\n";
        assert_eq!(imp::ignored_in(all), Some(vec![2, 15, 1]));
        assert_eq!(imp::ignored_in("SigIgn:\t0000000000000000\n"), Some(vec![]));
        assert_eq!(imp::ignored_in("Name:\tx\n"), None);
    }

    #[test]
    fn the_exit_code_is_128_and_the_signal() {
        let forwarded = Forwarded::new();
        forwarded.signal.store(15, Ordering::SeqCst);
        assert_eq!(forwarded.clone().signal(), Some(15));
        assert_eq!(forwarded.exit_code(), Some(143));
    }
}

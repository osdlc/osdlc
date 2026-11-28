//! The thread form of reading a child's pipes, for platforms without `poll`.
//!
//! One reader thread per pipe and one for stdin, and one wall-clock wait of
//! [`PIPE_GRACE`] after the reap, shared by the readers. A reader not scheduled
//! within it, or a held pipe, makes the output incomplete, and a reader on a
//! held pipe stays until the pipe is written or closed. `pipes_poll` has
//! neither limit.

use std::io::{ErrorKind, Read, Write};
use std::process::{Child, ExitStatus};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Instant;

use crate::group::ProcessGroups;
use crate::runner::{
    DEFAULT_OUTPUT_CAP, Drained, Killed, MAX_POLL, MIN_POLL, PIPE_GRACE, READ_CHUNK, RunOptions,
    stop,
};

/// Runs the child to its end on reader threads and returns what it wrote.
pub(crate) fn drain(
    child: &mut Child,
    input: Option<Vec<u8>>,
    deadline: Option<Instant>,
    opts: &RunOptions,
) -> Drained {
    let cap = opts.max_output_bytes.unwrap_or(DEFAULT_OUTPUT_CAP);
    let exceeded = Arc::new(AtomicBool::new(false));
    let (done_tx, done_rx) = mpsc::channel();
    let out = capture(child.stdout.take(), cap, &exceeded, done_tx.clone());
    let err = capture(child.stderr.take(), cap, &exceeded, done_tx);
    if let (Some(mut stdin), Some(input)) = (child.stdin.take(), input) {
        // A child that exits without reading its stdin closes the pipe; that
        // is a result, not an error, so the write error is dropped.
        thread::spawn(move || {
            let _ = stdin.write_all(&input);
        });
    }

    let (status, killed) = wait_for_exit(child, opts, deadline, &exceeded, &done_rx);
    let reaped_at = Instant::now();

    // One deadline for both pipes, so a grandchild holding both costs the
    // grace once; the timeout limits only the child.
    let drain_until = reaped_at + PIPE_GRACE;
    let (stdout, out_ok) = collect(&out, drain_until);
    let (stderr, err_ok) = collect(&err, drain_until);
    Drained {
        status,
        killed,
        reaped_at,
        stdout,
        stderr,
        whole: out_ok && err_ok,
        capped: exceeded.load(Ordering::SeqCst),
    }
}

/// Waits until the child exits, the deadline passes, a stream exceeds its cap,
/// `stop_all` is called on the run's handle or waiting fails. In all but the
/// first case the run is stopped and the child reaped.
///
/// `std` has no wait with a timeout, so the exit is found by asking. A reader
/// sends on `done` when its pipe closes or passes the cap, which ends the
/// pause early; the pauses remain for a child that exits while something else
/// holds its pipes.
fn wait_for_exit(
    child: &mut Child,
    opts: &RunOptions,
    deadline: Option<Instant>,
    exceeded: &AtomicBool,
    done: &Receiver<()>,
) -> (Option<ExitStatus>, Option<Killed>) {
    let mut pause = MIN_POLL;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return (Some(status), None),
            Ok(None) => {}
            Err(e) => {
                let (status, signal) = stop(child, opts);
                return (status, Some(Killed::Failed(signal, format!("wait: {e}"))));
            }
        }
        if opts
            .process_group
            .as_ref()
            .is_some_and(ProcessGroups::is_stopped)
        {
            let (status, signal) = stop(child, opts);
            return (status, Some(Killed::Abort(signal)));
        }
        if exceeded.load(Ordering::SeqCst) {
            let (status, signal) = stop(child, opts);
            return (status, Some(Killed::Output(signal)));
        }
        let now = Instant::now();
        let mut nap = pause;
        if let Some(d) = deadline {
            if now >= d {
                let (status, signal) = stop(child, opts);
                return (status, Some(Killed::Timeout(signal)));
            }
            nap = nap.min(d - now);
        }
        pause = match done.recv_timeout(nap) {
            // A pipe closed, so the exit is usually moments away.
            Ok(()) => MIN_POLL,
            Err(RecvTimeoutError::Timeout) => (pause * 2).min(MAX_POLL),
            // Both readers have finished and the child runs on with its
            // pipes closed: nothing is left to wake this wait early.
            Err(RecvTimeoutError::Disconnected) => {
                thread::sleep(nap);
                (pause * 2).min(MAX_POLL)
            }
        };
    }
}

/// A pipe being read on its own thread.
struct Capture {
    /// What the reader has read so far. `None` once the runner has taken it.
    bytes: Arc<Mutex<Option<Vec<u8>>>>,
    /// Receives once, when the reader has finished.
    finished: Receiver<()>,
}

/// Reads a pipe to the end on its own thread, keeping at most `cap` bytes;
/// passing the cap sets `exceeded` and stops. Then sends once on `done`. The
/// bytes are shared as they arrive, so a runner that stops waiting has them.
fn capture<R: Read + Send + 'static>(
    pipe: Option<R>,
    cap: usize,
    exceeded: &Arc<AtomicBool>,
    done: Sender<()>,
) -> Capture {
    let (tx, finished) = mpsc::channel();
    let bytes = Arc::new(Mutex::new(Some(Vec::new())));
    let (shared, exceeded) = (Arc::clone(&bytes), Arc::clone(exceeded));
    thread::spawn(move || {
        if let Some(pipe) = pipe {
            read_pipe(pipe, cap, &shared, &exceeded);
        }
        // Either receiver is gone when the runner has stopped waiting on it.
        let _ = tx.send(());
        let _ = done.send(());
    });
    Capture { bytes, finished }
}

/// Appends what `pipe` yields to `shared` until the pipe ends, a read fails,
/// the cap is passed or the runner takes the bytes.
fn read_pipe(
    mut pipe: impl Read,
    cap: usize,
    shared: &Mutex<Option<Vec<u8>>>,
    exceeded: &AtomicBool,
) {
    let mut chunk = vec![0; READ_CHUNK];
    loop {
        let n = match pipe.read(&mut chunk) {
            Ok(0) => return,
            Ok(n) => n,
            Err(e) if e.kind() == ErrorKind::Interrupted => continue,
            // A read error ends the capture with the bytes read so far.
            Err(_) => return,
        };
        let mut shared = lock(shared);
        // The runner gave up on this pipe. Stopping closes it, so a writer
        // that never stops is not drained for as long as it runs.
        let Some(bytes) = shared.as_mut() else { return };
        let room = cap - bytes.len();
        bytes.extend_from_slice(&chunk[..n.min(room)]);
        if n > room {
            exceeded.store(true, Ordering::SeqCst);
            return;
        }
    }
}

/// The lock, poisoned or not: the bytes under it are appended whole, so a
/// reader that panicked left nothing half-written.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Takes what a reader thread has read, waiting until `until` for it to
/// finish. The flag is false when it had not finished by then; the bytes it
/// had read are returned either way.
fn collect(capture: &Capture, until: Instant) -> (Vec<u8>, bool) {
    let wait = until.saturating_duration_since(Instant::now());
    let finished = capture.finished.recv_timeout(wait).is_ok();
    (lock(&capture.bytes).take().unwrap_or_default(), finished)
}

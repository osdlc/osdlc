//! Reading a child's pipes on the calling thread, with `poll`.
//!
//! One loop reads stdout and stderr, writes stdin, waits for the child and
//! enforces the deadline, the output cap and `stop_all`. It starts no thread,
//! so a run leaves nothing reading, and the grace after the reap ends only
//! after a `poll` found nothing, so a busy machine cannot cut output short.

use std::io::{ErrorKind, Read, Write};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout};
use std::time::{Duration, Instant};

use rustix::event::{PollFd, PollFlags, Timespec, poll};
use rustix::io::{Errno, ioctl_fionbio};

use crate::group::ProcessGroups;
use crate::runner::{
    DEFAULT_OUTPUT_CAP, Drained, Killed, MAX_POLL, MIN_POLL, PIPE_GRACE, READ_CHUNK, RunOptions,
    stop,
};

/// One captured output pipe.
struct Sink<R> {
    /// `None` once the pipe is closed.
    pipe: Option<R>,
    bytes: Vec<u8>,
}

impl<R: Read> Sink<R> {
    fn new(pipe: Option<R>) -> Self {
        Self {
            pipe,
            bytes: Vec::new(),
        }
    }

    /// One read of what is there. Returns whether anything happened: bytes
    /// read, or the pipe closed. Sets `capped` when the cap is passed.
    fn pump(&mut self, chunk: &mut [u8], cap: usize, capped: &mut bool) -> bool {
        let Some(pipe) = &mut self.pipe else {
            return false;
        };
        match pipe.read(chunk) {
            Ok(0) => {}
            Ok(n) => {
                let room = cap - self.bytes.len();
                self.bytes.extend_from_slice(&chunk[..n.min(room)]);
                if n <= room {
                    return true;
                }
                *capped = true;
            }
            Err(e) if e.kind() == ErrorKind::Interrupted => return false,
            // A read error ends the capture with the bytes read so far.
            Err(_) => {}
        }
        self.pipe = None;
        true
    }
}

/// The child's stdin and the input still to write.
struct Feed {
    pipe: Option<ChildStdin>,
    input: Vec<u8>,
    written: usize,
}

impl Feed {
    fn new(pipe: Option<ChildStdin>, input: Option<Vec<u8>>) -> Self {
        let mut feed = Self {
            pipe,
            input: input.unwrap_or_default(),
            written: 0,
        };
        // No input left, which includes an input of no bytes, closes stdin.
        if feed.written >= feed.input.len() {
            feed.pipe = None;
        } else if let Some(pipe) = &feed.pipe
            && ioctl_fionbio(pipe, true).is_err()
        {
            // A write that could block would hold the loop; close stdin.
            feed.pipe = None;
        }
        feed
    }

    /// One write of the input that is left. Returns whether anything
    /// happened: bytes written, or stdin closed.
    fn pump(&mut self) -> bool {
        let Some(pipe) = &mut self.pipe else {
            return false;
        };
        match pipe.write(&self.input[self.written..]) {
            Ok(n) if n > 0 => {
                self.written += n;
                if self.written < self.input.len() {
                    return true;
                }
            }
            Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::Interrupted) => {
                return false;
            }
            // The child closed its stdin, which is a result, not a failure.
            Ok(_) | Err(_) => {}
        }
        self.pipe = None;
        true
    }
}

/// Runs the child to its end on this thread and returns what it wrote.
pub(crate) fn drain(
    child: &mut Child,
    input: Option<Vec<u8>>,
    deadline: Option<Instant>,
    opts: &RunOptions,
) -> Drained {
    let cap = opts.max_output_bytes.unwrap_or(DEFAULT_OUTPUT_CAP);
    let mut out = Sink::<ChildStdout>::new(child.stdout.take());
    let mut err = Sink::<ChildStderr>::new(child.stderr.take());
    let mut feed = Feed::new(child.stdin.take(), input);
    let mut chunk = vec![0; READ_CHUNK];

    let mut status = None;
    let mut killed = None;
    let mut reaped_at: Option<Instant> = None;
    // A stop after the reap, which starts the pipe grace over.
    let mut stopped_late_at: Option<Instant> = None;
    let mut capped = false;
    // Whether the last `poll` after the child was reaped looked at the pipes
    // and found nothing ready. An interrupted `poll` did not look.
    let mut quiet_since_reaped = false;
    let mut pause = MIN_POLL;

    loop {
        if reaped_at.is_none() {
            match child.try_wait() {
                Ok(Some(s)) => {
                    status = Some(s);
                    reaped_at = Some(Instant::now());
                    feed.pipe = None;
                }
                Ok(None) => {}
                Err(e) => {
                    let (s, signal) = stop(child, opts);
                    status = s;
                    killed = Some(Killed::Failed(signal, format!("wait: {e}")));
                    reaped_at = Some(Instant::now());
                    feed.pipe = None;
                }
            }
        }

        // When the wait on a held pipe ends. Anything below that changes `reaped_at`
        // or `stopped_late_at` ends the turn with `continue`, so this stays current.
        let grace_end = reaped_at.map(|r| stopped_late_at.unwrap_or(r) + PIPE_GRACE);
        if let Some(reaped) = reaped_at {
            let open = out.pipe.is_some() || err.pipe.is_some();
            // A `stop_all` while something still holds a pipe stops the group
            // too: the leader's exit is not the run's end. The group is
            // signalled by the reaped leader's id, as `stop_group` does. If the
            // holder has left and the group is empty, that id is free and,
            // once the system has cycled every other id, could name another.
            if open && killed.is_none() && group_stopped(opts) {
                let (_, signal) = stop(child, opts);
                killed = Some(Killed::Abort(signal));
                // What the group wrote while it stopped gets a grace of its
                // own, and a look at the pipes that comes after the stop.
                stopped_late_at = Some(Instant::now());
                quiet_since_reaped = false;
                continue;
            }
            // Done when both pipes ended, or the grace is over and the last
            // look found nothing to read.
            let grace_over = grace_end.is_some_and(|end| Instant::now() >= end);
            if !open || (quiet_since_reaped && grace_over) {
                return Drained {
                    status,
                    killed,
                    reaped_at: reaped,
                    stdout: out.bytes,
                    stderr: err.bytes,
                    whole: !open,
                    capped,
                };
            }
        } else if let Some(why) = stop_reason(opts, deadline, capped) {
            // The pipes are not read while the group winds down.
            let (s, signal) = stop(child, opts);
            status = s;
            killed = Some(match why {
                Why::Abort => Killed::Abort(signal),
                Why::Output => Killed::Output(signal),
                Why::Timeout => Killed::Timeout(signal),
            });
            reaped_at = Some(Instant::now());
            feed.pipe = None;
            continue;
        }

        let now = Instant::now();
        let mut timeout = pause;
        for due in [deadline.filter(|_| reaped_at.is_none()), grace_end]
            .into_iter()
            .flatten()
        {
            timeout = timeout.min(due.saturating_duration_since(now));
        }
        let looked = poll_ready(&out, &err, &feed, timeout);
        let ready = looked.unwrap_or_default();

        // `HUP` and `ERR` count as ready: the read or write shows the end.
        let mut progress = false;
        if ready[0] {
            progress |= out.pump(&mut chunk, cap, &mut capped);
        }
        if ready[1] {
            progress |= err.pump(&mut chunk, cap, &mut capped);
        }
        if ready[2] {
            progress |= feed.pump();
        }
        quiet_since_reaped = reaped_at.is_some() && looked.is_some_and(|r| !r.contains(&true));
        pause = if progress {
            MIN_POLL
        } else {
            (pause * 2).min(MAX_POLL)
        };
    }
}

enum Why {
    Abort,
    Output,
    Timeout,
}

fn group_stopped(opts: &RunOptions) -> bool {
    opts.process_group
        .as_ref()
        .is_some_and(ProcessGroups::is_stopped)
}

fn stop_reason(opts: &RunOptions, deadline: Option<Instant>, capped: bool) -> Option<Why> {
    if group_stopped(opts) {
        Some(Why::Abort)
    } else if capped {
        Some(Why::Output)
    } else if deadline.is_some_and(|d| Instant::now() >= d) {
        Some(Why::Timeout)
    } else {
        None
    }
}

/// Waits up to `timeout` and says which of stdout, stderr and stdin is ready,
/// an error or hang-up included. `None`: a signal interrupted `poll` before it
/// looked. Any other failure reports nothing ready after the rest of the
/// timeout, so a run whose `poll` cannot work still ends when the grace does.
fn poll_ready(
    out: &Sink<ChildStdout>,
    err: &Sink<ChildStderr>,
    feed: &Feed,
    timeout: Duration,
) -> Option<[bool; 3]> {
    let mut fds = Vec::with_capacity(3);
    let mut slots = Vec::with_capacity(3);
    if let Some(p) = &out.pipe {
        fds.push(PollFd::new(p, PollFlags::IN));
        slots.push(0);
    }
    if let Some(p) = &err.pipe {
        fds.push(PollFd::new(p, PollFlags::IN));
        slots.push(1);
    }
    if let Some(p) = &feed.pipe {
        fds.push(PollFd::new(p, PollFlags::OUT));
        slots.push(2);
    }
    // At most MAX_POLL, so the conversion cannot fail.
    let timespec = Timespec::try_from(timeout).ok();
    let started = Instant::now();
    let mut ready = [false; 3];
    match poll(&mut fds, timespec.as_ref()) {
        Ok(_) => {
            for (fd, slot) in fds.iter().zip(slots) {
                ready[slot] = !fd.revents().is_empty();
            }
        }
        Err(Errno::INTR) => return None,
        Err(_) => std::thread::sleep(timeout.saturating_sub(started.elapsed())),
    }
    Some(ready)
}

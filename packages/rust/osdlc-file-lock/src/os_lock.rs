//! The OS lock: an operating-system lock on an open file, whose file names the
//! process that holds it. For Rust processes only. The system lets the lock go
//! when its holder dies, so there is no stale lock and no staleness rule.
//!
//! This is a second protocol, apart from the file-existence lock of
//! [`claim_lock`](crate::claim_lock) and [`with_lock`](crate::with_lock). The
//! two do not exclude each other: never use both on one path. Use this one
//! when every process that takes the lock is a Rust process on this crate, and
//! the file-existence lock when a Node.js process takes it too.
//!
//! ```
//! use osdlc_file_lock::os_lock::{OsLock, OsLockError, OsLockState};
//! use serde_json::json;
//!
//! let dir = tempfile::tempdir()?;
//! let path = dir.path().join("daemon.lock");
//!
//! // Take the lock without waiting. The file now holds `{"pid":<this process>}`.
//! let mut lock = OsLock::acquire(&path)?;
//! // Replace the record while the lock is held. The pid is always in it.
//! lock.record(&json!({ "started_at": "2026-11-24T10:00:00Z" }))?;
//!
//! // A second taker is refused, and told who holds the lock.
//! match OsLock::acquire(&path) {
//!     Err(OsLockError::Held { holder, .. }) => assert_eq!(holder.pid, std::process::id()),
//!     Err(OsLockError::HeldUnnamed { .. }) => {} // Windows: the record cannot be read
//!     other => panic!("{other:?}"),
//! }
//! // A process that only asks keeps no lock and writes no record.
//! assert!(!matches!(OsLock::holder(&path)?, OsLockState::Free));
//!
//! drop(lock); // or the death of the process
//! assert_eq!(OsLock::holder(&path)?, OsLockState::Free);
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```
//!
//! # The protocol
//!
//! - **The lock** is an exclusive lock on the open file `x.lock`
//!   ([`File::try_lock`]). It alone decides who holds. The file is created
//!   when missing and is never deleted, so between holders it keeps the last
//!   holder's record.
//! - **The record** is one line of JSON at the start of the file: an object
//!   whose first field is `pid`, the holder's process id, then the holder's
//!   own fields. It is written with one write and read with one read of at
//!   most [`MAX_RECORD_LEN`] bytes. A reader takes the first line.
//! - **The guard** is a second lock, on the empty file `x.lock.guard`
//!   ([`guard_path`]), also never deleted. It orders the writes and the
//!   reads of the record. [`OsLock::acquire`] and [`OsLock::holder`] hold the
//!   guard while they try the lock and write the record, or read the
//!   holder's, and let it go before they return. Nothing tries the lock
//!   outside the guard. So while the lock is held and the guard is free, the
//!   file holds the record of the lock's holder, never an earlier holder's.
//!   [`OsLock::record`] holds the guard for its write too, so no read through
//!   this module meets it. The guard's file is opened before the lock's.
//! - **A process that only asks** calls [`OsLock::holder`]. It takes the lock
//!   for a moment, under the guard, and lets it go there, so no other taker or
//!   asker ever finds the lock held by an asker.
//!
//! # Limits
//!
//! - **A stopped process can hold the guard.** A process frozen in the middle
//!   of `acquire` or `holder` keeps the guard. Everyone else then waits
//!   [`GUARD_WAIT`] and gets [`OsLockError::GuardBusy`], or
//!   [`OsLockState::GuardBusy`], until that process goes on or dies. The lock
//!   is not tried then, so it may be free. Trying it outside the guard would
//!   let the guard's holder name the wrong process. A holder still replaces
//!   its record: `record` writes without the guard after the wait.
//! - **`acquire`, `holder` and `record` can block the thread** for up to
//!   [`GUARD_WAIT`]. On an async runtime, call them where blocking is
//!   allowed.
//! - **Two opens of the file conflict within one process.** A process that
//!   calls `acquire` twice on one path is refused the second time. It is
//!   given its own pid where the record can be read, so not on Windows.
//! - **One path for one lock.** The guard's file is found from the text of
//!   the lock's path. Every process must name the lock by the same path. A
//!   lock reached by two paths, such as through a symbolic link, has two
//!   guards: the lock still excludes, but a taker can then be given an
//!   earlier holder's name.
//! - **A process that only asks needs to read the two files**, not to write
//!   them. The guard's file must then be there, or the asker must be able to
//!   create it: a taker creates it the first time.
//! - **A forked child shares the lock.** Take the lock after any `fork`. Only
//!   the process that took the lock unlocks it when it drops its [`OsLock`]:
//!   a forked child that drops its copy leaves its parent's lock held. The
//!   other way round is a limit: when the parent drops its `OsLock` the lock
//!   is free, though the child still has its copy. A child that a `Command`
//!   starts shares the open file only until its exec, and dropping the
//!   `OsLock` meanwhile unlocks it at once all the same. Only a holder that
//!   is killed while such a child is between fork and exec leaves the lock
//!   held until the exec, a moment later.
//! - **At the death of a process the system chooses the order.** A process
//!   that dies in the middle of `acquire` or `holder` can hold the guard and
//!   the lock, and the lock must go first: a taker that got the guard while
//!   the lock was still held would read the record of an earlier holder. No
//!   system documents the order. Measured with two open files and 150 deaths
//!   each way, on macOS (APFS) and on Linux 6.12 (overlayfs): with the
//!   guard's file opened first, as here, the guard was never free while the
//!   lock was held; with the lock's file opened first it was, in 23 to 139 of
//!   150 deaths from one run to the next, for a few microseconds.
//! - **Never delete the lock's file or the guard's** while a process may use
//!   them. A new file at the same path is a second lock, and both can be held.
//! - **A read can meet a write in two cases only.** A reader that does not
//!   take the guard, such as another program or a plain read of the file. And
//!   a record written while the guard stayed busy for [`GUARD_WAIT`]. One
//!   read can then see half of one write: on Linux the new bytes are there
//!   before the file's new length. Such a reader gets no name for that one
//!   answer, never another pid: the `pid` is at the same place in every
//!   record a holder writes, and the file is never emptied.
//! - **Local file systems only**, as for the rest of this crate.
//! - **Windows.** This module is built for Unix and Windows. On Windows the
//!   lock also blocks every other open of the file from reading it, so the
//!   record cannot be read while the lock is held: a holder is always
//!   reported with no name ([`OsLockError::HeldUnnamed`],
//!   [`OsLockState::HeldUnnamed`]). Taking, refusing, asking and the release
//!   at the holder's death are the same.

use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{Map, Value};

use crate::held::sibling;

/// A lock file's record: the JSON object in it, `pid` included.
pub type Record = Map<String, Value>;

/// The longest [`OsLock::acquire`] and [`OsLock::holder`] wait for the guard.
/// A holder keeps the guard for one try of the lock and one short write or
/// read, so a second is long: enough for many takers at once. It is still
/// short for a person who waits while the guard's holder is frozen.
pub const GUARD_WAIT: Duration = Duration::from_secs(1);

/// The pause between two tries for the guard.
const GUARD_PAUSE: Duration = Duration::from_millis(5);

/// The longest record, in bytes, with its newline. A record is written with
/// one write and read with one read of this many bytes, so a longer one is
/// refused when it is written.
pub const MAX_RECORD_LEN: usize = 4096;

/// A held OS lock on the file at [`path`](Self::path). Dropping it unlocks the
/// file, and so does the death of the process. The file stays, with its
/// record.
#[derive(Debug)]
pub struct OsLock {
    held: Locked,
    path: PathBuf,
}

/// The process that holds a lock, as its file names it.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub struct Holder {
    /// The holder's process id. Never 0.
    pub pid: u32,
    /// The whole record, `pid` included. The other fields are the holder's
    /// own, read back from disk unchecked.
    pub record: Record,
}

/// What [`OsLock::holder`] found.
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
pub enum OsLockState {
    /// No process holds the lock, or its file is not there.
    Free,
    /// A process holds the lock, and the file names it.
    Held(Holder),
    /// A process holds the lock, and the file does not name it: the first
    /// line of the file is not a record with a `pid`, or the file could not
    /// be read. On Windows every holder is seen this way.
    HeldUnnamed,
    /// Another process still held the guard after [`GUARD_WAIT`]: it is
    /// stopped in the middle of taking the lock or of asking. The lock was
    /// not tried, so it may be held or free.
    GuardBusy,
}

/// Why an [`OsLock`] was not taken, or its record not written.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum OsLockError {
    /// Another process holds the lock, or another open of the file in this
    /// process, and the file names it.
    #[error("lock {} is held by pid {}", path.display(), holder.pid)]
    Held {
        /// The lock.
        path: PathBuf,
        /// Who holds it.
        holder: Holder,
    },
    /// The lock is held, and its file does not name the holder. See
    /// [`OsLockState::HeldUnnamed`].
    #[error("lock {} is held, and its file does not name the holder", path.display())]
    HeldUnnamed {
        /// The lock.
        path: PathBuf,
    },
    /// Another process still held the guard after [`GUARD_WAIT`]. The lock
    /// was not tried, so it may be held or free. See
    /// [`OsLockState::GuardBusy`].
    #[error("lock {} was not tried: its guard stayed busy", path.display())]
    GuardBusy {
        /// The lock.
        path: PathBuf,
    },
    /// Opening, locking, reading or writing a file failed. The kind is
    /// `InvalidInput` for a record that is not a JSON object or is longer
    /// than [`MAX_RECORD_LEN`].
    #[error("lock file {}: {source}", path.display())]
    Io {
        /// The file the error is about: the lock's, or its guard's. The
        /// guard's file is opened first, so a folder that is not there is
        /// reported on the guard's path.
        path: PathBuf,
        /// The error.
        source: io::Error,
    },
}

fn io_at(path: &Path) -> impl FnOnce(io::Error) -> OsLockError {
    |source| OsLockError::Io {
        path: path.to_path_buf(),
        source,
    }
}

impl OsLock {
    /// Takes the lock at `path` without waiting and writes
    /// `{"pid":<this process>}` into its file. A file a dead holder left is
    /// free: it is taken and its content replaced. The directory must exist.
    ///
    /// When the lock is held the file is left as it is, and the error names
    /// the holder: [`OsLockError::Held`], or [`OsLockError::HeldUnnamed`] when
    /// the file does not say who. The record is the holder's: the lock is
    /// tried, and the file written or read, under the guard, and a holder has
    /// written its record before it lets the guard go.
    ///
    /// [`OsLockError::GuardBusy`] when another process still holds the guard
    /// after [`GUARD_WAIT`], which this waits out, blocking. The lock is then
    /// not tried at all, and its file is not created.
    ///
    /// After any error the lock and the guard are both free of this call.
    pub fn acquire(path: &Path) -> Result<Self, OsLockError> {
        Self::acquire_with(path, &Record::new())
    }

    /// [`acquire`](Self::acquire), writing `record` at once. `record` must
    /// serialise to a JSON object. Its `pid` is set to this process's, and
    /// written first.
    pub fn acquire_with(path: &Path, record: &impl Serialize) -> Result<Self, OsLockError> {
        let line = record_line(record).map_err(io_at(path))?;
        Self::acquire_within(path, GUARD_WAIT, |lock| lock.write(&line))
    }

    /// Takes the lock, waiting `guard_wait` for the guard and writing the
    /// record with `write`.
    fn acquire_within(
        path: &Path,
        guard_wait: Duration,
        write: impl FnOnce(&OsLock) -> io::Result<()>,
    ) -> Result<Self, OsLockError> {
        // Before the guard's file is opened, so that none is made beside a
        // folder.
        if path.is_dir() {
            return Err(io_at(path)(ErrorKind::IsADirectory.into()));
        }
        let Some(guard) = Guard::take(&guard_path(path), guard_wait)? else {
            return Err(OsLockError::GuardBusy {
                path: path.to_path_buf(),
            });
        };
        // `take` has ended, and has let the lock go when the write failed,
        // before the guard is let go.
        let taken = Self::take(path, write);
        guard.let_go();
        taken
    }

    /// The part of `acquire` under the guard: opens the lock's file, takes
    /// the lock and writes the record, or reads the holder's when the lock is
    /// held.
    fn take(
        path: &Path,
        write: impl FnOnce(&OsLock) -> io::Result<()>,
    ) -> Result<Self, OsLockError> {
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path)
            .map_err(io_at(path))?;
        match try_lock(&file, path)? {
            OsLockState::Free => {}
            OsLockState::Held(holder) => {
                return Err(OsLockError::Held {
                    path: path.to_path_buf(),
                    holder,
                });
            }
            // `try_lock` never answers `GuardBusy`.
            OsLockState::HeldUnnamed | OsLockState::GuardBusy => {
                return Err(OsLockError::HeldUnnamed {
                    path: path.to_path_buf(),
                });
            }
        }
        let lock = OsLock {
            held: Locked::new(file),
            path: path.to_path_buf(),
        };
        write(&lock).map_err(io_at(path))?;
        Ok(lock)
    }

    /// Who holds the lock at `path`. For a process that only asks: it keeps
    /// no lock and never writes into the lock's file, so it is never named as
    /// the holder, and the file keeps the record it had. It needs to read the
    /// two files, not to write them.
    ///
    /// The lock is tried under the guard and let go at once, still under the
    /// guard, so no other taker or asker finds it held meanwhile.
    /// [`OsLockState::Free`] also when the lock's file is not there, and then
    /// nothing is created. When it is there, the guard's file is created if it
    /// is missing, which is the one thing this may write.
    /// [`OsLockState::GuardBusy`] when another process still holds the guard
    /// after [`GUARD_WAIT`], which this waits out, blocking.
    ///
    /// The answer is about the moment of the call. The holder can be gone,
    /// and its pid given to another process, before the caller acts on it.
    pub fn holder(path: &Path) -> Result<OsLockState, OsLockError> {
        Self::holder_within(path, GUARD_WAIT)
    }

    /// `holder`, waiting `guard_wait` for the guard.
    fn holder_within(path: &Path, guard_wait: Duration) -> Result<OsLockState, OsLockError> {
        // Before the guard's file is opened, so that nothing is created
        // beside a lock that is not there, or beside a folder.
        match fs::metadata(path) {
            Ok(found) if found.is_dir() => {
                return Err(io_at(path)(ErrorKind::IsADirectory.into()));
            }
            Ok(_) => {}
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(OsLockState::Free),
            Err(source) => return Err(io_at(path)(source)),
        }
        let Some(guard) = Guard::take(&guard_path(path), guard_wait)? else {
            return Ok(OsLockState::GuardBusy);
        };
        let found = match File::open(path) {
            Ok(file) => {
                let found = try_lock(&file, path);
                // The lock, when this took it, goes before the guard.
                if matches!(found, Ok(OsLockState::Free)) {
                    let _ = file.unlock();
                }
                found
            }
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(OsLockState::Free),
            Err(source) => Err(io_at(path)(source)),
        };
        guard.let_go();
        found
    }

    /// Replaces the record in the file. `record` must serialise to a JSON
    /// object. Its `pid` is set to this process's, and written first.
    ///
    /// Written under the guard, so a process that asks gets the old record or
    /// the new one, whole. This waits for the guard, blocking, for up to
    /// [`GUARD_WAIT`]. When the guard cannot be had by then, the record is
    /// written all the same: a process frozen with the guard must not stop a
    /// holder from recording. The file is never empty meanwhile and its `pid`
    /// does not change, so even then a reader is never given another pid.
    ///
    /// A failed write leaves the lock held.
    pub fn record(&mut self, record: &impl Serialize) -> Result<(), OsLockError> {
        self.record_within(record, GUARD_WAIT)
    }

    /// `record`, waiting `guard_wait` for the guard.
    fn record_within(
        &mut self,
        record: &impl Serialize,
        guard_wait: Duration,
    ) -> Result<(), OsLockError> {
        let line = record_line(record).map_err(io_at(&self.path))?;
        // No guard, busy or not to be opened, is no reason not to write.
        let guard = Guard::take(&guard_path(&self.path), guard_wait)
            .ok()
            .flatten();
        let written = self.write(&line).map_err(io_at(&self.path));
        if let Some(guard) = guard {
            guard.let_go();
        }
        written
    }

    /// The lock's file.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Writes `line` over the start of the file with one write, then cuts the
    /// file to that length. The file is never emptied. A reader takes the
    /// first line, and `line` ends in a newline, so the end of a longer old
    /// record that is still there before the cut is not read.
    fn write(&self, line: &str) -> io::Result<()> {
        write_at_start(&self.held.file, line.as_bytes())?;
        self.held.file.set_len(line.len() as u64)
    }
}

/// The guard's file for the lock at `lock`: the same path with `.guard` after
/// it. It is found from the path's text, so every process must name the lock
/// by the same path.
pub fn guard_path(lock: &Path) -> PathBuf {
    sibling(lock, ".guard")
}

/// A file this process locked. Dropping it unlocks the file, and does not
/// only close it: a child process that a `Command` starts shares the open
/// file until its exec, and would keep the lock that long.
///
/// Only the process that took the lock unlocks it. A forked child has a copy
/// of this value on the same open file; when the child drops its copy, the
/// file is closed there and its parent's lock stays.
#[derive(Debug)]
struct Locked {
    file: File,
    /// The process that took the lock.
    taker: u32,
}

impl Locked {
    /// `file`, which this process has just locked.
    fn new(file: File) -> Self {
        Locked {
            file,
            taker: std::process::id(),
        }
    }
}

impl Drop for Locked {
    fn drop(&mut self) {
        if std::process::id() == self.taker {
            let _ = self.file.unlock();
        }
    }
}

/// The held guard.
struct Guard(Locked);

impl Guard {
    /// Opens the guard's file and takes its lock, trying every `GUARD_PAUSE`
    /// until `wait` has passed. `None` when another still holds it then.
    ///
    /// The file is opened to read when it is there, so a process that may not
    /// write it can still ask. It is created when missing.
    ///
    /// A caller opens the guard's file before the lock's. When a process dies
    /// with both locks, the system chooses which goes first, and the lock
    /// must go first: see "At the death of a process" in the module's limits.
    fn take(path: &Path, wait: Duration) -> Result<Option<Self>, OsLockError> {
        let file = match File::open(path) {
            Ok(file) => file,
            Err(e) if e.kind() == ErrorKind::NotFound => OpenOptions::new()
                .create(true)
                .truncate(false)
                .write(true)
                .open(path)
                .map_err(io_at(path))?,
            Err(source) => return Err(io_at(path)(source)),
        };
        let deadline = Instant::now() + wait;
        loop {
            match file.try_lock() {
                Ok(()) => return Ok(Some(Guard(Locked::new(file)))),
                Err(TryLockError::WouldBlock) if Instant::now() < deadline => {
                    std::thread::sleep(GUARD_PAUSE);
                }
                Err(TryLockError::WouldBlock) => return Ok(None),
                Err(TryLockError::Error(source)) => return Err(io_at(path)(source)),
            }
        }
    }
}

impl Guard {
    /// Lets the guard go.
    fn let_go(self) {
        // A test looks at the lock at this moment.
        #[cfg(test)]
        tests::before_the_guard_goes();
        drop(self.0);
    }
}

/// Tries the lock on `file`, the lock's file at `path`. [`OsLockState::Free`]
/// when this took it: it is then held until `file` is unlocked or closed.
/// Else the holder the file names. To be called under the guard only.
fn try_lock(file: &File, path: &Path) -> Result<OsLockState, OsLockError> {
    match file.try_lock() {
        Ok(()) => Ok(OsLockState::Free),
        Err(TryLockError::WouldBlock) => Ok(match read_holder(file) {
            Some(holder) => OsLockState::Held(holder),
            None => OsLockState::HeldUnnamed,
        }),
        Err(TryLockError::Error(source)) => Err(io_at(path)(source)),
    }
}

/// The holder the lock file open as `file` names, or `None` when the file
/// cannot be read or names nobody.
///
/// One read is enough: a record is at most [`MAX_RECORD_LEN`] bytes, and a
/// reader takes its first line.
fn read_holder(file: &File) -> Option<Holder> {
    let mut buf = [0u8; MAX_RECORD_LEN];
    let len = read_at_start(file, &mut buf).ok()?;
    parse_holder(&buf[..len])
}

/// The holder that `text`, the start of a lock file, names: its first line
/// must be a JSON object whose `pid` is a whole number from 1 that fits a
/// `u32`. A pid of 0 names nobody: a caller that signals the pid it is given
/// would signal its own process group.
fn parse_holder(text: &[u8]) -> Option<Holder> {
    let line = text.split(|byte| *byte == b'\n').next()?;
    let Ok(Value::Object(record)) = serde_json::from_slice(line) else {
        return None;
    };
    let pid = u32::try_from(record.get("pid")?.as_u64()?).ok()?;
    (pid != 0).then_some(Holder { pid, record })
}

/// The line a holder writes for `record`: `{"pid":<this process>`, then the
/// record's other fields, then a newline. A `pid` in `record` is replaced.
/// The pid comes first so that it is at the same place in every record.
fn record_line(record: &impl Serialize) -> io::Result<String> {
    let mut fields = match serde_json::to_value(record) {
        Ok(Value::Object(fields)) => fields,
        Ok(_) => {
            return Err(io::Error::new(
                ErrorKind::InvalidInput,
                "a lock record must serialise to a JSON object",
            ));
        }
        Err(e) => return Err(io::Error::new(ErrorKind::InvalidInput, e)),
    };
    fields.remove("pid");
    let pid = std::process::id();
    let line = if fields.is_empty() {
        format!("{{\"pid\":{pid}}}\n")
    } else {
        let rest = serde_json::to_string(&fields).expect("a JSON map always serialises");
        format!("{{\"pid\":{pid},{}\n", &rest[1..])
    };
    if line.len() > MAX_RECORD_LEN {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            format!(
                "a lock record is at most {MAX_RECORD_LEN} bytes, this one is {}",
                line.len()
            ),
        ));
    }
    Ok(line)
}

#[cfg(unix)]
fn write_at_start(file: &File, bytes: &[u8]) -> io::Result<()> {
    std::os::unix::fs::FileExt::write_all_at(file, bytes, 0)
}

#[cfg(unix)]
fn read_at_start(file: &File, buf: &mut [u8]) -> io::Result<usize> {
    std::os::unix::fs::FileExt::read_at(file, buf, 0)
}

#[cfg(windows)]
fn write_at_start(file: &File, bytes: &[u8]) -> io::Result<()> {
    let mut done = 0;
    while done < bytes.len() {
        match std::os::windows::fs::FileExt::seek_write(file, &bytes[done..], done as u64)? {
            0 => return Err(ErrorKind::WriteZero.into()),
            n => done += n,
        }
    }
    Ok(())
}

#[cfg(windows)]
fn read_at_start(file: &File, buf: &mut [u8]) -> io::Result<usize> {
    std::os::windows::fs::FileExt::seek_read(file, buf, 0)
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

    use serde_json::json;

    use super::*;

    /// A record a holder that died left in the lock file.
    const LEFT_BEHIND: &str = "{\"pid\":1,\"boot\":\"old\",\"started_at\":\"2026-11-01\"}\n";

    /// A lock of the test's own on the file at `path`, which must exist.
    fn hold(path: &Path) -> File {
        let file = File::open(path).unwrap();
        file.try_lock().unwrap();
        file
    }

    fn is_held(path: &Path) -> bool {
        matches!(
            File::open(path).unwrap().try_lock(),
            Err(TryLockError::WouldBlock)
        )
    }

    fn read(path: &Path) -> String {
        std::fs::read_to_string(path).unwrap()
    }

    /// The text of a held lock's file, read through the holder's own open
    /// file: on Windows no other open of it can be read.
    fn read_as_holder(file: &File) -> String {
        let mut buf = [0u8; MAX_RECORD_LEN];
        let len = read_at_start(file, &mut buf).unwrap();
        String::from_utf8(buf[..len].to_vec()).unwrap()
    }

    fn lock_and_guard(dir: &tempfile::TempDir) -> (PathBuf, PathBuf) {
        let path = dir.path().join("x.lock");
        let guard = guard_path(&path);
        (path, guard)
    }

    thread_local! {
        /// What a test runs at the moment a guard is let go on its thread.
        static BEFORE_THE_GUARD_GOES: RefCell<Option<Box<dyn Fn()>>> = const { RefCell::new(None) };
    }

    /// Called by `Guard::let_go`, with the guard still held.
    pub(super) fn before_the_guard_goes() {
        BEFORE_THE_GUARD_GOES.with_borrow(|look| {
            if let Some(look) = look {
                look();
            }
        });
    }

    /// Runs `run`, and gives what `look` saw each time `run` let a guard go.
    fn as_the_guard_goes<T, S: 'static>(
        look: impl Fn() -> S + 'static,
        run: impl FnOnce() -> T,
    ) -> (T, Vec<S>) {
        let seen = Rc::new(RefCell::new(Vec::new()));
        let into = Rc::clone(&seen);
        BEFORE_THE_GUARD_GOES.set(Some(Box::new(move || {
            into.borrow_mut().push(look());
        })));
        let result = run();
        BEFORE_THE_GUARD_GOES.set(None);
        (result, seen.take())
    }

    /// Runs `run`, and says whether the lock at `path` was held each time
    /// `run` let a guard go.
    fn lock_held_as_the_guard_goes<T>(path: &Path, run: impl FnOnce() -> T) -> (T, Vec<bool>) {
        let at = path.to_path_buf();
        as_the_guard_goes(move || is_held(&at), run)
    }

    #[test]
    fn the_line_is_the_pid_then_the_callers_fields() {
        let pid = std::process::id();
        assert_eq!(
            record_line(&Record::new()).unwrap(),
            format!("{{\"pid\":{pid}}}\n")
        );
        assert_eq!(
            record_line(&json!({ "boot": "b1" })).unwrap(),
            format!("{{\"pid\":{pid},\"boot\":\"b1\"}}\n")
        );
        // A pid the caller gave is replaced, wherever it stood.
        assert_eq!(
            record_line(&json!({ "boot": "b1", "pid": 7 })).unwrap(),
            format!("{{\"pid\":{pid},\"boot\":\"b1\"}}\n")
        );
        // One line, whatever the fields hold.
        let line = record_line(&json!({ "note": "a\nb" })).unwrap();
        assert_eq!(line.matches('\n').count(), 1);
        assert!(line.ends_with('\n'));
    }

    #[test]
    fn a_record_that_is_not_an_object_or_is_too_long_is_invalid_input() {
        for bad in [json!([1]), json!("x"), json!(5), json!(null)] {
            assert_eq!(
                record_line(&bad).unwrap_err().kind(),
                ErrorKind::InvalidInput
            );
        }
        let fits = |n: usize| record_line(&json!({ "k": "x".repeat(n) }));
        let empty = fits(0).unwrap().len();
        assert_eq!(fits(MAX_RECORD_LEN - empty).unwrap().len(), MAX_RECORD_LEN);
        assert_eq!(
            fits(MAX_RECORD_LEN - empty + 1).unwrap_err().kind(),
            ErrorKind::InvalidInput
        );
    }

    #[test]
    fn a_holder_is_read_from_the_first_line() {
        let pid = |text: &str| parse_holder(text.as_bytes()).map(|holder| holder.pid);
        assert_eq!(pid("{\"pid\":4242}\n"), Some(4242));
        assert_eq!(pid("{\"pid\":4242}"), Some(4242));
        assert_eq!(pid("{\"pid\": 4242, \"startedAt\": \"t\"}"), Some(4242));
        // A shorter record written over a longer one, before the cut.
        assert_eq!(pid("{\"pid\":7}\noot\":\"old\"}\n"), Some(7));
        assert_eq!(
            parse_holder(LEFT_BEHIND.as_bytes()).unwrap().record,
            *json!({ "pid": 1, "boot": "old", "started_at": "2026-11-01" })
                .as_object()
                .unwrap()
        );
        for nobody in [
            "",
            "\n{\"pid\":7}\n",
            "garbage",
            "[1,2]",
            "{\"pid\":\"7\"}",
            "{\"pid\":-7}",
            "{\"pid\":7.5}",
            "{\"pid\":4294967296}",
            "{\"pid\":0}",
            "{\"boot\":\"b1\"}",
            "{\"pid\":7",
        ] {
            assert_eq!(pid(nobody), None, "{nobody:?}");
        }
        assert_eq!(parse_holder(&[0u8; MAX_RECORD_LEN]), None);
    }

    #[test]
    fn the_record_is_written_with_the_lock_and_the_guard_both_held() {
        let dir = tempfile::tempdir().unwrap();
        let (path, guard) = lock_and_guard(&dir);
        std::fs::write(&path, LEFT_BEHIND).unwrap();

        let lock = OsLock::acquire_within(&path, GUARD_WAIT, |lock| {
            assert!(is_held(&path), "the lock is not held at the write");
            assert!(is_held(&guard), "the guard is not held at the write");
            lock.write("{\"pid\":7}\n")
        })
        .unwrap();

        assert!(!is_held(&guard), "the guard is still held");
        assert!(is_held(&path));
        drop(lock);
        assert_eq!(read(&path), "{\"pid\":7}\n");
    }

    #[test]
    fn a_failed_write_leaves_the_lock_and_the_guard_free() {
        let dir = tempfile::tempdir().unwrap();
        let (path, guard) = lock_and_guard(&dir);
        std::fs::write(&path, LEFT_BEHIND).unwrap();

        let failed = OsLock::acquire_within(&path, GUARD_WAIT, |_| Err(io::Error::other("full")));

        match failed {
            Err(OsLockError::Io { path: at, source }) => {
                assert_eq!(at, path);
                assert_eq!(source.to_string(), "full");
            }
            other => panic!("expected Io, got {other:?}"),
        }
        assert!(!is_held(&path));
        assert!(!is_held(&guard));
        assert_eq!(read(&path), LEFT_BEHIND);
    }

    #[test]
    fn a_taker_keeps_the_lock_when_it_lets_the_guard_go() {
        let dir = tempfile::tempdir().unwrap();
        let (path, _) = lock_and_guard(&dir);
        std::fs::write(&path, LEFT_BEHIND).unwrap();

        let (lock, held) = lock_held_as_the_guard_goes(&path, || OsLock::acquire(&path));

        assert!(lock.is_ok(), "{:?}", lock.err());
        assert_eq!(held, [true]);
    }

    #[test]
    fn a_failed_write_lets_the_lock_go_before_the_guard() {
        let dir = tempfile::tempdir().unwrap();
        let (path, _) = lock_and_guard(&dir);
        std::fs::write(&path, LEFT_BEHIND).unwrap();

        let (failed, held) = lock_held_as_the_guard_goes(&path, || {
            OsLock::acquire_within(&path, GUARD_WAIT, |_| Err(io::Error::other("full")))
        });

        assert!(matches!(failed, Err(OsLockError::Io { .. })), "{failed:?}");
        assert_eq!(held, [false]);
    }

    #[test]
    fn an_asker_lets_the_lock_go_before_the_guard() {
        let dir = tempfile::tempdir().unwrap();
        let (path, _) = lock_and_guard(&dir);
        std::fs::write(&path, LEFT_BEHIND).unwrap();

        let (found, held) = lock_held_as_the_guard_goes(&path, || OsLock::holder(&path));

        assert_eq!(found.unwrap(), OsLockState::Free);
        assert_eq!(held, [false]);
    }

    #[test]
    fn a_record_is_replaced_under_the_guard() {
        let dir = tempfile::tempdir().unwrap();
        let (path, guard) = lock_and_guard(&dir);
        let mut lock = OsLock::acquire(&path).unwrap();
        let new = record_line(&json!({ "boot": "b2" })).unwrap();

        // The file, and whether the guard was held, as `record` let it go.
        let own = lock.held.file.try_clone().unwrap();
        let (recorded, seen) = as_the_guard_goes(
            move || (is_held(&guard), read_as_holder(&own)),
            || lock.record(&json!({ "boot": "b2" })),
        );

        recorded.unwrap();
        assert_eq!(seen, [(true, new)]);
    }

    /// A process frozen with the guard does not stop a holder from recording.
    #[test]
    fn a_busy_guard_is_waited_out_and_the_record_is_written_all_the_same() {
        let dir = tempfile::tempdir().unwrap();
        let (path, guard) = lock_and_guard(&dir);
        let mut lock = OsLock::acquire(&path).unwrap();
        let _guard = hold(&guard);

        lock.record_within(&json!({ "boot": "b2" }), Duration::from_millis(50))
            .unwrap();

        assert_eq!(
            read_as_holder(&lock.held.file),
            record_line(&json!({ "boot": "b2" })).unwrap()
        );
        assert!(is_held(&path));
    }

    /// The guard's file is opened before the lock's, and a taker that finds
    /// the guard busy has not come to the lock's file yet.
    #[test]
    fn a_busy_guard_refuses_before_the_locks_file_is_created() {
        let dir = tempfile::tempdir().unwrap();
        let (path, guard) = lock_and_guard(&dir);
        std::fs::write(&guard, "").unwrap();
        let _guard = hold(&guard);

        let refused = OsLock::acquire_within(&path, Duration::from_millis(50), |_| {
            panic!("the record was written without the guard")
        });

        assert!(
            matches!(refused, Err(OsLockError::GuardBusy { .. })),
            "{refused:?}"
        );
        assert!(!path.exists());
    }

    /// `acquire`, with a short wait, while the test holds the guard, and the
    /// lock too when `lock_held`.
    fn acquire_while_the_guard_is_held(lock_held: bool) {
        let wait = Duration::from_millis(50);
        let dir = tempfile::tempdir().unwrap();
        let (path, guard) = lock_and_guard(&dir);
        std::fs::write(&path, LEFT_BEHIND).unwrap();
        std::fs::write(&guard, "").unwrap();
        let _guard = hold(&guard);
        let held = lock_held.then(|| hold(&path));

        let started = Instant::now();
        let refused = OsLock::acquire_within(&path, wait, |_| {
            panic!("the record was written without the guard")
        });

        match refused {
            Err(OsLockError::GuardBusy { path: at }) => assert_eq!(at, path),
            other => panic!("expected GuardBusy, got {other:?}"),
        }
        assert!(started.elapsed() >= wait, "it did not wait for the guard");
        assert_eq!(is_held(&path), held.is_some());
        drop(held);
        assert_eq!(read(&path), LEFT_BEHIND);
    }

    #[test]
    fn a_busy_guard_refuses_and_the_holders_record_is_not_read() {
        acquire_while_the_guard_is_held(true);
    }

    #[test]
    fn a_busy_guard_refuses_and_a_free_lock_is_left_free() {
        acquire_while_the_guard_is_held(false);
    }

    #[test]
    fn holder_is_guard_busy_after_the_wait_and_does_not_try_the_lock() {
        let wait = Duration::from_millis(50);
        let dir = tempfile::tempdir().unwrap();
        let (path, guard) = lock_and_guard(&dir);
        std::fs::write(&path, LEFT_BEHIND).unwrap();
        std::fs::write(&guard, "").unwrap();
        let _guard = hold(&guard);

        let started = Instant::now();
        let found = OsLock::holder_within(&path, wait).unwrap();

        assert_eq!(found, OsLockState::GuardBusy);
        assert!(started.elapsed() >= wait, "it did not wait for the guard");
        assert!(!is_held(&path));
        assert_eq!(read(&path), LEFT_BEHIND);
    }

    /// A second handle on the lock's open file stands in for a child process
    /// between its fork and its exec, which shares the file the same way.
    #[test]
    fn a_dropped_lock_is_free_at_once_though_its_open_file_is_still_shared() {
        let dir = tempfile::tempdir().unwrap();
        let (path, _) = lock_and_guard(&dir);
        let lock = OsLock::acquire(&path).unwrap();
        let _shared = lock.held.file.try_clone().unwrap();
        assert!(is_held(&path));

        drop(lock);

        assert!(!is_held(&path));
    }

    #[test]
    fn the_guard_is_free_at_once_though_its_open_file_is_still_shared() {
        let dir = tempfile::tempdir().unwrap();
        let (_, guard_file) = lock_and_guard(&dir);
        let guard = Guard::take(&guard_file, GUARD_WAIT).unwrap().unwrap();
        let _shared = guard.0.file.try_clone().unwrap();
        assert!(is_held(&guard_file));

        guard.let_go();

        assert!(!is_held(&guard_file));
    }

    /// What a forked child has is a copy of the lock's value on the same open
    /// file, in a process that did not take the lock. A real fork needs
    /// unsafe code, which this crate forbids, so the copy is made here with a
    /// taker that is not this process: the same comparison decides.
    #[test]
    fn a_copy_dropped_in_a_process_that_did_not_take_the_lock_leaves_it_held() {
        let dir = tempfile::tempdir().unwrap();
        let (path, _) = lock_and_guard(&dir);
        let lock = OsLock::acquire(&path).unwrap();
        let copy = Locked {
            file: lock.held.file.try_clone().unwrap(),
            taker: lock.held.taker.wrapping_add(1),
        };

        drop(copy);

        assert!(is_held(&path));
        drop(lock);
        assert!(!is_held(&path));
    }

    /// Askers never make a taker lose. Without the guard, a taker would find
    /// the lock held by an asker now and then.
    #[test]
    fn a_taker_is_never_refused_because_of_askers() {
        const TAKES: u64 = 300;
        let dir = tempfile::tempdir().unwrap();
        let (path, _) = lock_and_guard(&dir);
        std::fs::write(&path, LEFT_BEHIND).unwrap();
        // Odd while the taker is at the lock, even while it is away.
        let turn = AtomicU64::new(0);
        let done = AtomicBool::new(false);

        std::thread::scope(|scope| {
            for _ in 0..4 {
                scope.spawn(|| {
                    while !done.load(Ordering::SeqCst) {
                        let before = turn.load(Ordering::SeqCst);
                        let found = OsLock::holder(&path).unwrap();
                        let away =
                            before.is_multiple_of(2) && turn.load(Ordering::SeqCst) == before;
                        if away {
                            assert!(
                                matches!(found, OsLockState::Free | OsLockState::GuardBusy),
                                "a holder while the taker was away: {found:?}"
                            );
                        }
                    }
                });
            }
            for _ in 0..TAKES {
                turn.fetch_add(1, Ordering::SeqCst);
                let lock = loop {
                    match OsLock::acquire(&path) {
                        Ok(lock) => break lock,
                        // Only as slow as the machine: try again.
                        Err(OsLockError::GuardBusy { .. }) => {}
                        Err(refused) => {
                            done.store(true, Ordering::SeqCst);
                            panic!("the taker was refused: {refused:?}");
                        }
                    }
                };
                drop(lock);
                turn.fetch_add(1, Ordering::SeqCst);
            }
            done.store(true, Ordering::SeqCst);
        });
    }
}

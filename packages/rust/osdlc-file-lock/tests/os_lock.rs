//! The OS lock within one process: take, refuse, record, ask. Another open of
//! the lock's file stands in for another process, since two opens conflict
//! within one process too. `os_lock_processes.rs` has the tests with real
//! processes.
//!
//! No test here reads the lock's file while the lock is held: on Windows the
//! lock blocks that read.
#![cfg(any(unix, windows))]

use std::fs::{self, File};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use osdlc_file_lock::os_lock::{MAX_RECORD_LEN, OsLock, OsLockError, OsLockState, guard_path};
use serde_json::{Value, json};

/// A record a holder that died left in the lock file.
const LEFT_BEHIND: &str = "{\"pid\":1,\"boot\":\"old\",\"started_at\":\"2026-11-01\"}\n";

fn lock_in(dir: &tempfile::TempDir) -> PathBuf {
    dir.path().join("x.lock")
}

fn read(path: &Path) -> String {
    fs::read_to_string(path).unwrap()
}

/// Every name in the directory.
fn names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// A lock of the test's own on the file at `path`, which must exist.
fn hold(path: &Path) -> File {
    let file = File::open(path).unwrap();
    file.try_lock().unwrap();
    file
}

/// What a refused taker is told.
fn refused(taken: Result<OsLock, OsLockError>, path: &Path) -> OsLockState {
    match taken {
        Err(OsLockError::Held { path: at, holder }) => {
            assert_eq!(at, path);
            OsLockState::Held(holder)
        }
        Err(OsLockError::HeldUnnamed { path: at }) => {
            assert_eq!(at, path);
            OsLockState::HeldUnnamed
        }
        other => panic!("expected a held lock, got {other:?}"),
    }
}

/// Asserts that `found` is a held lock whose file holds `record`. On Unix the
/// record is read. On Windows the lock blocks the read, so the holder has no
/// name.
fn assert_holder(found: &OsLockState, record: Value) {
    if cfg!(windows) {
        assert_eq!(*found, OsLockState::HeldUnnamed);
        return;
    }
    let OsLockState::Held(holder) = found else {
        panic!("expected a named holder, got {found:?}");
    };
    assert_eq!(Some(u64::from(holder.pid)), record["pid"].as_u64());
    assert_eq!(Value::Object(holder.record.clone()), record);
}

#[test]
fn a_free_lock_is_taken_and_its_file_holds_the_pid() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);

    let lock = OsLock::acquire(&path).unwrap();

    assert_eq!(lock.path(), path);
    assert_eq!(guard_path(&path), dir.path().join("x.lock.guard"));
    assert_eq!(names(dir.path()), ["x.lock", "x.lock.guard"]);
    drop(lock);
    assert_eq!(read(&path), format!("{{\"pid\":{}}}\n", std::process::id()));
    assert_eq!(read(&guard_path(&path)), "");
}

#[test]
fn the_record_is_replaced_while_the_lock_is_held() {
    #[derive(serde::Serialize)]
    struct Info {
        pid: u32,
        boot_id: &'static str,
        started_at: &'static str,
    }
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    let pid = std::process::id();
    let mut lock = OsLock::acquire(&path).unwrap();

    // The pid is this process's, whatever the caller's record says.
    let info = Info {
        pid: 7,
        boot_id: "boot_0123",
        started_at: "2026-11-24T10:00:00.250Z",
    };
    lock.record(&info).unwrap();
    let whole =
        json!({ "pid": pid, "boot_id": "boot_0123", "started_at": "2026-11-24T10:00:00.250Z" });
    assert_holder(&OsLock::holder(&path).unwrap(), whole.clone());
    assert_holder(&refused(OsLock::acquire(&path), &path), whole);

    // A shorter record: the file is cut to it.
    lock.record(&json!({ "boot_id": "b" })).unwrap();
    assert_holder(
        &OsLock::holder(&path).unwrap(),
        json!({ "pid": pid, "boot_id": "b" }),
    );
    drop(lock);
    assert_eq!(
        read(&path),
        format!("{{\"pid\":{pid},\"boot_id\":\"b\"}}\n")
    );
}

#[test]
fn the_record_can_be_written_as_the_lock_is_taken() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    fs::write(&path, LEFT_BEHIND).unwrap();
    let pid = std::process::id();

    let lock = OsLock::acquire_with(&path, &json!({ "startedAt": "t" })).unwrap();

    assert_holder(
        &OsLock::holder(&path).unwrap(),
        json!({ "pid": pid, "startedAt": "t" }),
    );
    drop(lock);
    assert_eq!(
        read(&path),
        format!("{{\"pid\":{pid},\"startedAt\":\"t\"}}\n")
    );
}

#[test]
fn a_second_taker_is_refused_and_told_the_holder_until_the_lock_is_dropped() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    let pid = std::process::id();

    let first = OsLock::acquire(&path).unwrap();
    assert_holder(
        &refused(OsLock::acquire(&path), &path),
        json!({ "pid": pid }),
    );
    assert_holder(
        &refused(OsLock::acquire_with(&path, &json!({ "n": 2 })), &path),
        json!({ "pid": pid }),
    );

    drop(first);
    // The refused takers wrote nothing.
    assert_eq!(read(&path), format!("{{\"pid\":{pid}}}\n"));
    let again = OsLock::acquire(&path);
    assert!(again.is_ok(), "{:?}", again.err());
}

#[test]
fn a_file_left_behind_is_taken_and_its_record_replaced() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    fs::write(&path, LEFT_BEHIND).unwrap();

    let lock = OsLock::acquire(&path).unwrap();

    drop(lock);
    assert_eq!(read(&path), format!("{{\"pid\":{}}}\n", std::process::id()));
}

#[test]
fn a_held_lock_whose_file_names_nobody_is_held_unnamed() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    fs::write(&path, "garbage").unwrap();
    let held = hold(&path);

    assert_eq!(
        refused(OsLock::acquire(&path), &path),
        OsLockState::HeldUnnamed
    );
    assert_eq!(OsLock::holder(&path).unwrap(), OsLockState::HeldUnnamed);

    drop(held);
    assert_eq!(read(&path), "garbage");
}

/// A record as another writer would leave it: spaced, with no newline.
#[test]
fn a_held_lock_names_the_pid_and_the_record_in_its_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    let text = "{\"pid\": 4242, \"startedAt\": \"2026-11-24T10:00:00.000Z\"}";
    fs::write(&path, text).unwrap();
    let held = hold(&path);

    let record = json!({ "pid": 4242, "startedAt": "2026-11-24T10:00:00.000Z" });
    assert_holder(&refused(OsLock::acquire(&path), &path), record.clone());
    assert_holder(&OsLock::holder(&path).unwrap(), record);

    drop(held);
    assert_eq!(read(&path), text);
}

#[test]
fn holder_is_free_and_creates_nothing_without_a_lock_file() {
    let dir = tempfile::tempdir().unwrap();

    let no_file = OsLock::holder(&dir.path().join("x.lock")).unwrap();
    let no_folder = OsLock::holder(&dir.path().join("missing").join("x.lock")).unwrap();

    assert_eq!(no_file, OsLockState::Free);
    assert_eq!(no_folder, OsLockState::Free);
    assert!(names(dir.path()).is_empty());
}

#[test]
fn holder_is_free_on_a_free_lock_and_leaves_it_as_it_was() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    fs::write(&path, LEFT_BEHIND).unwrap();

    assert_eq!(OsLock::holder(&path).unwrap(), OsLockState::Free);

    assert_eq!(read(&path), LEFT_BEHIND);
    // It kept neither the lock nor the guard.
    let taken = OsLock::acquire(&path);
    assert!(taken.is_ok(), "{:?}", taken.err());
}

#[test]
fn holder_leaves_a_held_lock_and_its_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    let pid = std::process::id();
    let lock = OsLock::acquire(&path).unwrap();

    for _ in 0..3 {
        assert_holder(&OsLock::holder(&path).unwrap(), json!({ "pid": pid }));
    }

    assert_holder(
        &refused(OsLock::acquire(&path), &path),
        json!({ "pid": pid }),
    );
    drop(lock);
    assert_eq!(read(&path), format!("{{\"pid\":{pid}}}\n"));
}

#[test]
fn a_missing_directory_is_an_io_error() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("missing").join("x.lock");

    // The guard's file is opened first, so the error is about it.
    match OsLock::acquire(&path) {
        Err(OsLockError::Io { path: at, source }) => {
            assert_eq!(at, guard_path(&path));
            assert_eq!(source.kind(), ErrorKind::NotFound);
        }
        other => panic!("expected Io, got {other:?}"),
    }
    assert!(names(dir.path()).is_empty());
}

#[test]
fn holder_on_a_folder_is_an_io_error_and_creates_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("x.lock");
    fs::create_dir(&folder).unwrap();

    match OsLock::holder(&folder) {
        Err(OsLockError::Io { path: at, .. }) => assert_eq!(at, folder),
        other => panic!("expected Io, got {other:?}"),
    }
    assert_eq!(names(dir.path()), ["x.lock"]);
}

/// A process that only asks, run by a user who may read the two files and
/// not write them. Run as root, this shows nothing: root may write.
#[cfg(unix)]
#[test]
fn an_asker_needs_only_to_read_the_two_files() {
    use std::os::unix::fs::PermissionsExt;

    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    drop(OsLock::acquire(&path).unwrap());
    fs::write(&path, "{\"pid\":4242}\n").unwrap();
    for file in [&path, &guard_path(&path)] {
        fs::set_permissions(file, fs::Permissions::from_mode(0o444)).unwrap();
    }

    assert_eq!(OsLock::holder(&path).unwrap(), OsLockState::Free);
    let held = hold(&path);
    assert_holder(&OsLock::holder(&path).unwrap(), json!({ "pid": 4242 }));
    drop(held);
}

#[test]
fn a_record_that_is_not_a_json_object_is_refused_and_nothing_is_written() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    let invalid = |result: Result<(), OsLockError>| match result {
        Err(OsLockError::Io { path: at, source }) => {
            assert_eq!(at, path);
            assert_eq!(source.kind(), ErrorKind::InvalidInput);
        }
        other => panic!("expected Io, got {other:?}"),
    };

    invalid(OsLock::acquire_with(&path, &json!([1])).map(drop));
    assert!(names(dir.path()).is_empty());

    let mut lock = OsLock::acquire(&path).unwrap();
    invalid(lock.record(&json!("x")));
    invalid(lock.record(&json!({ "k": "x".repeat(MAX_RECORD_LEN) })));
    // Still held, with the record it had.
    assert_holder(
        &OsLock::holder(&path).unwrap(),
        json!({ "pid": std::process::id() }),
    );
    drop(lock);
    assert_eq!(read(&path), format!("{{\"pid\":{}}}\n", std::process::id()));
}

#[test]
fn an_error_says_which_lock_and_who_holds_it() {
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    fs::write(&path, "{\"pid\":4242}\n").unwrap();
    let _held = hold(&path);

    let refused = OsLock::acquire(&path).unwrap_err().to_string();

    let lock = path.display();
    if cfg!(windows) {
        assert_eq!(
            refused,
            format!("lock {lock} is held, and its file does not name the holder")
        );
    } else {
        assert_eq!(refused, format!("lock {lock} is held by pid 4242"));
    }
}

/// A holder replaces its record, a long one and a short one in turn, while
/// others ask and, on Unix, read the file. Whatever the timing, nobody is
/// told the lock is free or given another pid, and the file is never empty
/// and always starts with the holder's pid.
///
/// Where a file system never lets one read see half of one write, every
/// answer is also one of the two records, whole. No system promises that to
/// this test, so it is counted, not asserted: `--nocapture` shows the counts.
#[test]
fn a_holder_is_named_by_its_pid_while_it_replaces_its_record() {
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

    const WRITES: usize = 2000;
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    let pid = std::process::id();
    let long = json!({ "boot_id": "boot_0123", "started_at": "2026-11-24T10:00:00.250Z" });
    let short = json!({});
    let whole = |record: &Value| {
        let mut record = record.as_object().unwrap().clone();
        record.insert("pid".to_owned(), json!(pid));
        record
    };
    let (whole_long, whole_short) = (whole(&long), whole(&short));
    let pid_first = format!("{{\"pid\":{pid}");
    let mut lock = OsLock::acquire(&path).unwrap();
    let done = AtomicBool::new(false);
    let (asked, in_whole, mixed, unnamed) = (
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
        AtomicU64::new(0),
    );

    std::thread::scope(|scope| {
        for _ in 0..3 {
            scope.spawn(|| {
                while !done.load(Ordering::SeqCst) {
                    let count = match OsLock::holder(&path).unwrap() {
                        OsLockState::Held(holder) => {
                            assert_eq!(holder.pid, pid, "another pid: {holder:?}");
                            if holder.record == whole_long || holder.record == whole_short {
                                &in_whole
                            } else {
                                &mixed
                            }
                        }
                        OsLockState::HeldUnnamed => &unnamed,
                        OsLockState::GuardBusy => continue,
                        other => panic!("{other:?} while it is held"),
                    };
                    count.fetch_add(1, Ordering::SeqCst);
                    asked.fetch_add(1, Ordering::SeqCst);
                    // On Windows the lock blocks this read.
                    if cfg!(unix) {
                        let text = fs::read(&path).unwrap();
                        assert!(
                            text.starts_with(pid_first.as_bytes()),
                            "the file does not start with the pid: {:?}",
                            String::from_utf8_lossy(&text)
                        );
                    }
                }
            });
        }
        for write in 0..WRITES {
            let record = if write % 2 == 0 { &long } else { &short };
            if let Err(failed) = lock.record(record) {
                done.store(true, Ordering::SeqCst);
                panic!("{failed}");
            }
        }
        done.store(true, Ordering::SeqCst);
    });
    eprintln!(
        "{WRITES} records replaced, {asked:?} asks: {in_whole:?} a whole record, \
         {mixed:?} a mixed one, {unnamed:?} no name"
    );
}

/// The README says the two protocols do not exclude each other on one path.
/// This is how: a claim takes over the file an OS lock is held on, and a
/// second OS lock is then taken on the new file.
#[cfg(unix)]
#[test]
fn a_file_existence_claim_does_not_see_an_os_lock_on_the_same_path() {
    use osdlc_file_lock::{HeldLock, LockClaim, claim_lock};

    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    let _first = OsLock::acquire(&path).unwrap();

    let claim = claim_lock(&path, &json!({}), |_: &HeldLock| true).unwrap();
    assert!(matches!(claim, LockClaim::Claimed { .. }));
    let second = OsLock::acquire(&path);
    assert!(second.is_ok(), "{:?}", second.err());
}

/// What is true on Windows: while the lock is held, another open of its file
/// cannot read it, so nobody but the holder can read the record.
#[cfg(windows)]
#[test]
fn on_windows_a_held_lock_blocks_the_read_of_its_file() {
    const ERROR_LOCK_VIOLATION: i32 = 33;
    let dir = tempfile::tempdir().unwrap();
    let path = lock_in(&dir);
    let lock = OsLock::acquire(&path).unwrap();

    let blocked = fs::read(&path).unwrap_err();

    assert_eq!(blocked.raw_os_error(), Some(ERROR_LOCK_VIOLATION));
    drop(lock);
    assert_eq!(read(&path), format!("{{\"pid\":{}}}\n", std::process::id()));
}

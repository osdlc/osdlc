//! `with_lock`, the short critical section. Ported from `@osdlc/file-lock`'s
//! `section.test.ts`.

use std::fs::{self, File, FileTimes};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use osdlc_file_lock::{HeldLock, LockError, LockOptions, marker_for, with_lock};

fn age(path: &Path, secs: u64) {
    let old = SystemTime::now() - Duration::from_secs(secs);
    File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_times(FileTimes::new().set_accessed(old).set_modified(old))
        .unwrap();
}

fn beside(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn returns_the_section_result_and_releases_the_lock() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("x.lock");
    assert_eq!(with_lock(&lock, &LockOptions::new(), || 42).unwrap(), 42);
    assert!(beside(dir.path()).is_empty());
}

#[test]
fn the_lock_records_the_holder_pid_while_the_section_runs() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("x.lock");
    let content = with_lock(&lock, &LockOptions::new(), || {
        fs::read_to_string(&lock).unwrap()
    })
    .unwrap();
    let v: serde_json::Value = serde_json::from_str(&content).unwrap();
    assert_eq!(v["pid"], std::process::id());
    assert!(v["token"].is_string());
}

#[test]
fn releases_the_lock_when_the_section_panics() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("x.lock");
    let caught = std::panic::catch_unwind(|| {
        with_lock(&lock, &LockOptions::new(), || panic!("boom")).unwrap();
    });
    assert!(caught.is_err());
    assert!(beside(dir.path()).is_empty());
}

#[test]
fn a_lock_left_by_a_killed_process_does_not_block() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("x.lock");
    fs::write(&lock, "{\"pid\": 2147483646, \"token\": \"dead\"}").unwrap();
    age(&lock, 60);
    assert!(with_lock(&lock, &LockOptions::new(), || true).unwrap());
    assert!(beside(dir.path()).is_empty());
}

#[test]
fn a_live_lock_makes_a_waiter_time_out_with_the_holder_named() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("x.lock");
    fs::write(&lock, "{\"pid\": 1, \"token\": \"live\"}").unwrap();
    let options = LockOptions::new().timeout(Duration::from_millis(50));
    match with_lock(&lock, &options, || unreachable!()) {
        Err(LockError::Timeout { path, holder }) => {
            assert_eq!(path, lock);
            assert_eq!(holder.unwrap().token(), Some("live"));
        }
        other => panic!("{other:?}"),
    }
    assert_eq!(beside(dir.path()), ["x.lock"]);
}

#[test]
fn a_zero_timeout_tries_once() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("x.lock");
    fs::write(&lock, "{\"token\": \"live\"}").unwrap();
    let start = std::time::Instant::now();
    let options = LockOptions::new().timeout(Duration::ZERO);
    assert!(matches!(
        with_lock(&lock, &options, || ()),
        Err(LockError::Timeout { .. })
    ));
    assert!(start.elapsed() < Duration::from_secs(1));
}

#[test]
fn a_waiter_facing_a_live_reaper_times_out_with_no_holder() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("x.lock");
    fs::write(&lock, "{\"token\": \"dead\"}").unwrap();
    age(&lock, 60);
    fs::write(marker_for(&lock, "{\"token\": \"dead\"}"), "").unwrap();
    let options = LockOptions::new().timeout(Duration::from_millis(50));
    match with_lock(&lock, &options, || ()) {
        Err(LockError::Timeout { holder, .. }) => assert!(holder.is_none()),
        other => panic!("{other:?}"),
    }
}

#[test]
fn a_custom_rule_replaces_the_age_rule() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("x.lock");
    fs::write(&lock, "{\"pid\": 1, \"token\": \"old\"}").unwrap();
    age(&lock, 3_600);
    // Never stale, however old: the waiter times out.
    let patient = LockOptions::new()
        .timeout(Duration::ZERO)
        .is_stale(|_: &HeldLock| false);
    assert!(with_lock(&lock, &patient, || ()).is_err());
    // Always stale, however fresh: the waiter takes over.
    fs::write(&lock, "{\"pid\": 1, \"token\": \"new\"}").unwrap();
    let eager = LockOptions::new().is_stale(|_: &HeldLock| true);
    assert!(with_lock(&lock, &eager, || ()).is_ok());
}

#[test]
fn a_missing_directory_is_an_io_error_and_the_section_does_not_run() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("missing").join("x.lock");
    assert!(matches!(
        with_lock(&lock, &LockOptions::new(), || unreachable!()),
        Err(LockError::Io { .. })
    ));
}

#[test]
fn parallel_threads_do_not_lose_updates_to_a_read_modify_write_counter() {
    let dir = tempfile::tempdir().unwrap();
    let counter = Arc::new(dir.path().join("counter"));
    let lock = Arc::new(dir.path().join("counter.lock"));
    fs::write(&*counter, "0").unwrap();
    let handles: Vec<_> = (0..6)
        .map(|_| {
            let counter = Arc::clone(&counter);
            let lock = Arc::clone(&lock);
            std::thread::spawn(move || {
                for _ in 0..25 {
                    with_lock(&lock, &LockOptions::new(), || {
                        let n: u32 = fs::read_to_string(&*counter).unwrap().parse().unwrap();
                        std::thread::yield_now();
                        fs::write(&*counter, (n + 1).to_string()).unwrap();
                    })
                    .unwrap();
                }
            })
        })
        .collect();
    for h in handles {
        h.join().unwrap();
    }
    assert_eq!(fs::read_to_string(&*counter).unwrap(), "150");
    assert_eq!(beside(dir.path()), ["counter"]);
}

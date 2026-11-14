//! The held lock: claim, takeover, touch, update and release. Ported from
//! `@osdlc/file-lock`'s `held.test.ts` and `takeover-race.test.ts`.

use std::fs::{self, File, FileTimes};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Barrier};
use std::time::{Duration, SystemTime};

use osdlc_file_lock::{
    HeldLock, LockClaim, claim_lock, marker_for, release_lock, touch_lock, untouched_for,
    update_lock,
};
use serde_json::{Value, json};

fn lock_in(dir: &tempfile::TempDir) -> PathBuf {
    dir.path().join("x.lock")
}

/// Set `path`'s mtime `secs` into the past.
fn age(path: &Path, secs: u64) {
    let old = SystemTime::now() - Duration::from_secs(secs);
    File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_times(FileTimes::new().set_accessed(old).set_modified(old))
        .unwrap();
}

fn never(_: &HeldLock) -> bool {
    false
}

fn always(_: &HeldLock) -> bool {
    true
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

/// Names in the lock's directory other than the lock itself.
fn beside(dir: &tempfile::TempDir) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|n| n != "x.lock")
        .collect();
    names.sort();
    names
}

fn claimed(claim: LockClaim) -> String {
    match claim {
        LockClaim::Claimed { token } => token,
        LockClaim::Held { holder } => panic!("held by {holder:?}"),
    }
}

#[test]
fn claims_a_free_lock_with_its_fields_and_a_token_and_leaves_no_temp_file() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    let token = claimed(claim_lock(&lock, &json!({"pid": 7, "name": "a"}), never).unwrap());
    assert_eq!(
        read_json(&lock),
        json!({"pid": 7, "name": "a", "token": token})
    );
    assert!(beside(&dir).is_empty());
}

#[test]
fn a_token_field_in_the_content_is_replaced_by_the_claim_token() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    let token = claimed(claim_lock(&lock, &json!({"token": "mine"}), never).unwrap());
    assert_ne!(token, "mine");
    assert_eq!(read_json(&lock)["token"], token);
}

#[test]
fn content_that_is_not_an_object_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let err = claim_lock(&lock_in(&dir), &json!([1]), never).unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput);
}

#[test]
fn a_live_lock_is_held_and_named() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    claimed(claim_lock(&lock, &json!({"pid": 1}), never).unwrap());
    match claim_lock(&lock, &json!({"pid": 2}), never).unwrap() {
        LockClaim::Held { holder: Some(h) } => assert_eq!(h.content.unwrap()["pid"], 1),
        other => panic!("{other:?}"),
    }
    assert!(beside(&dir).is_empty());
}

#[test]
fn a_stale_lock_is_replaced_and_the_old_owner_cannot_release_the_new_one() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    let old = claimed(claim_lock(&lock, &json!({"pid": 1}), never).unwrap());
    age(&lock, 60);
    let new = claimed(
        claim_lock(
            &lock,
            &json!({"pid": 2}),
            untouched_for(Duration::from_secs(10)),
        )
        .unwrap(),
    );
    assert!(!release_lock(&lock, &old).unwrap());
    assert_eq!(read_json(&lock)["token"], new);
    assert!(release_lock(&lock, &new).unwrap());
    assert!(!lock.exists());
    assert!(beside(&dir).is_empty());
}

#[test]
fn the_rule_sees_the_held_content_mtime_and_raw_text() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    fs::write(&lock, "{\"pid\": 9, \"token\": \"t\"}").unwrap();
    age(&lock, 30);
    let seen = std::cell::RefCell::new(None);
    let _ = claim_lock(&lock, &json!({}), |h: &HeldLock| {
        *seen.borrow_mut() = Some(h.clone());
        false
    })
    .unwrap();
    let h = seen.into_inner().unwrap();
    assert_eq!(h.raw, "{\"pid\": 9, \"token\": \"t\"}");
    assert_eq!(h.token(), Some("t"));
    let age = SystemTime::now().duration_since(h.modified).unwrap();
    assert!(age >= Duration::from_secs(29), "{age:?}");
}

#[test]
fn an_unparseable_lock_reaches_the_rule_with_no_content_and_is_never_released() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    fs::write(&lock, "5f0c3c8e-6a3e-4d34-9c39-2a1b7f1d0c11").unwrap();
    match claim_lock(&lock, &json!({}), never).unwrap() {
        LockClaim::Held { holder: Some(h) } => assert!(h.content.is_none()),
        other => panic!("{other:?}"),
    }
    assert!(!release_lock(&lock, "5f0c3c8e-6a3e-4d34-9c39-2a1b7f1d0c11").unwrap());
    assert!(lock.exists());
}

#[test]
fn a_lock_whose_content_exceeds_the_file_name_limit_is_still_taken_over() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    fs::write(&lock, format!("{{\"note\": \"{}\"}}", "a".repeat(1_000))).unwrap();
    claimed(claim_lock(&lock, &json!({}), always).unwrap());
}

#[test]
fn a_marker_held_by_another_reaper_leaves_the_stale_lock_alone() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    fs::write(&lock, "{\"token\": \"dead\"}").unwrap();
    let marker = marker_for(&lock, "{\"token\": \"dead\"}");
    fs::write(&marker, "").unwrap();
    assert_eq!(
        claim_lock(&lock, &json!({}), always).unwrap(),
        LockClaim::Held { holder: None }
    );
    assert_eq!(fs::read_to_string(&lock).unwrap(), "{\"token\": \"dead\"}");
    fs::remove_file(&marker).unwrap();
    claimed(claim_lock(&lock, &json!({}), always).unwrap());
}

#[test]
fn the_marker_is_named_from_a_hash_of_the_raw_text() {
    let marker = marker_for(Path::new("/l/x.lock"), "");
    // sha256("") starts e3b0c44298fc1c149afbf4c8.
    assert_eq!(
        marker,
        Path::new("/l/x.lock.stale-e3b0c44298fc1c149afbf4c8")
    );
}

#[test]
fn a_missing_directory_is_an_error_not_a_held_lock() {
    let dir = tempfile::tempdir().unwrap();
    let lock = dir.path().join("missing").join("x.lock");
    assert!(claim_lock(&lock, &json!({}), never).is_err());
}

#[test]
fn claimants_racing_over_one_stale_lock_exactly_one_wins() {
    for _ in 0..20 {
        let dir = tempfile::tempdir().unwrap();
        let lock = lock_in(&dir);
        fs::write(&lock, "{\"token\": \"dead\"}").unwrap();
        age(&lock, 60);
        let n = 8;
        let barrier = Arc::new(Barrier::new(n));
        let handles: Vec<_> = (0..n)
            .map(|i| {
                let lock = lock.clone();
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    claim_lock(
                        &lock,
                        &json!({"i": i}),
                        untouched_for(Duration::from_secs(10)),
                    )
                    .unwrap()
                })
            })
            .collect();
        let wins = handles
            .into_iter()
            .map(|h| h.join().unwrap())
            .filter(|c| c.token().is_some())
            .count();
        assert_eq!(wins, 1);
        assert!(beside(&dir).is_empty(), "{:?}", beside(&dir));
    }
}

#[test]
fn touch_refreshes_the_mtime_only_with_the_token() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    let token = claimed(claim_lock(&lock, &json!({}), never).unwrap());
    age(&lock, 60);
    assert!(!touch_lock(&lock, "other").unwrap());
    let stale = untouched_for(Duration::from_secs(10));
    let mtime = || fs::metadata(&lock).unwrap().modified().unwrap();
    let held = |m| HeldLock {
        content: None,
        modified: m,
        raw: String::new(),
    };
    assert!(stale(&held(mtime())));
    assert!(touch_lock(&lock, &token).unwrap());
    assert!(!stale(&held(mtime())));
    fs::remove_file(&lock).unwrap();
    assert!(!touch_lock(&lock, &token).unwrap());
}

#[test]
fn update_rewrites_the_content_keeping_the_token() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    let token = claimed(claim_lock(&lock, &json!({"pid": 1}), never).unwrap());
    assert!(
        update_lock(&lock, &token, |c| {
            let mut c = c.clone();
            c.insert("phase".into(), json!("run"));
            c.insert("token".into(), json!("forged"));
            c
        })
        .unwrap()
    );
    assert_eq!(
        read_json(&lock),
        json!({"pid": 1, "phase": "run", "token": token})
    );
    assert!(!update_lock(&lock, "other", |c| c.clone()).unwrap());
    assert!(beside(&dir).is_empty());
    fs::remove_file(&lock).unwrap();
    assert!(!update_lock(&lock, &token, |c| c.clone()).unwrap());
    assert!(beside(&dir).is_empty());
}

#[test]
fn release_leaves_a_takers_lock_and_nothing_beside_it() {
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    claimed(claim_lock(&lock, &json!({}), never).unwrap());
    assert!(!release_lock(&lock, "other").unwrap());
    assert!(lock.exists());
    assert!(beside(&dir).is_empty());
    fs::remove_file(&lock).unwrap();
    assert!(!release_lock(&lock, "other").unwrap());
}

#[cfg(unix)]
#[test]
fn errors_other_than_gone_are_returned_not_reported_as_a_lost_lock() {
    use std::os::unix::fs::PermissionsExt;
    if is_root() {
        return; // root reads through any mode
    }
    let dir = tempfile::tempdir().unwrap();
    let lock = lock_in(&dir);
    let token = claimed(claim_lock(&lock, &json!({}), never).unwrap());
    fs::set_permissions(&lock, fs::Permissions::from_mode(0o000)).unwrap();
    assert!(touch_lock(&lock, &token).is_err());
    assert!(update_lock(&lock, &token, |c| c.clone()).is_err());
    assert!(release_lock(&lock, &token).is_err());
    fs::set_permissions(&lock, fs::Permissions::from_mode(0o600)).unwrap();
}

#[cfg(unix)]
fn is_root() -> bool {
    use std::os::unix::fs::MetadataExt;
    // A file we create is owned by our uid.
    let dir = tempfile::tempdir().unwrap();
    let probe = dir.path().join("probe");
    fs::write(&probe, "").unwrap();
    fs::metadata(&probe).unwrap().uid() == 0
}

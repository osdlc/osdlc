//! The held lock: a file whose existence means "taken", whose content names the
//! holder, and which carries a random token so only the claim that wrote it
//! can touch, rewrite or release it.
//!
//! - Claim: the whole content, token included, is written to a temp file and
//!   hard-linked to the lock path. `link()` fails with `EEXIST` just as
//!   `O_EXCL` does, so one of several racing claimants wins, and the lock
//!   never exists empty or half written.
//! - Takeover of a stale lock: the caller's rule judges a held lock. One it
//!   judges stale is hard-linked to a marker named from a hash of its content,
//!   exclusively, so one reaper wins. The winner removes the lock only if it
//!   still reads as it did when it was judged, removes the marker, and claims
//!   again. A loser claims again too.
//! - Release, touch and rewrite act only while the lock still holds this
//!   claim's token, so an owner whose lock was taken over never disturbs the
//!   taker's.
//!
//! Every file name and every comparison here is part of the protocol that
//! `@osdlc/file-lock` follows too: `packages/conformance/file-lock/SPEC.md`.

use std::ffi::OsString;
use std::fs::{self, File, FileTimes};
use std::io::{self, ErrorKind, Read};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// What a lock file holds: the fields its owner recorded, and the claim's
/// `token`. The fields are read back from disk unchecked.
pub type LockContent = Map<String, Value>;

/// A lock as found on disk.
#[derive(Debug, Clone, PartialEq)]
pub struct HeldLock {
    /// The parsed content, or `None` when the file is not a JSON object, or
    /// its `token` is not a string.
    pub content: Option<LockContent>,
    /// When the lock was last written or touched.
    pub modified: SystemTime,
    /// The file's text, with each byte sequence that is not UTF-8 read as
    /// U+FFFD. A takeover removes the lock only while it still reads exactly
    /// this.
    pub raw: String,
}

impl HeldLock {
    /// The holder's token, when the content has one.
    pub fn token(&self) -> Option<&str> {
        self.content.as_ref()?.get("token")?.as_str()
    }
}

/// Judges a held lock: true when its holder is gone and the lock may be taken over.
pub trait StaleRule: Fn(&HeldLock) -> bool {}
impl<F: Fn(&HeldLock) -> bool> StaleRule for F {}

/// The outcome of [`claim_lock`].
#[derive(Debug, Clone, PartialEq)]
pub enum LockClaim {
    /// The lock is ours. The token touches, rewrites and releases it.
    Claimed {
        /// This claim's token, also written into the lock.
        token: String,
    },
    /// Someone else holds the lock. `holder` is the live holder, or `None`
    /// when the lock could not be settled: it kept changing, or it is stale
    /// and another claimant's takeover is still in progress. Try again
    /// shortly.
    Held {
        /// The live holder, when one was seen.
        holder: Option<HeldLock>,
    },
}

impl LockClaim {
    /// The token, when the lock was claimed.
    pub fn token(&self) -> Option<&str> {
        match self {
            LockClaim::Claimed { token } => Some(token),
            LockClaim::Held { .. } => None,
        }
    }
}

/// A takeover marker older than this belongs to a reaper that died
/// mid-takeover: a live one holds its marker for microseconds. It is judged by
/// the inode's ctime on Unix. The marker is a hard link of the lock, so its
/// mtime is the lock's, but linking sets the ctime.
pub const MARKER_STALE: Duration = Duration::from_secs(10);

/// Claim attempts before giving up: enough for a few reapers racing over one
/// stale lock.
const CLAIM_ATTEMPTS: usize = 6;

/// `path` with `suffix` appended to its last component.
fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = OsString::from(path.as_os_str());
    name.push(suffix);
    PathBuf::from(name)
}

fn is_gone(err: &io::Error) -> bool {
    err.kind() == ErrorKind::NotFound
}

/// Parse a lock's text: a JSON object whose `token`, when present, is a string.
fn parse(raw: &str) -> Option<LockContent> {
    let Ok(Value::Object(map)) = serde_json::from_str::<Value>(raw) else {
        return None;
    };
    match map.get("token") {
        None | Some(Value::String(_)) => Some(map),
        Some(_) => None,
    }
}

fn read_text(path: &Path) -> io::Result<String> {
    Ok(String::from_utf8_lossy(&fs::read(path)?).into_owned())
}

fn token_of(path: &Path) -> io::Result<Option<String>> {
    let content = parse(&read_text(path)?);
    Ok(content.and_then(|c| match c.get("token") {
        Some(Value::String(t)) => Some(t.clone()),
        _ => None,
    }))
}

/// The lock's text and its mtime, both from one open of the file, so they
/// describe the same inode.
fn read_held(path: &Path) -> io::Result<HeldLock> {
    let mut file = File::open(path)?;
    let modified = file.metadata()?.modified()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    let raw = String::from_utf8_lossy(&bytes).into_owned();
    Ok(HeldLock {
        content: parse(&raw),
        modified,
        raw,
    })
}

/// The JSON object `content` serialises to, or an `InvalidInput` error.
fn to_object(content: &impl Serialize) -> io::Result<LockContent> {
    match serde_json::to_value(content) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err(io::Error::new(
            ErrorKind::InvalidInput,
            "lock content must serialise to a JSON object",
        )),
        Err(e) => Err(io::Error::new(ErrorKind::InvalidInput, e)),
    }
}

fn serialize(mut content: LockContent, token: &str) -> String {
    content.insert("token".to_owned(), Value::String(token.to_owned()));
    let mut text = serde_json::to_string_pretty(&Value::Object(content))
        .expect("a JSON map always serialises");
    text.push('\n');
    text
}

/// The takeover marker's path for a lock at `path` whose text is `raw`:
/// `<path>.stale-<the first 24 hex digits of sha256(raw)>`. Named from a hash
/// because the content can be longer than a file name may be.
pub fn marker_for(path: &Path, raw: &str) -> PathBuf {
    let digest = Sha256::digest(raw.as_bytes());
    let hex: String = digest.iter().take(12).map(|b| format!("{b:02x}")).collect();
    sibling(path, &format!(".stale-{hex}"))
}

/// Claim the lock at `path`, recording `content` in it as JSON with a fresh
/// token added (a `token` field in `content` is replaced). `content` must
/// serialise to a JSON object. A held lock that `is_stale` answers true for
/// is taken over, and one of several takers wins; one it answers false for is
/// live, and the result names it. The directory must exist. Errors other than
/// "already held" are returned.
pub fn claim_lock(
    path: &Path,
    content: &impl Serialize,
    is_stale: impl StaleRule,
) -> io::Result<LockClaim> {
    let claim = PreparedClaim::new(path, content)?;
    claim.attempt(&is_stale)
}

/// A claim whose temp file is written once and attempted as often as needed,
/// so `with_lock` creates no new file on each retry. The temp file is removed
/// on drop.
pub(crate) struct PreparedClaim {
    path: PathBuf,
    tmp: PathBuf,
    token: String,
}

impl PreparedClaim {
    pub(crate) fn new(path: &Path, content: &impl Serialize) -> io::Result<Self> {
        let content = to_object(content)?;
        let token = uuid::Uuid::new_v4().to_string();
        let tmp = sibling(path, &format!(".new-{token}"));
        fs::write(&tmp, serialize(content, &token))?;
        Ok(Self {
            path: path.to_path_buf(),
            tmp,
            token,
        })
    }

    pub(crate) fn attempt(&self, is_stale: &dyn Fn(&HeldLock) -> bool) -> io::Result<LockClaim> {
        for _ in 0..CLAIM_ATTEMPTS {
            match fs::hard_link(&self.tmp, &self.path) {
                Ok(()) => {
                    return Ok(LockClaim::Claimed {
                        token: self.token.clone(),
                    });
                }
                Err(e) if e.kind() == ErrorKind::AlreadyExists => {}
                Err(e) => return Err(e),
            }
            // Released between the link and the read: claim again.
            let Ok(held) = read_held(&self.path) else {
                continue;
            };
            if !is_stale(&held) {
                return Ok(LockClaim::Held { holder: Some(held) });
            }
            take_over(&self.path, &held);
        }
        // Every holder seen was stale and mid-takeover, or the lock kept
        // changing: no live holder to name.
        Ok(LockClaim::Held { holder: None })
    }
}

impl Drop for PreparedClaim {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.tmp);
    }
}

/// Remove the stale lock so one of several takers can claim a new one. A
/// loser just claims again.
fn take_over(path: &Path, seen: &HeldLock) {
    match read_text(path) {
        Ok(raw) if raw == seen.raw => {}
        _ => return, // replaced since it was judged, or gone
    }
    let marker = marker_for(path, &seen.raw);
    if let Err(e) = fs::hard_link(path, &marker) {
        // Another reaper holds the marker, or one died holding it. A marker
        // that old is cleared, and the caller's next attempt takes over.
        if e.kind() == ErrorKind::AlreadyExists {
            clear_dead_marker(&marker);
        }
        return;
    }
    // Still the very lock that was judged: the same bytes, and not touched since.
    let unchanged = (|| -> io::Result<bool> {
        let now = read_held(path)?;
        Ok(read_text(&marker)? == seen.raw && now.raw == seen.raw && now.modified == seen.modified)
    })();
    if matches!(unchanged, Ok(true)) {
        let _ = fs::remove_file(path);
    }
    let _ = fs::remove_file(&marker);
}

#[cfg(unix)]
fn changed_at(meta: &fs::Metadata) -> Option<SystemTime> {
    use std::os::unix::fs::MetadataExt;
    let secs = u64::try_from(meta.ctime()).ok()?;
    let nanos = u32::try_from(meta.ctime_nsec()).ok()?;
    SystemTime::UNIX_EPOCH.checked_add(Duration::new(secs, nanos))
}

#[cfg(not(unix))]
fn changed_at(meta: &fs::Metadata) -> Option<SystemTime> {
    meta.modified().ok()
}

fn clear_dead_marker(marker: &Path) {
    clear_dead_marker_at(marker, SystemTime::now());
}

/// [`clear_dead_marker`] with the clock passed in, for the tests.
pub(crate) fn clear_dead_marker_at(marker: &Path, now: SystemTime) {
    let Ok(meta) = fs::metadata(marker) else {
        return; // gone meanwhile
    };
    let Some(changed) = changed_at(&meta) else {
        return;
    };
    if now
        .duration_since(changed)
        .is_ok_and(|age| age >= MARKER_STALE)
    {
        let _ = fs::remove_file(marker);
    }
}

/// Refresh the lock's mtime while it still holds `token`: the holder's sign
/// of life, for a rule such as [`untouched_for`](crate::untouched_for).
/// Returns false when the lock is gone or holds another token. Any other
/// error is returned.
pub fn touch_lock(path: &Path, token: &str) -> io::Result<bool> {
    let touch = || -> io::Result<bool> {
        if token_of(path)?.as_deref() != Some(token) {
            return Ok(false);
        }
        let now = SystemTime::now();
        let file = File::options().write(true).open(path)?;
        file.set_times(FileTimes::new().set_accessed(now).set_modified(now))?;
        Ok(true)
    };
    match touch() {
        Err(e) if is_gone(&e) => Ok(false), // finishing, or taken over
        other => other,
    }
}

/// Replace the content of the lock while it still holds `token`. `update`
/// gets the current content and returns the new fields; the token is kept.
/// The new content is written to a temp file and renamed over the lock, so a
/// reader never sees it half written. Returns false when the lock is gone or
/// holds another token, and leaves it as it was. Any other error is returned.
///
/// The token check and the rename are two steps: a takeover that lands
/// between them is overwritten. A rule that never judges a live holder stale
/// closes that window.
pub fn update_lock(
    path: &Path,
    token: &str,
    update: impl FnOnce(&LockContent) -> LockContent,
) -> io::Result<bool> {
    let content = match read_text(path) {
        Ok(raw) => parse(&raw),
        Err(e) if is_gone(&e) => return Ok(false), // released or taken over
        Err(e) => return Err(e),
    };
    let Some(content) = content else {
        return Ok(false);
    };
    if content.get("token").and_then(Value::as_str) != Some(token) {
        return Ok(false);
    }
    let next = serialize(update(&content), token);
    let tmp = sibling(path, &format!(".new-{}", uuid::Uuid::new_v4()));
    match fs::write(&tmp, next).and_then(|()| fs::rename(&tmp, path)) {
        Ok(()) => Ok(true),
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            if is_gone(&e) { Ok(false) } else { Err(e) }
        }
    }
}

/// Remove the lock only while it holds `token`: an owner whose lock was taken
/// over must not delete the taker's. Returns whether it removed it: false
/// when the lock is gone or holds another token. Any other error is returned.
///
/// The lock is renamed aside, which is atomic, and its token checked there,
/// so the file removed is exactly the file checked. If it was taken over in
/// the instant between the first check and the rename, it is linked back,
/// unless a new claim also landed in that instant.
pub fn release_lock(path: &Path, token: &str) -> io::Result<bool> {
    match token_of(path) {
        Ok(t) if t.as_deref() == Some(token) => {}
        Ok(_) => return Ok(false),
        Err(e) if is_gone(&e) => return Ok(false), // already released
        Err(e) => return Err(e),
    }
    let aside = sibling(path, &format!(".release-{}", uuid::Uuid::new_v4()));
    match fs::rename(path, &aside) {
        Ok(()) => {}
        Err(e) if is_gone(&e) => return Ok(false), // taken over and released
        Err(e) => return Err(e),
    }
    let outcome = (|| -> io::Result<bool> {
        if token_of(&aside)?.as_deref() == Some(token) {
            return Ok(true);
        }
        // Not ours: put the taker's lock back.
        match fs::hard_link(&aside, path) {
            Ok(()) => Ok(false),
            // A new claim landed while the lock was aside, and that claimant holds it now.
            Err(e) if e.kind() == ErrorKind::AlreadyExists => Ok(false),
            Err(e) => Err(e),
        }
    })();
    let _ = fs::remove_file(&aside);
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_takes_an_object_whose_token_is_a_string_or_absent() {
        assert!(parse(r#"{"pid": 1}"#).is_some());
        assert!(parse(r#"{"token": "t"}"#).is_some());
        assert!(parse(r#"{"token": 5}"#).is_none());
        assert!(parse("[1]").is_none());
        assert!(parse("null").is_none());
        assert!(parse("5f0c3c8e-6a3e-4d34-9c39-2a1b7f1d0c11").is_none());
    }

    #[test]
    fn a_marker_from_a_dead_reaper_is_cleared_and_a_live_one_kept() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("x.lock.stale-0");
        fs::write(&marker, "x").unwrap();
        clear_dead_marker_at(&marker, SystemTime::now());
        assert!(marker.exists(), "a fresh marker is a live reaper's");
        clear_dead_marker_at(
            &marker,
            SystemTime::now() + MARKER_STALE + Duration::from_secs(1),
        );
        assert!(!marker.exists(), "an old marker is a dead reaper's");
    }

    #[test]
    fn serialize_replaces_a_token_in_the_content() {
        let mut content = LockContent::new();
        content.insert("token".into(), Value::String("mine".into()));
        let text = serialize(content, "claim");
        assert_eq!(parse(&text).unwrap()["token"], "claim");
        assert!(text.ends_with('\n'));
    }
}

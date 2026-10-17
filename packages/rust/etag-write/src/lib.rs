//! Atomic write, sha256 etag, and compare-and-swap.
//!
//! Two failure modes this closes, both of which a plain `fs::write` leaves
//! open:
//!
//! **Torn files.** `fs::write` truncates and then writes. A reader (an
//! editor, a file watcher, another process) that opens the file in between
//! sees a truncated file; a crash in between leaves one on disk for good.
//! The fix is the standard one: write a temp file in the SAME directory
//! (`rename` is only atomic within a filesystem), fsync it so the bytes are
//! durable before the name points at them, rename, then best-effort fsync the
//! directory so the rename itself survives a power cut. Windows cannot open a
//! directory as a file, so it skips the directory fsync.
//!
//! **Lost updates.** When a person and a program edit the same file, a
//! program that writes without checking silently discards whatever the
//! person typed since the program read it. [`write_cas`] takes the etag the
//! caller read and refuses the write if the file changed:
//!
//! | on disk | etag supplied | result |
//! |---|---|---|
//! | exists | matches | write |
//! | exists | differs | `Conflict` |
//! | exists | none | `ExistsWithoutEtag` — "send its etag to overwrite" |
//! | absent | none | create |
//! | absent | some | create (the file was deleted under us) |
//! | unreadable | any | `Io` — never treated as absent |
//!
//! The third row is the important one: an absent etag on an existing file is
//! a *blind* write, and blind writes are how edits get lost.
//!
//! Temp files are named `.<name>.etag-write-<pid>-<n>.tmp` in the target's
//! directory. Every failed write removes its temp file.
//!
//! **Stability.** Each item's docs say "stable in 0.x": it is not expected
//! to change. The crate stays on 0.x for now, so a breaking change, if one
//! is ever needed, ships as 0.2 rather than 2.0.

#![forbid(unsafe_code)]
#![warn(missing_docs, clippy::missing_errors_doc, clippy::missing_panics_doc)]

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// Runs the README's code blocks as doc-tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;

/// Why a write did not happen.
///
/// New variants may be added in a minor release, so a `match` needs a
/// wildcard arm.
///
/// Each `path` field is the exact path given. The `Display` text shows it
/// with [`Path::display`], which is lossy for a path that is not UTF-8.
///
/// **Stability:** stable in 0.x. The three variants and their fields are
/// not expected to change; new variants may be added.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum WriteError {
    /// The file's current etag differs from the one the caller sent: it
    /// changed on disk since it was read. Nothing was written.
    #[error("{} changed on disk since it was read", path.display())]
    Conflict {
        /// The target path, as given.
        path: PathBuf,
    },
    /// The file exists but the caller sent no etag, so the write would be a
    /// blind overwrite. Nothing was written.
    #[error("{} exists — send its etag to overwrite", path.display())]
    ExistsWithoutEtag {
        /// The target path, as given.
        path: PathBuf,
    },
    /// A filesystem call failed: reading the existing file, creating the
    /// parent directory, creating the temp file (including when all 65 temp
    /// names are taken), writing it, setting its permissions, syncing it, or
    /// the rename.
    #[error("io error writing {}: {source}", path.display())]
    Io {
        /// The target path, as given.
        path: PathBuf,
        /// The underlying error.
        #[source]
        source: std::io::Error,
    },
}

/// The etag of some bytes: lowercase hex sha256.
///
/// **Stability:** stable in 0.x. The etag format will not change.
///
/// ```
/// assert_eq!(
///     etag_write::etag(b"abc"),
///     "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
/// );
/// ```
#[must_use]
pub fn etag(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// The etag of a file, or `None` when it does not exist.
///
/// **Stability:** stable in 0.x.
///
/// # Errors
///
/// Any read error other than `NotFound`, such as permission denied. An
/// unreadable file is never reported as absent.
///
/// # Examples
///
/// ```
/// use etag_write::{etag, etag_of_file};
///
/// let dir = tempfile::tempdir()?;
/// let path = dir.path().join("a.txt");
/// assert_eq!(etag_of_file(&path)?, None);
///
/// std::fs::write(&path, b"hello")?;
/// assert_eq!(etag_of_file(&path)?, Some(etag(b"hello")));
/// # Ok::<(), std::io::Error>(())
/// ```
pub fn etag_of_file(path: &Path) -> io::Result<Option<String>> {
    Ok(read_or_none(path)?.map(|b| etag(&b)))
}

/// The file's bytes, or `None` if it does not exist.
fn read_or_none(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Removes the temp file it names when dropped, unless disarmed.
///
/// Every exit between creating the temp file and a successful rename has to
/// leave the directory as it found it, and there are four of them: the
/// write, setting permissions, the sync and the rename. A guard
/// makes that structural rather than something each new early return has to
/// remember. Leaks are not self-healing: the names are deterministic per pid
/// and attempt, so a leaked one keeps its name, and once attempts 0..=64 are
/// occupied the next write reports `AlreadyExists` instead of whatever
/// actually went wrong.
struct TempGuard {
    path: PathBuf,
    armed: bool,
}

impl TempGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    /// Stop tracking the file. Call once the rename has succeeded and the
    /// temp path no longer names anything.
    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempGuard {
    fn drop(&mut self) {
        if self.armed {
            // The temp file may carry the target's read-only flag, and
            // Windows refuses to delete a read-only file.
            #[cfg(windows)]
            clear_readonly(&self.path);
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(windows)]
fn clear_readonly(path: &Path) {
    if let Ok(meta) = fs::metadata(path) {
        let mut perms = meta.permissions();
        if perms.readonly() {
            // On Windows this clears only the read-only attribute; the lint
            // is about Unix, where it would make the file world-writable.
            #[allow(clippy::permissions_set_readonly_false)]
            perms.set_readonly(false);
            let _ = fs::set_permissions(path, perms);
        }
    }
}

/// Write `content` to `path` atomically. Creates parent directories.
///
/// **Stability:** stable in 0.x.
///
/// # Permissions
///
/// Overwriting a file keeps its permissions: the Unix `0o777` mode bits, or
/// the read-only flag on Windows. The setuid, setgid and sticky bits are
/// dropped. Owner and group are not copied: the new file belongs to the
/// writing process. A new file gets the platform default, which on Unix is
/// `0o666` less the process umask.
///
/// A symlink at `path` is replaced by a regular file, not written through.
/// The new file takes the mode of the file the link pointed to.
///
/// # Errors
///
/// [`WriteError::Io`] when the parent directory cannot be created; the temp
/// file cannot be created (including when all 65 temp names are taken),
/// written, given the old file's permissions or synced; or the rename fails.
/// The temp file is removed on every failure. Parent directories created
/// before the failure stay.
///
/// # Examples
///
/// ```
/// let dir = tempfile::tempdir()?;
/// let path = dir.path().join("config/settings.json");
///
/// etag_write::write_atomic(&path, br#"{"theme":"dark"}"#)?;
/// assert_eq!(std::fs::read(&path)?, br#"{"theme":"dark"}"#);
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub fn write_atomic(path: &Path, content: &[u8]) -> Result<(), WriteError> {
    write_atomic_with(path, content, |from, to| fs::rename(from, to))
}

/// [`write_atomic`] with the rename step passed in, so a test can fail it
/// or look at the files just before it.
fn write_atomic_with(
    path: &Path,
    content: &[u8],
    rename: impl FnOnce(&Path, &Path) -> io::Result<()>,
) -> Result<(), WriteError> {
    let io = |source: std::io::Error| WriteError::Io {
        path: path.to_path_buf(),
        source,
    };

    let dir = parent_dir(path);
    fs::create_dir_all(dir).map_err(io)?;

    // The rename puts the temp file's permissions on the target, so the
    // temp file takes the old file's before the rename.
    let keep = fs::metadata(path)
        .ok()
        .filter(fs::Metadata::is_file)
        .map(|m| kept_permissions(&m));

    // Same directory, so the rename below cannot cross a filesystem
    // boundary. O_EXCL via a unique name + create_new so two concurrent
    // writers cannot pick the same temp file.
    let mut attempt = 0u32;
    let mut tmp = loop {
        let name = format!(
            ".{}.etag-write-{}-{}.tmp",
            path.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            std::process::id(),
            attempt
        );
        let candidate = dir.join(name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut f) => {
                // Armed before the first fallible call, so a failed write,
                // set-permissions or fsync takes the file it just created
                // with it.
                let guard = TempGuard::new(candidate);
                f.write_all(content).map_err(io)?;
                if let Some(perms) = keep.clone() {
                    f.set_permissions(perms).map_err(io)?;
                }
                // Durability BEFORE the rename: otherwise a crash can leave
                // the name pointing at a file whose contents never landed.
                f.sync_all().map_err(io)?;
                break guard;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists && attempt < 64 => {
                attempt += 1;
            }
            Err(e) => return Err(io(e)),
        }
    };

    rename(tmp.path(), path).map_err(io)?;
    tmp.disarm();

    // Best effort: not every platform lets you open a directory (Windows does
    // not, so this is a no-op there), and a failure here costs durability of
    // the rename, not correctness of the contents.
    if let Ok(d) = fs::File::open(dir) {
        let _ = d.sync_all();
    }
    Ok(())
}

/// The directory that holds `path`. A bare name such as `x.md` has the
/// empty path as its parent, which cannot be opened, so it maps to `.`.
fn parent_dir(path: &Path) -> &Path {
    path.parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."))
}

/// The permissions the replacement takes from the file it replaces.
///
/// On Unix only the `0o777` bits. The new file belongs to the writing
/// process, so carrying setuid, setgid or sticky over would hand them to a
/// different owner.
fn kept_permissions(old: &fs::Metadata) -> fs::Permissions {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::Permissions::from_mode(old.permissions().mode() & 0o777)
    }
    #[cfg(not(unix))]
    {
        old.permissions()
    }
}

/// The file's bytes, or `None` if it does not exist. Any other read error
/// (e.g. permission denied) is `Io`, so a write never replaces a file the
/// caller could not read.
fn read_existing(path: &Path) -> Result<Option<Vec<u8>>, WriteError> {
    read_or_none(path).map_err(|source| WriteError::Io {
        path: path.to_path_buf(),
        source,
    })
}

/// Atomic write behind a compare-and-swap. Returns the new etag.
///
/// **Stability:** stable in 0.x, including the rules in the crate docs.
///
/// # Errors
///
/// - [`WriteError::Conflict`] when the file exists and its etag is not
///   `expected_etag`.
/// - [`WriteError::ExistsWithoutEtag`] when the file exists and
///   `expected_etag` is `None`.
/// - [`WriteError::Io`] when the existing file cannot be read, or the write
///   fails as in [`write_atomic`].
///
/// # Examples
///
/// ```
/// use etag_write::{WriteError, write_cas};
///
/// let dir = tempfile::tempdir()?;
/// let path = dir.path().join("note.md");
///
/// // No etag and no file: create it.
/// let v1 = write_cas(&path, b"v1", None)?;
/// // The etag from the last read: the write goes through.
/// write_cas(&path, b"v2", Some(&v1))?;
///
/// // A stale etag is refused, and so is a blind overwrite.
/// let stale = write_cas(&path, b"v3", Some(&v1)).unwrap_err();
/// assert!(matches!(stale, WriteError::Conflict { .. }));
/// let blind = write_cas(&path, b"v3", None).unwrap_err();
/// assert!(matches!(blind, WriteError::ExistsWithoutEtag { .. }));
///
/// assert_eq!(std::fs::read(&path)?, b"v2");
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub fn write_cas(
    path: &Path,
    content: &[u8],
    expected_etag: Option<&str>,
) -> Result<String, WriteError> {
    let current = read_existing(path)?;
    match (&current, expected_etag) {
        (Some(bytes), Some(tag)) if etag(bytes) != tag => {
            return Err(WriteError::Conflict {
                path: path.to_path_buf(),
            });
        }
        (Some(_), None) => {
            return Err(WriteError::ExistsWithoutEtag {
                path: path.to_path_buf(),
            });
        }
        _ => {}
    }
    write_atomic(path, content)?;
    Ok(etag(content))
}

/// Write only if the content differs. Returns whether it wrote.
///
/// **Stability:** stable in 0.x.
///
/// A no-op write still changes the mtime, which wakes every file watcher
/// and invalidates every mtime-keyed cache.
///
/// # Errors
///
/// [`WriteError::Io`] when the existing file cannot be read (it is never
/// treated as absent and replaced), or the write fails as in
/// [`write_atomic`].
///
/// # Examples
///
/// ```
/// use etag_write::write_if_changed;
///
/// let dir = tempfile::tempdir()?;
/// let path = dir.path().join("index.html");
///
/// assert!(write_if_changed(&path, b"<p>hi</p>")?); // created
/// assert!(!write_if_changed(&path, b"<p>hi</p>")?); // same bytes: untouched
/// assert!(write_if_changed(&path, b"<p>bye</p>")?); // changed
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub fn write_if_changed(path: &Path, content: &[u8]) -> Result<bool, WriteError> {
    if read_existing(path)?.as_deref() == Some(content) {
        return Ok(false);
    }
    write_atomic(path, content)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn etag_is_hex_sha256() {
        assert_eq!(
            etag(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn atomic_write_creates_parents_and_leaves_no_temp_files() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a/b/c.md");
        write_atomic(&p, b"hello").unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"hello");
        assert_eq!(names_in(p.parent().unwrap()), vec!["c.md".to_string()]);
    }

    #[test]
    fn atomic_write_overwrites_in_place() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.md");
        write_atomic(&p, b"one").unwrap();
        write_atomic(&p, b"two").unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"two");
    }

    #[cfg(unix)]
    #[test]
    fn an_overwrite_keeps_the_old_file_mode() {
        let d = tempfile::tempdir().unwrap();
        for want in [0o600, 0o755, 0o640] {
            let p = d.path().join(format!("x-{want:o}"));
            fs::write(&p, b"old").unwrap();
            set_mode(&p, want);

            write_atomic(&p, b"new").unwrap();
            assert_eq!(mode_of(&p), want, "write_atomic");

            write_cas(&p, b"newer", Some(&etag(b"new"))).unwrap();
            assert_eq!(mode_of(&p), want, "write_cas");
            assert_eq!(fs::read(&p).unwrap(), b"newer");
        }
    }

    /// The new file has a new owner, so setuid must not carry over.
    #[cfg(unix)]
    #[test]
    fn an_overwrite_drops_the_setuid_bit() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("tool");
        fs::write(&p, b"old").unwrap();
        set_mode(&p, 0o4755);
        assert_eq!(mode_of(&p), 0o4755, "setup: setuid did not stick");

        write_atomic(&p, b"new").unwrap();

        assert_eq!(mode_of(&p), 0o755);
    }

    #[test]
    fn cas_creates_when_absent_and_no_etag_is_sent() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("new.md");
        let tag = write_cas(&p, b"body", None).unwrap();
        assert_eq!(tag, etag(b"body"));
    }

    #[test]
    fn cas_rejects_a_blind_overwrite() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.md");
        write_atomic(&p, b"original").unwrap();
        let err = write_cas(&p, b"clobber", None).unwrap_err();
        assert!(matches!(err, WriteError::ExistsWithoutEtag { .. }));
        // The original really is untouched.
        assert_eq!(fs::read(&p).unwrap(), b"original");
    }

    #[test]
    fn cas_rejects_a_stale_etag_and_accepts_a_fresh_one() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.md");
        write_atomic(&p, b"v1").unwrap();
        let tag_v1 = etag(b"v1");

        // Somebody else edits the file…
        write_atomic(&p, b"v2-from-someone-else").unwrap();

        let err = write_cas(&p, b"v2-from-us", Some(&tag_v1)).unwrap_err();
        assert!(matches!(err, WriteError::Conflict { .. }));
        assert_eq!(fs::read(&p).unwrap(), b"v2-from-someone-else");

        // Re-read, then write: accepted.
        let fresh = etag_of_file(&p).unwrap().unwrap();
        let tag = write_cas(&p, b"v3", Some(&fresh)).unwrap();
        assert_eq!(tag, etag(b"v3"));
    }

    #[test]
    fn cas_creates_when_the_file_was_deleted_under_us() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.md");
        write_cas(&p, b"body", Some("stale-etag-for-a-file-that-is-gone")).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"body");
    }

    /// Cleanup on failure, tested where it can be reached directly. A write
    /// that fails after the temp file exists must take it with it: the temp
    /// name is deterministic per pid and attempt, so leaked ones sit at fixed
    /// names until attempts 0..=64 are all occupied and the next write reports
    /// `AlreadyExists` instead of what actually went wrong.
    ///
    /// The guard is tested rather than each failing call. A test can make
    /// the rename fail, by argument or through `write_atomic_with`, but
    /// making `write_all`, `set_permissions` or `sync_all` fail on the temp
    /// file needs a filesystem it can fill or a process-wide rlimit, neither
    /// portable. Arming the guard before those three calls is what puts them
    /// under it.
    #[test]
    fn the_temp_guard_removes_its_file_unless_disarmed() {
        let d = tempfile::tempdir().unwrap();

        let dropped = d.path().join("half-written.tmp");
        fs::write(&dropped, b"partial").unwrap();
        drop(TempGuard::new(dropped.clone()));
        assert!(!dropped.exists(), "an armed guard must remove its file");

        // Disarmed is the post-rename state: the path no longer names the
        // temp, and the guard must not touch whatever is there now.
        let renamed = d.path().join("already-renamed.tmp");
        fs::write(&renamed, b"someone else's file").unwrap();
        let mut guard = TempGuard::new(renamed.clone());
        guard.disarm();
        drop(guard);
        assert!(renamed.exists(), "a disarmed guard must remove nothing");
    }

    /// The file's mode, special bits included.
    #[cfg(unix)]
    fn mode_of(p: &Path) -> u32 {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(p).unwrap().permissions().mode() & 0o7777
    }

    #[cfg(unix)]
    fn set_mode(p: &Path, mode: u32) {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(p, fs::Permissions::from_mode(mode)).unwrap();
    }

    /// The names in `dir`, sorted.
    fn names_in(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .filter_map(Result::ok)
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    /// Up to the rename, the target holds its old bytes and the temp file
    /// already holds all of the new ones. So a reader that opens the target
    /// at any point before the rename sees the old file, and the rename
    /// swaps in a complete file.
    #[test]
    fn the_target_keeps_its_old_bytes_until_the_rename() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.md");
        fs::write(&p, b"old").unwrap();

        write_atomic_with(&p, b"new and longer", |from, to| {
            assert_eq!(fs::read(to).unwrap(), b"old");
            assert_eq!(fs::read(from).unwrap(), b"new and longer");
            assert_eq!(
                from.parent(),
                to.parent(),
                "temp file in the same directory"
            );
            fs::rename(from, to)
        })
        .unwrap();

        assert_eq!(fs::read(&p).unwrap(), b"new and longer");
        assert_eq!(names_in(d.path()), vec!["x.md".to_string()]);
    }

    /// Fault injection at the last step: everything up to the rename has
    /// happened, then it fails. This is the state a crash before the rename
    /// leaves, minus the temp file that only a crash can leave behind.
    #[test]
    fn a_failure_before_the_rename_leaves_the_target_untouched() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.md");
        fs::write(&p, b"old").unwrap();

        let err =
            write_atomic_with(&p, b"new", |_, _| Err(io::Error::other("injected"))).unwrap_err();

        assert!(matches!(err, WriteError::Io { .. }), "got {err:?}");
        assert_eq!(fs::read(&p).unwrap(), b"old");
        assert_eq!(
            names_in(d.path()),
            vec!["x.md".to_string()],
            "temp file left"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_new_file_gets_the_same_mode_as_fs_write() {
        let d = tempfile::tempdir().unwrap();
        let ours = d.path().join("ours");
        let theirs = d.path().join("theirs");
        write_atomic(&ours, b"x").unwrap();
        fs::write(&theirs, b"x").unwrap();
        assert_eq!(mode_of(&ours), mode_of(&theirs));
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_at_the_target_is_replaced_not_written_through() {
        let d = tempfile::tempdir().unwrap();
        let real = d.path().join("real");
        let link = d.path().join("link");
        fs::write(&real, b"real").unwrap();
        set_mode(&real, 0o600);
        std::os::unix::fs::symlink(&real, &link).unwrap();

        write_atomic(&link, b"new").unwrap();

        assert_eq!(mode_of(&link), 0o600, "takes the mode of the link's target");

        assert!(
            !fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(fs::read(&link).unwrap(), b"new");
        assert_eq!(fs::read(&real).unwrap(), b"real");
    }

    #[test]
    fn a_bare_name_lives_in_the_current_directory() {
        assert_eq!(parent_dir(Path::new("x.md")), Path::new("."));
        assert_eq!(parent_dir(Path::new("a/x.md")), Path::new("a"));
        // The directory fsync opens this path, so it has to be openable. That
        // holds on Unix only: Windows cannot open a directory with
        // `File::open`, so the fsync is skipped there.
        #[cfg(unix)]
        {
            let _cwd = CWD
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            fs::File::open(parent_dir(Path::new("x.md"))).unwrap();
        }
    }

    /// Held by every test that reads or changes the working directory,
    /// which is process-wide. All other tests use absolute paths.
    static CWD: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Moves into a directory and moves back when dropped, even if the
    /// test panics first. Holds [`CWD`] for as long as it lives.
    struct InDir {
        before: PathBuf,
        _lock: std::sync::MutexGuard<'static, ()>,
    }

    impl InDir {
        fn new(dir: &Path) -> Self {
            let lock = CWD
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let before = std::env::current_dir().unwrap();
            std::env::set_current_dir(dir).unwrap();
            Self {
                before,
                _lock: lock,
            }
        }
    }

    impl Drop for InDir {
        fn drop(&mut self) {
            let _ = std::env::set_current_dir(&self.before);
        }
    }

    #[test]
    fn a_bare_name_is_written_in_the_current_directory() {
        let d = tempfile::tempdir().unwrap();
        let in_dir = InDir::new(d.path());
        let result = write_atomic(Path::new("x.md"), b"hello");
        drop(in_dir);

        result.unwrap();
        assert_eq!(fs::read(d.path().join("x.md")).unwrap(), b"hello");
        assert_eq!(names_in(d.path()), vec!["x.md".to_string()]);
    }

    /// The temp name this process would use on `attempt`.
    fn temp_name(file: &str, attempt: u32) -> String {
        format!(".{file}.etag-write-{}-{attempt}.tmp", std::process::id())
    }

    #[test]
    fn a_taken_temp_name_moves_on_to_the_next_attempt() {
        let d = tempfile::tempdir().unwrap();
        for attempt in 0..3 {
            fs::write(d.path().join(temp_name("x.md", attempt)), b"someone's").unwrap();
        }

        write_atomic(&d.path().join("x.md"), b"hello").unwrap();

        assert_eq!(fs::read(d.path().join("x.md")).unwrap(), b"hello");
        for attempt in 0..3 {
            let taken = d.path().join(temp_name("x.md", attempt));
            assert_eq!(fs::read(taken).unwrap(), b"someone's", "attempt {attempt}");
        }
        assert!(!d.path().join(temp_name("x.md", 3)).exists());
    }

    #[test]
    fn every_temp_name_taken_is_an_io_error() {
        let d = tempfile::tempdir().unwrap();
        for attempt in 0..=64 {
            fs::write(d.path().join(temp_name("x.md", attempt)), b"").unwrap();
        }

        let err = write_atomic(&d.path().join("x.md"), b"hello").unwrap_err();

        let WriteError::Io { source, .. } = err else {
            panic!("got {err:?}");
        };
        assert_eq!(source.kind(), io::ErrorKind::AlreadyExists);
        assert!(!d.path().join("x.md").exists());
    }

    #[test]
    fn a_parent_that_is_a_file_is_an_io_error() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("file"), b"not a directory").unwrap();

        let err = write_atomic(&d.path().join("file/x.md"), b"hello").unwrap_err();

        assert!(matches!(err, WriteError::Io { .. }), "got {err:?}");
        assert_eq!(fs::read(d.path().join("file")).unwrap(), b"not a directory");
    }

    /// Regression guard for the one failure a caller can arrange by
    /// argument: renaming onto a non-empty directory, which the kernel
    /// refuses. End-to-end proof that the guard is wired into `write_atomic`
    /// and not merely correct in isolation.
    #[test]
    fn a_failed_rename_removes_the_temp_file() {
        let d = tempfile::tempdir().unwrap();
        let target = d.path().join("occupied");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("child"), b"in the way").unwrap();

        let err = write_atomic(&target, b"hello").unwrap_err();
        assert!(matches!(err, WriteError::Io { .. }), "got {err:?}");

        assert_eq!(
            names_in(d.path()),
            vec!["occupied".to_string()],
            "temp file left behind"
        );
    }

    /// A mode-000 file `x.md` holding `hidden` in `dir`, or `None` when
    /// running as root, which reads through mode 000.
    #[cfg(unix)]
    fn unreadable_file(dir: &Path) -> Option<PathBuf> {
        let p = dir.join("x.md");
        fs::write(&p, b"hidden").unwrap();
        set_mode(&p, 0o000);
        if fs::read(&p).is_ok() {
            eprintln!("skipped: running as root, which reads through mode 000");
            return None;
        }
        Some(p)
    }

    /// Runs `write` against an unreadable file, then checks it failed with
    /// `Io` and left the file alone.
    #[cfg(unix)]
    fn assert_unreadable_file_is_kept(write: impl FnOnce(&Path) -> Result<(), WriteError>) {
        let d = tempfile::tempdir().unwrap();
        let Some(p) = unreadable_file(d.path()) else {
            return;
        };

        let err = write(&p).unwrap_err();

        set_mode(&p, 0o600);
        assert!(matches!(err, WriteError::Io { .. }), "got {err:?}");
        assert_eq!(fs::read(&p).unwrap(), b"hidden");
    }

    #[cfg(unix)]
    #[test]
    fn cas_refuses_to_overwrite_an_unreadable_file() {
        assert_unreadable_file_is_kept(|p| write_cas(p, b"blind", None).map(drop));
        assert_unreadable_file_is_kept(|p| write_cas(p, b"blind", Some("any-etag")).map(drop));
    }

    #[test]
    fn etag_of_file_is_none_for_a_missing_file() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(etag_of_file(&d.path().join("absent.md")).unwrap(), None);
    }

    #[cfg(unix)]
    #[test]
    fn etag_of_file_is_an_error_for_an_unreadable_file() {
        let d = tempfile::tempdir().unwrap();
        let Some(p) = unreadable_file(d.path()) else {
            return;
        };
        let got = etag_of_file(&p);
        set_mode(&p, 0o600);
        assert_eq!(got.unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    }

    #[cfg(unix)]
    #[test]
    fn write_if_changed_refuses_to_overwrite_an_unreadable_file() {
        assert_unreadable_file_is_kept(|p| write_if_changed(p, b"blind").map(drop));
    }

    #[test]
    fn write_if_changed_skips_identical_content() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.md");
        assert!(write_if_changed(&p, b"same").unwrap());
        let before = fs::metadata(&p).unwrap().modified().unwrap();
        assert!(!write_if_changed(&p, b"same").unwrap());
        assert_eq!(fs::metadata(&p).unwrap().modified().unwrap(), before);
        assert!(write_if_changed(&p, b"different").unwrap());
    }
}

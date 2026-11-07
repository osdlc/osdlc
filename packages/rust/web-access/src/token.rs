//! The shared secret: 32 random bytes, base64url, persisted owner-only.

use std::io;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;

/// File name inside the caller's token directory.
pub const TOKEN_FILE: &str = "web-access-token";

/// File name of the view-only token. [`TOKEN_FILE`] holds the full token.
pub const READ_TOKEN_FILE: &str = "web-access-read-token";

/// File name of the admin token. It exists only while admin access is on.
pub const ADMIN_TOKEN_FILE: &str = "web-access-admin-token";

/// The token file inside `dir`.
pub fn token_path(dir: &Path) -> PathBuf {
    dir.join(TOKEN_FILE)
}

/// A fresh random token (32 bytes, base64url) that is never written anywhere.
/// For a secret that lives for one process, as against the persisted token.
///
/// # Errors
///
/// An error when the operating system's random source fails.
pub fn mint() -> io::Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| io::Error::other(e.to_string()))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// Refuse a `file_name` that is not one plain name inside the directory: empty,
/// `.` or `..`, or holding a path separator.
fn check_file_name(file_name: &str) -> io::Result<()> {
    // `file_name()` is `None` for an empty name and `..`, and differs from the
    // input for `.` or a name with a `/`; `\` is refused on every platform.
    let bare = !file_name.contains('\\')
        && Path::new(file_name).file_name() == Some(std::ffi::OsStr::new(file_name));
    if bare {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("token file name must be a bare file name, not {file_name:?}"),
        ))
    }
}

/// Write `token` to `dir/file_name`. Callers have checked `file_name`.
fn persist(dir: &Path, file_name: &str, token: &str) -> io::Result<()> {
    use std::io::Write;
    #[cfg(unix)]
    let created_dir = !dir.exists();
    std::fs::create_dir_all(dir)?;
    #[cfg(unix)]
    if created_dir {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))?;
    }
    let path = dir.join(file_name);
    // Write to a unique temp file (`create_new`, so none is reused) and rename
    // over the target, so a crash never leaves a truncated token.
    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = dir.join(format!("{file_name}.tmp.{}.{seq}", std::process::id()));
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // Created 0600, so the secret is never briefly world-readable.
        opts.mode(0o600);
    }
    let mut f = opts.open(&tmp)?;
    let written = writeln!(f, "{token}").and_then(|()| f.sync_all());
    drop(f);
    if let Err(e) = written.and_then(|()| std::fs::rename(&tmp, &path)) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

/// The persisted token in `dir`, or a freshly minted one written there. An
/// empty or whitespace-only file counts as absent. An existing file is
/// chmod'ed to 0600 on Unix.
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
pub fn load_or_mint(dir: &Path) -> io::Result<String> {
    load_or_mint_named(dir, TOKEN_FILE)
}

/// [`load_or_mint`] for an app whose token file already has a name of its own
/// (an install keeps its token only if the file keeps its name). `file_name`
/// is a bare file name inside `dir`.
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
/// `InvalidInput` when `file_name` is not a bare file name.
pub fn load_or_mint_named(dir: &Path, file_name: &str) -> io::Result<String> {
    check_file_name(file_name)?;
    let path = dir.join(file_name);
    match std::fs::read_to_string(&path) {
        Ok(existing) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                // Tighten a file left looser by an older version or another tool.
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
            }
            let trimmed = existing.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_owned());
            }
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        // Unreadable (permissions, not UTF-8, a directory): report it rather
        // than overwrite a token that links may already carry.
        Err(e) => return Err(e),
    }
    let token = mint()?;
    persist(dir, file_name, &token)?;
    Ok(token)
}

/// The env override if non-blank (trimmed, nothing written), else
/// [`load_or_mint`]. The caller passes the env value so tests never touch the
/// process environment.
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
pub fn resolve(dir: &Path, env_override: Option<&str>) -> io::Result<String> {
    resolve_named(dir, TOKEN_FILE, env_override)
}

/// [`resolve`] with an explicit token file name; see [`load_or_mint_named`].
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
/// `InvalidInput` when `file_name` is not a bare file name.
pub fn resolve_named(
    dir: &Path,
    file_name: &str,
    env_override: Option<&str>,
) -> io::Result<String> {
    match env_override.map(str::trim).filter(|t| !t.is_empty()) {
        Some(t) => Ok(t.to_owned()),
        None => load_or_mint_named(dir, file_name),
    }
}

/// The view-only token in `dir`; see [`load_or_mint`].
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
pub fn load_or_mint_read(dir: &Path) -> io::Result<String> {
    load_or_mint_named(dir, READ_TOKEN_FILE)
}

/// The admin token in `dir`; see [`load_or_mint`]. Call it only while admin
/// access is on, so the file does not exist otherwise.
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
pub fn load_or_mint_admin(dir: &Path) -> io::Result<String> {
    load_or_mint_named(dir, ADMIN_TOKEN_FILE)
}

/// Delete the admin token in `dir`, if there is one, so the next
/// [`load_or_mint_admin`] mints a fresh token.
///
/// # Errors
///
/// An I/O error when the file exists and cannot be removed.
pub fn forget_admin(dir: &Path) -> io::Result<()> {
    match std::fs::remove_file(dir.join(ADMIN_TOKEN_FILE)) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// Mint a new token and persist it, invalidating the old one.
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
pub fn rotate(dir: &Path) -> io::Result<String> {
    rotate_named(dir, TOKEN_FILE)
}

/// [`rotate`] for the view-only token; the full token stays valid.
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
pub fn rotate_read(dir: &Path) -> io::Result<String> {
    rotate_named(dir, READ_TOKEN_FILE)
}

/// [`rotate`] for the admin token; the other tokens stay valid.
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
pub fn rotate_admin(dir: &Path) -> io::Result<String> {
    rotate_named(dir, ADMIN_TOKEN_FILE)
}

/// [`rotate`] with an explicit token file name; see [`load_or_mint_named`].
///
/// # Errors
///
/// An I/O error when the token directory or file cannot be created, read or written.
/// `InvalidInput` when `file_name` is not a bare file name.
pub fn rotate_named(dir: &Path, file_name: &str) -> io::Result<String> {
    check_file_name(file_name)?;
    let token = mint()?;
    persist(dir, file_name, &token)?;
    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mints_once_and_reuses() {
        let dir = tempfile::tempdir().unwrap();
        let a = load_or_mint(dir.path()).unwrap();
        let b = load_or_mint(dir.path()).unwrap();
        assert_eq!(a, b);
        // 32 bytes, unpadded base64url.
        assert_eq!(a.len(), 43);
        assert!(
            a.bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        );
    }

    #[cfg(unix)]
    #[test]
    fn file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        load_or_mint(dir.path()).unwrap();
        let mode = std::fs::metadata(token_path(dir.path()))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn existing_loose_file_is_tightened_on_load() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let p = token_path(dir.path());
        std::fs::write(&p, "tok\n").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(load_or_mint(dir.path()).unwrap(), "tok");
        let mode = std::fs::metadata(&p).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn rotate_changes_and_persists() {
        let dir = tempfile::tempdir().unwrap();
        let a = load_or_mint(dir.path()).unwrap();
        let b = rotate(dir.path()).unwrap();
        assert_ne!(a, b);
        assert_eq!(load_or_mint(dir.path()).unwrap(), b);
    }

    #[cfg(unix)]
    #[test]
    fn rotate_keeps_the_file_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        load_or_mint(dir.path()).unwrap();
        rotate(dir.path()).unwrap();
        let mode = std::fs::metadata(token_path(dir.path()))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn env_override_wins_and_writes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(resolve(dir.path(), Some(" abc ")).unwrap(), "abc");
        assert!(!token_path(dir.path()).exists());
        let minted = resolve(dir.path(), Some("  ")).unwrap();
        assert_eq!(minted, load_or_mint(dir.path()).unwrap());
    }

    #[test]
    fn named_file_is_read_not_reminted() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("token"), "old-install-token\n").unwrap();
        assert_eq!(
            resolve_named(dir.path(), "token", None).unwrap(),
            "old-install-token"
        );
        assert!(!token_path(dir.path()).exists());
    }

    #[test]
    fn rotating_the_read_token_leaves_the_full_token() {
        let dir = tempfile::tempdir().unwrap();
        let full = load_or_mint(dir.path()).unwrap();
        let read = load_or_mint_read(dir.path()).unwrap();
        assert_ne!(full, read);
        let rotated = rotate_read(dir.path()).unwrap();
        assert_ne!(read, rotated);
        assert_eq!(load_or_mint_read(dir.path()).unwrap(), rotated);
        assert_eq!(load_or_mint(dir.path()).unwrap(), full);
    }

    #[test]
    fn rotating_the_admin_token_leaves_the_others() {
        let dir = tempfile::tempdir().unwrap();
        let full = load_or_mint(dir.path()).unwrap();
        let admin = load_or_mint_admin(dir.path()).unwrap();
        assert_ne!(full, admin);
        assert!(dir.path().join(ADMIN_TOKEN_FILE).exists());
        let rotated = rotate_admin(dir.path()).unwrap();
        assert_ne!(admin, rotated);
        assert_eq!(load_or_mint_admin(dir.path()).unwrap(), rotated);
        assert_eq!(load_or_mint(dir.path()).unwrap(), full);
    }

    #[test]
    fn empty_file_is_reminted() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(token_path(dir.path()), "  \n").unwrap();
        assert!(!load_or_mint(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn a_named_file_must_be_a_bare_name() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["", ".", "..", "../x", "a/b", "a\\b"] {
            let err = load_or_mint_named(dir.path(), bad).unwrap_err();
            assert_eq!(err.kind(), io::ErrorKind::InvalidInput, "{bad:?}");
            assert!(rotate_named(dir.path(), bad).is_err(), "{bad:?}");
        }
        assert!(load_or_mint_named(dir.path(), "app-token").is_ok());
    }

    #[test]
    fn an_unreadable_token_file_is_an_error_not_a_new_token() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(token_path(dir.path()), [0xff, 0xfe, 0x00]).unwrap();
        assert!(load_or_mint(dir.path()).is_err());
        // The file is left as it was.
        assert_eq!(
            std::fs::read(token_path(dir.path())).unwrap(),
            [0xff, 0xfe, 0x00]
        );
    }
}

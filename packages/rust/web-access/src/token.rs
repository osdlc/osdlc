//! Tokens: the [`Token`] type, which holds only a well-formed token, and the
//! files that keep tokens owner-only.

use std::fmt;
use std::io;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use subtle::ConstantTimeEq;

/// File name inside the caller's token directory.
pub const TOKEN_FILE: &str = "web-access-token";

/// File name of the view-only token. [`TOKEN_FILE`] holds the full token.
pub const READ_TOKEN_FILE: &str = "web-access-read-token";

/// File name of the admin token. It exists only while admin access is on.
pub const ADMIN_TOKEN_FILE: &str = "web-access-admin-token";

/// Shortest token [`Token::parse`] accepts. 32 characters carry at least 128
/// bits of a random secret even in hex (4 bits a character). A minted token is
/// 43 characters; a 64-character hex digest also passes.
pub const MIN_TOKEN_LEN: usize = 32;

/// The token file inside `dir`.
pub fn token_path(dir: &Path) -> PathBuf {
    dir.join(TOKEN_FILE)
}

/// A secret that grants access. Built only by [`Token::mint`] or
/// [`Token::parse`], so it is always at least [`MIN_TOKEN_LEN`] characters of
/// `A-Z a-z 0-9 - _`: safe as written in a URL query, a cookie and a header.
///
/// `Display` and [`Token::as_str`] give the secret; `Debug` leaves it out.
/// Equality compares in constant time.
#[derive(Clone)]
pub struct Token(String);

impl Token {
    /// A fresh random token: 32 bytes from the OS random source, base64url
    /// without padding (43 characters). `Token::mint()?.to_string()` gives the
    /// text; `cargo run -p web-access --example mint_token` prints one.
    ///
    /// # Errors
    ///
    /// An error when the operating system's random source fails.
    pub fn mint() -> io::Result<Self> {
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).map_err(|e| io::Error::other(e.to_string()))?;
        Ok(Self(URL_SAFE_NO_PAD.encode(bytes)))
    }

    /// `text` as a token. It is taken as written: no trimming, no decoding.
    ///
    /// # Errors
    ///
    /// [`TokenError::Malformed`] when `text` is shorter than
    /// [`MIN_TOKEN_LEN`] or holds a character outside `A-Z a-z 0-9 - _`.
    pub fn parse(text: &str) -> Result<Self, TokenError> {
        let ok = text.len() >= MIN_TOKEN_LEN
            && text
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
        if ok {
            Ok(Self(text.to_owned()))
        } else {
            Err(TokenError::Malformed)
        }
    }

    /// The secret, for a share link or a header.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Token {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl fmt::Debug for Token {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Token(<redacted>)")
    }
}

impl PartialEq for Token {
    fn eq(&self, other: &Self) -> bool {
        self.0.as_bytes().ct_eq(other.0.as_bytes()).into()
    }
}

impl Eq for Token {}

/// The token rule, for error messages.
const RULE: &str = "a token is at least 32 characters of A-Z a-z 0-9 - _";

/// Why a token could not be read or made. It never holds token text.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum TokenError {
    /// A string given to [`Token::parse`] is not a token.
    #[error("not a token: {}", RULE)]
    Malformed,
    /// A token file holds something other than a token (it was edited by
    /// hand, or emptied). It is left as it is.
    #[error(
        "token file {} does not hold a token ({}); delete it and a new one is minted on the next start",
        path.display(),
        RULE
    )]
    BadFile {
        /// The file.
        path: PathBuf,
    },
    /// An override, such as an environment variable, is set but is not a
    /// token.
    #[error(
        "{name} is not a token ({}); unset it, or set it to a new one (`cargo run -p web-access --example mint_token` prints one)",
        RULE
    )]
    BadOverride {
        /// Where the override came from, such as the environment variable's name.
        name: String,
    },
    /// The token directory or file could not be created, read or written.
    #[error(transparent)]
    Io(#[from] io::Error),
}

/// The override `value` read from `name` (an environment variable, say):
/// `None` when it is unset or empty, else the token it holds, trimmed.
/// The caller passes the value, so tests need not touch the environment.
///
/// # Errors
///
/// [`TokenError::BadOverride`] naming `name` when the value is set but is not
/// a token, whitespace-only included.
pub fn parse_override(name: &str, value: Option<&str>) -> Result<Option<Token>, TokenError> {
    match value {
        None | Some("") => Ok(None),
        Some(v) => Token::parse(v.trim())
            .map(Some)
            .map_err(|_| TokenError::BadOverride {
                name: name.to_owned(),
            }),
    }
}

/// [`parse_override`] for the environment variable `name`.
///
/// # Errors
///
/// [`TokenError::BadOverride`] when the variable is set but is not a token
/// (not valid UTF-8 included).
pub fn override_from_env(name: &str) -> Result<Option<Token>, TokenError> {
    match std::env::var_os(name) {
        None => Ok(None),
        Some(v) => match v.to_str() {
            Some(v) => parse_override(name, Some(v)),
            None => Err(TokenError::BadOverride {
                name: name.to_owned(),
            }),
        },
    }
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
fn persist(dir: &Path, file_name: &str, token: &Token) -> io::Result<()> {
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

/// The persisted token in `dir`, or a freshly minted one written there when
/// the file does not exist. An existing file is chmod'ed to 0600 on Unix.
///
/// # Errors
///
/// [`TokenError::BadFile`] when the file holds anything but a token
/// (surrounding whitespace aside), an empty file included, or bytes that are
/// not UTF-8; the file is left as it is. [`TokenError::Io`] when the
/// directory or file cannot be created, read or written.
pub fn load_or_mint(dir: &Path) -> Result<Token, TokenError> {
    load_or_mint_named(dir, TOKEN_FILE)
}

/// [`load_or_mint`] for an app whose token file already has a name of its own
/// (an install keeps its token only if the file keeps its name). `file_name`
/// is a bare file name inside `dir`.
///
/// # Errors
///
/// As [`load_or_mint`], and an `InvalidInput` [`TokenError::Io`] when
/// `file_name` is not a bare file name.
pub fn load_or_mint_named(dir: &Path, file_name: &str) -> Result<Token, TokenError> {
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
            // The operator wrote the file, so a bad one is reported, not
            // replaced: links may already carry what they meant to put there.
            return Token::parse(existing.trim()).map_err(|_| TokenError::BadFile { path });
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        // `InvalidData` is `read_to_string` rejecting non-UTF-8 bytes: bad
        // content, so `BadFile` like any other malformed file.
        Err(e) if e.kind() == io::ErrorKind::InvalidData => {
            return Err(TokenError::BadFile { path });
        }
        // Unreadable (permissions, a directory): report it rather than
        // overwrite a token that links may already carry.
        Err(e) => return Err(e.into()),
    }
    let token = Token::mint()?;
    persist(dir, file_name, &token)?;
    Ok(token)
}

/// `env_override` when set (nothing is written for it), else
/// [`load_or_mint`]. Read the override with [`override_from_env`] or
/// [`parse_override`].
///
/// # Errors
///
/// As [`load_or_mint`].
pub fn resolve(dir: &Path, env_override: Option<Token>) -> Result<Token, TokenError> {
    resolve_named(dir, TOKEN_FILE, env_override)
}

/// [`resolve`] with an explicit token file name; see [`load_or_mint_named`].
///
/// # Errors
///
/// As [`load_or_mint_named`].
pub fn resolve_named(
    dir: &Path,
    file_name: &str,
    env_override: Option<Token>,
) -> Result<Token, TokenError> {
    match env_override {
        Some(t) => Ok(t),
        None => load_or_mint_named(dir, file_name),
    }
}

/// The view-only token in `dir`; see [`load_or_mint`].
///
/// # Errors
///
/// As [`load_or_mint`].
pub fn load_or_mint_read(dir: &Path) -> Result<Token, TokenError> {
    load_or_mint_named(dir, READ_TOKEN_FILE)
}

/// The admin token in `dir`; see [`load_or_mint`]. Call it only while admin
/// access is on, so the file does not exist otherwise.
///
/// # Errors
///
/// As [`load_or_mint`].
pub fn load_or_mint_admin(dir: &Path) -> Result<Token, TokenError> {
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
/// [`TokenError::Io`] when the token directory or file cannot be created or written.
pub fn rotate(dir: &Path) -> Result<Token, TokenError> {
    rotate_named(dir, TOKEN_FILE)
}

/// [`rotate`] for the view-only token; the full token stays valid.
///
/// # Errors
///
/// As [`rotate`].
pub fn rotate_read(dir: &Path) -> Result<Token, TokenError> {
    rotate_named(dir, READ_TOKEN_FILE)
}

/// [`rotate`] for the admin token; the other tokens stay valid.
///
/// # Errors
///
/// As [`rotate`].
pub fn rotate_admin(dir: &Path) -> Result<Token, TokenError> {
    rotate_named(dir, ADMIN_TOKEN_FILE)
}

/// [`rotate`] with an explicit token file name; see [`load_or_mint_named`].
///
/// # Errors
///
/// As [`rotate`], and an `InvalidInput` [`TokenError::Io`] when `file_name`
/// is not a bare file name.
pub fn rotate_named(dir: &Path, file_name: &str) -> Result<Token, TokenError> {
    check_file_name(file_name)?;
    let token = Token::mint()?;
    persist(dir, file_name, &token)?;
    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A hand-written token of the right shape.
    const GOOD: &str = "kept-token-0123456789-abcdefghijklmnop";

    fn is_token_shaped(t: &str) -> bool {
        t.len() >= MIN_TOKEN_LEN
            && t.bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    }

    #[test]
    fn minted_tokens_parse() {
        for _ in 0..64 {
            let t = Token::mint().unwrap();
            // 32 bytes, unpadded base64url.
            assert_eq!(t.as_str().len(), 43);
            assert_eq!(Token::parse(t.as_str()).unwrap(), t);
        }
    }

    #[test]
    fn a_hex_digest_parses() {
        let hex = "0123456789abcdef".repeat(4);
        assert_eq!(hex.len(), 64);
        assert_eq!(Token::parse(&hex).unwrap().as_str(), hex);
        assert!(Token::parse(&"a".repeat(MIN_TOKEN_LEN)).is_ok());
    }

    /// Short tokens and every character that could collide once encoded,
    /// trimmed or split are refused, and the error never holds the text.
    #[test]
    fn malformed_tokens_are_refused_without_their_text() {
        let base = "abcdefghijklmnopqrstuvwxyz012345678";
        let mut bad = vec![
            String::new(),
            "x".repeat(MIN_TOKEN_LEN - 1),
            format!("{base} "),
            format!(" {base}"),
        ];
        for c in [
            ' ', '\t', '\n', '%', ';', '&', '#', '+', '=', '/', '.', '~', 'é',
        ] {
            bad.push(format!("{base}{c}x"));
        }
        for t in &bad {
            let err = Token::parse(t).unwrap_err();
            assert!(matches!(err, TokenError::Malformed), "{t:?}");
            let msg = err.to_string();
            assert!(t.trim().is_empty() || !msg.contains(t.trim()), "{msg}");
            assert!(msg.contains(&MIN_TOKEN_LEN.to_string()), "{msg}");
        }
    }

    #[test]
    fn debug_redacts_and_display_writes_the_token() {
        let t = Token::parse(GOOD).unwrap();
        assert_eq!(format!("{t:?}"), "Token(<redacted>)");
        assert_eq!(t.to_string(), GOOD);
    }

    #[test]
    fn mints_once_and_reuses() {
        let dir = tempfile::tempdir().unwrap();
        let a = load_or_mint(dir.path()).unwrap();
        let b = load_or_mint(dir.path()).unwrap();
        assert_eq!(a, b);
        assert!(is_token_shaped(a.as_str()));
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
        std::fs::write(&p, format!("{GOOD}\n")).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(load_or_mint(dir.path()).unwrap().as_str(), GOOD);
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
    fn an_override_wins_and_writes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let pinned = parse_override("APP_TOKEN", Some(&format!(" {GOOD}\n")))
            .unwrap()
            .unwrap();
        assert_eq!(resolve(dir.path(), Some(pinned)).unwrap().as_str(), GOOD);
        assert!(!token_path(dir.path()).exists());
        assert!(parse_override("APP_TOKEN", None).unwrap().is_none());
        assert!(parse_override("APP_TOKEN", Some("")).unwrap().is_none());
        let minted = resolve(dir.path(), None).unwrap();
        assert_eq!(minted, load_or_mint(dir.path()).unwrap());
    }

    /// A set override that is not a token is an error naming the variable,
    /// never holding its value.
    #[test]
    fn a_bad_override_is_refused_by_name() {
        for value in ["  ", "short", "a%20b-0123456789-0123456789-0123456789"] {
            let err = parse_override("APP_TOKEN", Some(value)).unwrap_err();
            assert!(
                matches!(&err, TokenError::BadOverride { name } if name == "APP_TOKEN"),
                "{value:?}"
            );
            let msg = err.to_string();
            assert!(
                msg.contains("APP_TOKEN") && msg.contains("mint_token"),
                "{msg}"
            );
            assert!(
                value.trim().is_empty() || !msg.contains(value.trim()),
                "{msg}"
            );
        }
    }

    #[test]
    fn named_file_is_read_not_reminted() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("token"), format!("{GOOD}\n")).unwrap();
        assert_eq!(
            resolve_named(dir.path(), "token", None).unwrap().as_str(),
            GOOD
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

    /// A file that does not hold a token (empty, whitespace only, or edited
    /// by hand) is an error naming the file, never holding its text, and the
    /// file is left as it was.
    #[test]
    fn a_bad_token_file_is_an_error_and_left_alone() {
        let short = "x".repeat(MIN_TOKEN_LEN - 1);
        let spaced = format!("{GOOD} more");
        let percent = format!("{GOOD}%41");
        let semi = format!("{GOOD};b");
        for text in ["", "  \n", short.as_str(), &spaced, &percent, &semi] {
            let dir = tempfile::tempdir().unwrap();
            let p = token_path(dir.path());
            std::fs::write(&p, text).unwrap();
            let err = load_or_mint(dir.path()).unwrap_err();
            assert!(
                matches!(&err, TokenError::BadFile { path } if *path == p),
                "{text:?}"
            );
            let msg = err.to_string();
            assert!(msg.contains(&p.display().to_string()), "{msg}");
            assert!(
                text.trim().is_empty() || !msg.contains(text.trim()),
                "{msg}"
            );
            assert!(!msg.contains(GOOD), "{msg}");
            assert_eq!(std::fs::read_to_string(&p).unwrap(), text);
        }
    }

    #[test]
    fn a_named_file_must_be_a_bare_name() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["", ".", "..", "../x", "a/b", "a\\b"] {
            let err = load_or_mint_named(dir.path(), bad).unwrap_err();
            assert!(
                matches!(&err, TokenError::Io(e) if e.kind() == io::ErrorKind::InvalidInput),
                "{bad:?}"
            );
            assert!(rotate_named(dir.path(), bad).is_err(), "{bad:?}");
        }
        assert!(load_or_mint_named(dir.path(), "app-token").is_ok());
    }

    #[test]
    fn a_non_utf8_token_file_is_a_bad_file_not_a_new_token() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(token_path(dir.path()), [0xff, 0xfe, 0x00]).unwrap();
        assert!(matches!(
            load_or_mint(dir.path()),
            Err(TokenError::BadFile { .. })
        ));
        // The file is left as it was.
        assert_eq!(
            std::fs::read(token_path(dir.path())).unwrap(),
            [0xff, 0xfe, 0x00]
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_token_file_without_read_permission_is_an_error_not_a_new_token() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let p = token_path(dir.path());
        std::fs::write(&p, "kept\n").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o200)).unwrap();
        if std::fs::read(&p).is_ok() {
            return; // root reads anything; the case cannot be staged.
        }
        assert!(load_or_mint(dir.path()).is_err());
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "kept\n");
    }
}

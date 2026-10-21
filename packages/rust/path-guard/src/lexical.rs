//! Text-only path checks.
//!
//! Nothing here touches a filesystem or reads ambient state such as the
//! current directory or the platform. What a function needs is an argument:
//! [`absolute`] takes the directory to join onto.
//!
//! [`validate_relative`] and [`windows_names`] read a root-relative path from a
//! client, where `\` folds to `/`. [`is_under`], [`absolute`] and
//! [`to_relative`] read POSIX paths on every platform: only `/` separates, so
//! a `\` is part of a name, and an absolute path starts with `/`. A Windows
//! path such as `C:\v` is relative to them. Use a [`Guard`](crate::Guard) for
//! Windows paths.

use std::path::{Path, PathBuf};

use crate::{PathError, PathWarning, PathWarningKind};

/// Lexical validation of a root-relative path.
///
/// Returns the normalised form (backslashes folded to `/`, no trailing
/// slash). Does not touch the filesystem, so it is cheap enough to call on
/// every element of a large request.
///
/// It accepts names that are devices or streams on Windows, such as `NUL` or
/// `a:b`. [`windows_names`] lists them, and a [`Guard`](crate::Guard) refuses
/// them on Windows.
///
/// # Errors
///
/// Returns a [`PathError`] naming the first rule the path breaks: empty, a
/// NUL byte, a leading `~`, a Windows drive or UNC prefix (a single letter
/// then `:` at the start, `C:x` included), an absolute path, or a `.`, `..`
/// or empty segment.
///
/// # Examples
///
/// ```
/// use path_guard::lexical::validate_relative;
/// assert_eq!(validate_relative("notes/a.md").unwrap(), "notes/a.md");
/// assert!(validate_relative("../secret").is_err());
/// ```
pub fn validate_relative(raw: &str) -> Result<String, PathError> {
    if raw.is_empty() {
        return Err(PathError::Empty);
    }
    if raw.contains('\0') {
        return Err(PathError::Nul);
    }
    if raw.starts_with('~') {
        return Err(PathError::Tilde(raw.to_string()));
    }
    // `C:\x`, `C:/x`, `C:x`, and UNC `\\server\share`.
    let b = raw.as_bytes();
    if b.len() >= 2 && b[1] == b':' && b[0].is_ascii_alphabetic() {
        return Err(PathError::WindowsPath(raw.to_string()));
    }
    if raw.starts_with("\\\\") {
        return Err(PathError::WindowsPath(raw.to_string()));
    }

    let unified = raw.replace('\\', "/");
    if unified.starts_with('/') {
        return Err(PathError::Absolute(raw.to_string()));
    }

    let trimmed = unified.trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(PathError::Empty);
    }
    for seg in trimmed.split('/') {
        match seg {
            "" | "." => return Err(PathError::DegenerateSegment(raw.to_string())),
            ".." => return Err(PathError::ParentSegment(raw.to_string())),
            _ => {}
        }
    }
    Ok(trimmed.to_string())
}

/// The segments of `raw` that are a device or a stream on Windows, in order.
///
/// The answer is the same on every platform: this reads no platform and
/// refuses nothing. Input that [`validate_relative`] refuses, such as `../NUL`
/// or `C:x`, gives no warning.
///
/// Each segment is checked after `\` has become `/`. Its base name is its text
/// up to the first `.` or `:`, with trailing spaces removed. A segment is
/// [`PathWarningKind::ReservedName`] when the base name is a reserved device
/// name, compared case-insensitively: `CON`, `PRN`, `AUX`, `NUL`, `COM0` to
/// `COM9`, `LPT0` to `LPT9`, `COM¹`, `COM²`, `COM³`, `LPT¹`, `LPT²`, `LPT³`,
/// `CONIN$` and `CONOUT$`. Otherwise it is
/// [`PathWarningKind::AlternateStream`] when it holds a `:`.
///
/// # Examples
///
/// ```
/// use path_guard::{lexical::windows_names, PathWarning, PathWarningKind};
/// let got = windows_names("NUL/a:b");
/// assert_eq!(got[0], PathWarning { kind: PathWarningKind::ReservedName, segment: "NUL".into() });
/// assert_eq!(got[1].kind, PathWarningKind::AlternateStream);
/// assert!(windows_names("console").is_empty());
/// ```
pub fn windows_names(raw: &str) -> Vec<PathWarning> {
    match validate_relative(raw) {
        Ok(rel) => names_in(&rel),
        Err(_) => Vec::new(),
    }
}

/// [`windows_names`] of a path [`validate_relative`] has accepted.
pub(crate) fn names_in(rel: &str) -> Vec<PathWarning> {
    rel.split('/')
        .filter_map(|segment| {
            let kind = if is_reserved(segment) {
                PathWarningKind::ReservedName
            } else if segment.contains(':') {
                PathWarningKind::AlternateStream
            } else {
                return None;
            };
            Some(PathWarning {
                kind,
                segment: segment.to_string(),
            })
        })
        .collect()
}

/// Microsoft's documented device names, plus `COM0`, `LPT0`, `CONIN$` and
/// `CONOUT$`, which some Windows versions or `CreateFile` open as devices.
/// `CLOCK$` is not here: Windows NT has no such device.
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM0", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
    "COM8", "COM9", "COM¹", "COM²", "COM³", "LPT0", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6",
    "LPT7", "LPT8", "LPT9", "LPT¹", "LPT²", "LPT³", "CONIN$", "CONOUT$",
];

/// Is the base name of `segment` a reserved device name?
fn is_reserved(segment: &str) -> bool {
    let end = segment.find(['.', ':']).unwrap_or(segment.len());
    let base = segment[..end].trim_end_matches(' ');
    RESERVED.iter().any(|name| name.eq_ignore_ascii_case(base))
}

/// `p` as text, or [`PathError::NotUtf8`].
fn text(p: &Path) -> Result<&str, PathError> {
    p.to_str().ok_or(PathError::NotUtf8)
}

/// An absolute POSIX path as text, or the error for a root that is not one.
/// An empty root is [`PathError::EmptyRoot`].
fn absolute_root(root: &Path) -> Result<&str, PathError> {
    if root.as_os_str().is_empty() {
        return Err(PathError::EmptyRoot);
    }
    absolute_text(root)
}

/// An absolute POSIX path as text, or [`PathError::NotAbsolute`].
fn absolute_text(p: &Path) -> Result<&str, PathError> {
    let s = text(p)?;
    if s.starts_with('/') {
        Ok(s)
    } else {
        Err(PathError::NotAbsolute(p.to_path_buf()))
    }
}

/// The names of an absolute POSIX path after `.` and empty segments are
/// dropped and each `..` removes the name before it. A `..` at the root stays
/// there.
fn fold(abs: &str) -> Vec<&str> {
    let mut out = Vec::new();
    for seg in abs.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            name => out.push(name),
        }
    }
    out
}

/// Is `path` the same place as `root`, or beneath it, read as text?
///
/// Both are folded first: `.` and empty segments dropped, each `..` removed
/// with the name before it. Then they are compared name by name, so `/vault2`
/// is not under `/vault`. No symlink is followed. Use
/// [`Guard::contains`](crate::Guard::contains) to follow them.
///
/// # Errors
///
/// [`PathError::EmptyRoot`] for an empty `root`, then
/// [`PathError::NotAbsolute`] for a `root` or `path` that does not start with
/// `/`, an empty `path` included. [`PathError::NotUtf8`] when either is not
/// valid UTF-8.
///
/// # Examples
///
/// ```
/// use path_guard::lexical::is_under;
/// use std::path::Path;
/// assert_eq!(is_under(Path::new("/vault"), Path::new("/vault/a/../b.md")), Ok(true));
/// assert_eq!(is_under(Path::new("/vault"), Path::new("/vault2")), Ok(false));
/// assert!(is_under(Path::new("/vault"), Path::new("a.md")).is_err());
/// ```
pub fn is_under(root: &Path, path: &Path) -> Result<bool, PathError> {
    let root = fold(absolute_root(root)?);
    let path = fold(absolute_text(path)?);
    Ok(path.starts_with(&root))
}

/// `path` joined onto `cwd` when it is relative, then folded: `.` and empty
/// segments dropped, each `..` removed with the name before it, no trailing
/// slash. A `..` at the root stays at the root.
///
/// This is a text fold, not a containment check. It touches no filesystem,
/// follows no symlink, and reads no current directory. To join onto the
/// process's current directory on Unix, pass `std::env::current_dir()?`.
///
/// # Errors
///
/// [`PathError::NotAbsolute`] when `cwd` does not start with `/`, an empty
/// `cwd` included, even when `path` is absolute. [`PathError::NotUtf8`] when
/// either is not valid UTF-8.
///
/// # Examples
///
/// ```
/// use path_guard::lexical::absolute;
/// use std::path::Path;
/// let cwd = Path::new("/w/x");
/// assert_eq!(absolute(Path::new("a/./b/../c"), cwd).unwrap(), Path::new("/w/x/a/c"));
/// assert_eq!(absolute(Path::new("../a"), cwd).unwrap(), Path::new("/w/a"));
/// assert_eq!(absolute(Path::new("/a/.."), cwd).unwrap(), Path::new("/"));
/// ```
pub fn absolute(path: &Path, cwd: &Path) -> Result<PathBuf, PathError> {
    let cwd = absolute_text(cwd)?;
    let path = text(path)?;
    let joined = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("{cwd}/{path}")
    };
    Ok(PathBuf::from(format!("/{}", fold(&joined).join("/"))))
}

/// Turn an absolute path back into a root-relative one (`/v/Notes/a.md` ->
/// `Notes/a.md`), with `/` separators. The root itself is the empty path.
///
/// `.` and empty segments are dropped from both before they are compared, and
/// nothing is folded: a `..` in the part under the root is refused.
///
/// # Errors
///
/// [`PathError::EmptyRoot`] for an empty `root`, then
/// [`PathError::NotAbsolute`] for a `root` or `abs` that does not start with
/// `/`. [`PathError::NotUnderRoot`] if `abs` does not start with `root`,
/// [`PathError::ParentSegment`] if the part under `root` holds a `..`, and
/// [`PathError::NotUtf8`] if either is not valid UTF-8.
///
/// # Examples
///
/// ```
/// use path_guard::{lexical::to_relative, PathError};
/// use std::path::Path;
/// let rel = to_relative(Path::new("/v"), Path::new("/v/Notes/a.md")).unwrap();
/// assert_eq!(rel, "Notes/a.md");
/// assert!(matches!(
///     to_relative(Path::new("/v"), Path::new("/other/a.md")),
///     Err(PathError::NotUnderRoot(..))
/// ));
/// ```
pub fn to_relative(root: &Path, abs: &Path) -> Result<String, PathError> {
    let root_names = names(absolute_root(root)?);
    let abs_names = names(absolute_text(abs)?);
    let Some(rest) = abs_names.strip_prefix(root_names.as_slice()) else {
        return Err(PathError::NotUnderRoot(
            abs.to_path_buf(),
            root.to_path_buf(),
        ));
    };
    let rel = rest.join("/");
    if rest.contains(&"..") {
        return Err(PathError::ParentSegment(rel));
    }
    Ok(rel)
}

/// The segments of a POSIX path, without `.` and empty ones.
fn names(s: &str) -> Vec<&str> {
    s.split('/')
        .filter(|seg| !matches!(*seg, "" | "."))
        .collect()
}

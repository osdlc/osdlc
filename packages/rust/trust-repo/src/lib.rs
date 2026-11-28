//! Per-user consent to run a repository's own scripts.
//!
//! A tool cannot take this permission from a file inside the repository, which could grant
//! itself. A person grants it once per repository; the grant is one marker file per trusted root,
//! in a folder per tool under the XDG state home, outside every checkout.
//!
//! Ports the whole-repository part of `@osdlc/trust-repo` and shares its store. Per-scope grants
//! (the `<marker>.scopes/` folders) are left alone. The crate reads no environment and starts no
//! program: the caller passes the variables and the home folder, so a test never touches the real
//! store.

#![forbid(unsafe_code)]

use std::io;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// The folder under `<state home>/<tool>/` that holds the marker files.
pub const TRUST_MARKER_DIR: &str = "trusted";

/// Owner read and write only: no other local user can read a marker.
#[cfg(unix)]
const MARKER_MODE: u32 = 0o600;
/// Owner only: no other local user can list the trusted repositories.
#[cfg(unix)]
const DIR_MODE: u32 = 0o700;
/// A root's per-scope grant folder, which this crate never reads.
const SCOPES_SUFFIX: &str = ".scopes";
/// A temporary file a killed write can leave: never a grant.
const TMP_SUFFIX: &str = ".tmp";

/// What can go wrong with the store.
#[derive(Debug, thiserror::Error)]
pub enum TrustError {
    /// A root that cannot be resolved: it is relative or empty.
    #[error("cannot resolve {path}: {source}")]
    Resolve {
        /// The root as given.
        path: PathBuf,
        /// Why it cannot be resolved.
        source: path_guard::PathError,
    },
    /// The store's folder or a marker cannot be read or written.
    #[error("cannot read or write the trust store at {path}: {source}")]
    Io {
        /// The store folder or marker file.
        path: PathBuf,
        /// The underlying failure.
        source: io::Error,
    },
}

impl TrustError {
    fn io(path: &Path, source: io::Error) -> TrustError {
        TrustError::Io {
            path: path.to_path_buf(),
            source,
        }
    }
}

/// Where `tool`'s store lives: `$XDG_STATE_HOME/<tool>/trusted`, else
/// `<home>/.local/state/<tool>/trusted`.
///
/// `XDG_STATE_HOME` counts when not blank and absolute once a leading `~` is expanded against
/// `home` (direnv, `.env` loaders and CI files pass a literal `~` through). A relative value is
/// ignored, per the XDG spec: it would put the store under the working folder, which can be the
/// repository being judged.
pub fn trust_store_dir(tool: &str, var: &dyn Fn(&str) -> Option<String>, home: &Path) -> PathBuf {
    let state_home = var("XDG_STATE_HOME")
        .map(|raw| raw.trim().to_owned())
        .filter(|raw| !raw.is_empty())
        .map(|raw| expand_tilde(&raw, home))
        .filter(|path| path.is_absolute())
        .unwrap_or_else(|| home.join(".local").join("state"));
    state_home.join(tool).join(TRUST_MARKER_DIR)
}

/// `raw` with a leading `~` (alone, or before `/`) replaced by `home`.
fn expand_tilde(raw: &str, home: &Path) -> PathBuf {
    if raw == "~" {
        home.to_path_buf()
    } else if let Some(rest) = raw.strip_prefix("~/") {
        home.join(rest)
    } else {
        PathBuf::from(raw)
    }
}

/// A name safe on every file system: each character outside `A-Za-z0-9._-` becomes `-`, one per
/// UTF-16 unit, as the TypeScript library's regular expression replaces them.
fn slug(raw: &str) -> String {
    raw.chars()
        .flat_map(|c| {
            let keep = c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-');
            let (c, n) = if keep { (c, 1) } else { ('-', c.len_utf16()) };
            std::iter::repeat_n(c, n)
        })
        .collect()
}

/// The first 16 hex characters of the SHA-256 of `bytes`.
fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .take(8)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// `<slug(basename)>-<digest(root)>`, with `root` standing in for a missing basename.
fn marker_name(resolved: &Path) -> String {
    let base = resolved
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "root".to_owned());
    format!(
        "{}-{}",
        slug(&base),
        digest(resolved.as_os_str().as_encoded_bytes())
    )
}

/// What [`TrustStore::trust`] did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustResult {
    /// The resolved root the grant is keyed on.
    pub root: PathBuf,
    /// The marker file that holds the grant.
    pub marker: PathBuf,
    /// The grant was there before the call, and nothing was written.
    pub already_trusted: bool,
}

/// A store of whole-repository grants: a folder of marker files.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustStore {
    dir: PathBuf,
}

impl TrustStore {
    /// The store whose markers are in `dir` (for a tool, [`trust_store_dir`]).
    #[must_use]
    pub fn at(dir: PathBuf) -> TrustStore {
        TrustStore { dir }
    }

    /// The folder of marker files.
    #[must_use]
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// The key a root's grant is stored under: its real path, as much of it as exists, with the
    /// missing rest kept as written. Two paths to one repository (a symlinked checkout) share one
    /// grant, and a deleted repository's grant can still be found and removed.
    ///
    /// # Errors
    /// [`TrustError::Resolve`] when `root` is relative or empty.
    pub fn resolve_root(&self, root: &Path) -> Result<PathBuf, TrustError> {
        path_guard::Guard::std()
            .real_path(root)
            .map_err(|source| TrustError::Resolve {
                path: root.to_path_buf(),
                source,
            })
    }

    /// The marker file of `root`'s grant, whether it exists or not.
    ///
    /// # Errors
    /// As [`TrustStore::resolve_root`].
    pub fn marker_path(&self, root: &Path) -> Result<PathBuf, TrustError> {
        Ok(self.dir.join(marker_name(&self.resolve_root(root)?)))
    }

    /// Whether `root` has a grant: its marker exists and its first line is not blank.
    ///
    /// # Errors
    /// As [`TrustStore::resolve_root`]; [`TrustError::Io`] when the marker cannot be read.
    pub fn is_trusted(&self, root: &Path) -> Result<bool, TrustError> {
        Ok(read_grant(&self.marker_path(root)?)?.is_some())
    }

    /// Records a grant for `root`, or writes nothing when it has one. The marker is written to a
    /// temporary file and renamed, so a half-written one is never read. On Unix, looser modes of
    /// the folder and of markers are tightened to 0700 and 0600; no other file is touched.
    ///
    /// # Errors
    /// As [`TrustStore::is_trusted`]; [`TrustError::Io`] when the folder or marker is unwritable.
    pub fn trust(&self, root: &Path) -> Result<TrustResult, TrustError> {
        let resolved = self.resolve_root(root)?;
        let marker = self.dir.join(marker_name(&resolved));
        let already_trusted = read_grant(&marker)?.is_some();
        if !already_trusted {
            create_dir(&self.dir)?;
            let mut text = resolved.as_os_str().as_encoded_bytes().to_vec();
            text.push(b'\n');
            etag_write::write_atomic(&marker, &text).map_err(|error| {
                let source = match error {
                    etag_write::WriteError::Io { source, .. } => source,
                    other => io::Error::other(other.to_string()),
                };
                TrustError::io(&marker, source)
            })?;
        }
        self.tighten(&marker);
        Ok(TrustResult {
            root: resolved,
            marker,
            already_trusted,
        })
    }

    /// Removes `root`'s grant. `false` when there was none.
    ///
    /// # Errors
    /// As [`TrustStore::is_trusted`]; [`TrustError::Io`] when the marker cannot be removed.
    pub fn untrust(&self, root: &Path) -> Result<bool, TrustError> {
        let marker = self.marker_path(root)?;
        if read_grant(&marker)?.is_none() {
            return Ok(false);
        }
        match std::fs::remove_file(&marker) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
            Err(error) => Err(TrustError::io(&marker, error)),
        }
    }

    /// Every root with a grant, sorted; empty when the folder is missing. Temporary files,
    /// per-scope folders, blank markers and files not named as the marker of the root they hold
    /// (a renamed or copied marker) are skipped.
    ///
    /// # Errors
    /// [`TrustError::Io`] when the folder or a marker exists and cannot be read.
    pub fn list(&self) -> Result<Vec<PathBuf>, TrustError> {
        let entries = match std::fs::read_dir(&self.dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(TrustError::io(&self.dir, error)),
        };
        let mut roots = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|error| TrustError::io(&self.dir, error))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(TMP_SUFFIX) || name.ends_with(SCOPES_SUFFIX) {
                continue;
            }
            let Some(root) = read_grant(&entry.path())? else {
                continue;
            };
            let root = PathBuf::from(root);
            if name == marker_name(&root) {
                roots.push(root);
            }
        }
        roots.sort_by(|a, b| a.as_os_str().cmp(b.as_os_str()));
        Ok(roots)
    }

    /// On Unix, tightens the folder to 0700, and to 0600 `marker` and every regular file named as
    /// the marker of the root it holds (the rule [`TrustStore::list`] counts grants by). A marker
    /// that is a link is left alone, since chmod would change its target outside the store. A mode
    /// it cannot change is left as it is: the grant is written either way.
    fn tighten(&self, marker: &Path) {
        #[cfg(unix)]
        {
            tighten_one(&self.dir, DIR_MODE);
            if std::fs::symlink_metadata(marker).is_ok_and(|meta| meta.is_file()) {
                tighten_one(marker, MARKER_MODE);
            }
            let Ok(entries) = std::fs::read_dir(&self.dir) else {
                return;
            };
            for entry in entries.flatten() {
                let is_file = entry.file_type().is_ok_and(|kind| kind.is_file());
                let name = entry.file_name().to_string_lossy().into_owned();
                let named = is_file
                    && matches!(
                        read_grant(&entry.path()),
                        Ok(Some(root)) if name == marker_name(Path::new(&root))
                    );
                if named {
                    tighten_one(&entry.path(), MARKER_MODE);
                }
            }
        }
        #[cfg(not(unix))]
        let _ = marker;
    }
}

/// Makes `dir` and its missing parents, 0700 on Unix.
fn create_dir(dir: &Path) -> Result<(), TrustError> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, DIR_MODE);
    builder
        .create(dir)
        .map_err(|error| TrustError::io(dir, error))
}

/// Sets `path`'s permission bits to `mode` when they include a bit `mode` does not allow.
#[cfg(unix)]
fn tighten_one(path: &Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    let bits = meta.permissions().mode() & 0o777;
    if bits & !mode != 0 {
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode));
    }
}

/// The marker's first line, trimmed, when not blank; `None` for no marker or a folder.
fn read_grant(path: &Path) -> Result<Option<String>, TrustError> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::IsADirectory
            ) =>
        {
            return Ok(None);
        }
        Err(error) => return Err(TrustError::io(path, error)),
    };
    let text = String::from_utf8_lossy(&bytes);
    let first = text.split('\n').next().unwrap_or_default().trim();
    Ok((!first.is_empty()).then(|| first.to_owned()))
}

/// Why [`ExecGate::allow_exec`] came out as it did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateReason {
    /// The tool's setting is on and the root is trusted.
    Allowed,
    /// The per-run flag allowed this run.
    AllowedByFlag,
    /// The root has no grant.
    Untrusted,
    /// The tool's setting, or a per-run flag of `false`, turned it off.
    ConfiguredOff,
}

/// Whether a repository's code may run, and why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecGate {
    /// Whether the repository's code may run.
    pub allow_exec: bool,
    /// The tool's configured value, before trust.
    pub configured: bool,
    /// Whether the root has a grant; `false` when a flag meant the store was not read.
    pub trusted: bool,
    /// Why `allow_exec` is what it is.
    pub reason: GateReason,
    /// The resolved root the answer is keyed on.
    pub root: PathBuf,
}

/// Combines the tool's configured value, a per-run flag and the store into one answer.
///
/// | flag   | configured | trusted  | allow_exec | reason          |
/// |--------|------------|----------|------------|-----------------|
/// | false  | any        | not read | false      | ConfiguredOff   |
/// | true   | any        | not read | true       | AllowedByFlag   |
/// | none   | false      | any      | false      | ConfiguredOff   |
/// | none   | true       | false    | false      | Untrusted       |
/// | none   | true       | true     | true       | Allowed         |
///
/// A flag answers without reading the store, so a missing or unreadable store cannot block it;
/// [`ExecGate::trusted`] is then `false`. A flag of `true` is one run's consent and is never
/// saved: saved, it would be a lasting grant nobody remembers giving.
///
/// # Errors
/// As [`TrustStore::is_trusted`].
pub fn resolve_exec_gate(
    store: &TrustStore,
    root: &Path,
    configured: bool,
    flag: Option<bool>,
) -> Result<ExecGate, TrustError> {
    let root = store.resolve_root(root)?;
    if let Some(flag) = flag {
        return Ok(ExecGate {
            allow_exec: flag,
            configured,
            trusted: false,
            reason: if flag {
                GateReason::AllowedByFlag
            } else {
                GateReason::ConfiguredOff
            },
            root,
        });
    }
    let trusted = store.is_trusted(&root)?;
    let (allow_exec, reason) = if !configured {
        (false, GateReason::ConfiguredOff)
    } else if !trusted {
        (false, GateReason::Untrusted)
    } else {
        (true, GateReason::Allowed)
    };
    Ok(ExecGate {
        allow_exec,
        configured,
        trusted,
        reason,
        root,
    })
}

/// The sentence a tool shows when it withheld something from an untrusted repository. `verb` is
/// the trust command (`trust`); `flag` the per-run flag, `None` where the command has none.
#[must_use]
pub fn withheld_hint(tool: &str, verb: &str, flag: Option<&str>) -> String {
    let per_run = flag.map_or_else(String::new, |flag| {
        format!(", or pass {flag} for this run only")
    });
    format!("this repository is not trusted — run \"{tool} {verb}\" to trust it{per_run}")
}

/// The README's example runs as a doc test.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;

#[cfg(test)]
mod tests;

//! Machine-local directories for one vendor's products, addressed on two axes.
//!
//! # Two axes, not one
//!
//! A directory is addressed by naming BOTH axes. Neither alone is an address.
//!
//! **Tier — who shares the state:**
//!
//! | tier       | segment              | shared by |
//! |------------|----------------------|-----------|
//! | vendor     | `<vendor>`           | every product line the vendor ships |
//! | suite      | `<vendor>.<suite>`   | the products that share user data |
//! | product    | `<durable>/<bundle id>`, or the app framework's own directory | one product, keyed by bundle identifier |
//! | standalone | `<tool>`             | one general tool, shipped outside the vendor's suite |
//!
//! **Home — how durable the state is:** `durable`, `config`, `cache`,
//! `logs`, `runtime`.
//!
//! [`TieredDirs::scratch`] sits outside both axes: see "`scratch` is not a
//! home".
//!
//! ```
//! use tiered_dirs::{BaseDirs, TieredDirs};
//!
//! let dirs = TieredDirs::with_base_dirs("com.example", BaseDirs::rooted("/stub"))?;
//! let dir = dirs
//!     .suite("notes")?
//!     .cache()
//!     .scoped("vaults", "v7")?
//!     .app("search")?;
//! assert_eq!(
//!     dir.path(),
//!     std::path::Path::new("/stub/cache/com.example.notes/vaults/v7/search"),
//! );
//! # Ok::<(), tiered_dirs::Error>(())
//! ```
//!
//! # Composition
//!
//! The vendor segment is the only string the caller fixes up front. The suite
//! segment is composed as `vendor + "." + suite_key`. It is deliberately NOT
//! derived from a bundle identifier: bundle identifiers carry brand and
//! product segments that change on their own schedule. `suite_key` stays a
//! caller-supplied constant.
//!
//! # A general tool supplies its own root
//!
//! The vendor and suite tiers govern a SUITE: products that share one owner,
//! and at the suite tier one user's data. A general tool the vendor ships into
//! other people's repositories is not in that suite. Installed in a third
//! party's checkout, `suite("tool")` would write the vendor's namespace onto
//! their machine.
//!
//! [`TieredDirs::standalone`] is the tier for that tool. Its segment is the
//! bare tool name — `~/.config/<tool>`, what a general CLI idiomatically owns —
//! with no vendor composition.
//!
//! [`Tier::kind`] reports which constructor produced a tier, so a caller or a
//! gate can tell a suite address from a standalone one without parsing the
//! segment.
//!
//! # The product tier
//!
//! The product tier is one product's own directory, keyed by its bundle
//! identifier. An app framework such as Tauri usually resolves it, so this
//! crate takes no framework dependency and leaves that tier to a thin layer
//! above it. Such a layer can use [`TieredDirs::is_vendor_bundle_id`] to check that the
//! product's bundle identifier sits under the vendor.
//!
//! # `scratch` is not a home
//!
//! [`TieredDirs::scratch`] hands back the platform temp directory. It wraps
//! `std::env::temp_dir()` and adds nothing to it, so "no direct OS path call
//! outside this crate" stays a greppable invariant with no exception.
//!
//! It is untiered, and it is not [`Home::Runtime`]. Scratch holds state that
//! does not outlive a single call — a temp file a command writes and removes.
//! Runtime holds state that does outlive the call and describes a live
//! process: a pidfile, a socket, a lock. A pidfile in scratch is lost to the
//! next temp sweep while its process still runs; a scratch file in runtime is
//! never swept at all.
//!
//! # Tiers are distinct addresses. There is no merge.
//!
//! `vendor().durable()` and `suite(k).durable()` are different locations.
//! This crate never reads both and merges them. A given piece of state lives
//! at exactly one tier and the caller names the tier it means.
//!
//! # The three traps this crate exists to absorb
//!
//! 1. **`logs` has no `dirs` equivalent.** macOS wants `~/Library/Logs`.
//!    [`BaseDirs::from_env`] branches on the platform explicitly. Folding logs
//!    into cache would be silently wrong — the OS purges cache.
//! 2. **`dirs::runtime_dir()` is `None` off Linux** (it needs
//!    `XDG_RUNTIME_DIR`). Where it is absent, runtime resolves under
//!    `<durable>/run`, deliberately NOT under cache: the OS may purge cache
//!    while the process a pidfile describes is still alive.
//! 3. **Every base directory can fail.** Headless CI and sandboxes do not
//!    always have a home directory. Nothing here unwraps; a missing base
//!    directory is [`Error::MissingBaseDir`].
//!
//! # Testability
//!
//! Base directories are resolved ONCE, at construction, and are injectable.
//! Nothing below [`BaseDirs`] reads the environment, so a test asserts exact
//! paths without touching a real home directory. [`BaseDirs::rooted`] is the
//! seam the parity fixture uses, and [`BaseDirs::from_env_with`] takes the
//! override variables from a test's own map.
//!
//! # Overrides and scratch roots
//!
//! Every base directory can be moved by environment variable, so a test or
//! harness can run a whole app inside one scratch root. The caller names the
//! variables with [`EnvVars`], usually through [`env_vars!`] and a prefix:
//! `env_vars!("MYAPP")` reads `MYAPP_ROOT`, `MYAPP_<HOME>_DIR`,
//! `MYAPP_SCRATCH_DIR` and `MYAPP_REQUIRE_OVERRIDE`.
//!
//! Per base directory, the first answer wins: the per-home variable, then the
//! root variable laid out as [`BaseDirs::rooted`], then the OS default. See
//! [`BaseDirs::from_env`]. The TS twin's `systemBaseDirs` resolves the same
//! order, held to it by the `env_cases` in the parity fixture.
//!
//! # Tests never resolve a real home
//!
//! Two rules sit in [`BaseDirs::from_env`], above that order:
//!
//! - **A cargo test binary defaults to a scratch root.** When the root
//!   variable is unset in a test binary that cargo or nextest runs, it reads
//!   as [`test_root`]: `<temp>/tiered-dirs-test-<pid>-<start nanos>`, unique
//!   per process. Plain `cargo test` needs no setup, and a killed run leaves
//!   its debris in temp, not in the real homes. A test binary run directly,
//!   as an IDE debugger does, has no `CARGO` set and gets none.
//! - **[`EnvVars::require_override`] turns the OS fallback into an error.** A
//!   test runner sets it. Child processes inherit it, so a binary a test
//!   spawns without a scratch root fails loudly instead of writing to the
//!   real home.
//!
//! [`BaseDirs::from_env_with`] applies neither rule. A test that means to
//! read the OS defaults calls it directly.
//!
//! # Windows
//!
//! An override variable must hold an absolute path. On Windows that means a
//! drive or a UNC prefix: `C:\state` or `\\server\share\state`. A path such as
//! `\state` is relative to the current drive, so it is refused like any other
//! relative path.
//!
//! # The TypeScript twin
//!
//! A TypeScript twin is developed alongside it and will be published later.
//! Both are checked against `tests/fixtures/parity.json`. The two must agree
//! on the path produced for a given (tier, home, scope, app), or a Rust
//! program and a TypeScript program over the same state split it. Neither
//! twin may add a path shape the other lacks.
//!
//! # Stability
//!
//! Each public item's docs say "stable in 0.x": it is not expected to change
//! in a breaking way before 1.0. [`Error`] is `#[non_exhaustive]`, so a later
//! release can add a variant without a breaking change.

#![forbid(unsafe_code)]
#![warn(missing_docs, clippy::missing_errors_doc, clippy::missing_panics_doc)]

// Runs the README's code blocks as doc-tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;

use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// The names of the environment variables that move base directories.
///
/// Build one with [`env_vars!`], which derives every name from a prefix. The
/// fields are public so a caller with names that follow no prefix can spell
/// them out.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct EnvVars {
    /// Moves every base directory not moved by its own variable into the
    /// [`BaseDirs::rooted`] layout under the named root.
    pub root: &'static str,
    /// Moves the durable home.
    pub durable: &'static str,
    /// Moves the config home.
    pub config: &'static str,
    /// Moves the cache home.
    pub cache: &'static str,
    /// Moves the logs home.
    pub logs: &'static str,
    /// Moves the runtime home.
    pub runtime: &'static str,
    /// Moves the scratch root.
    pub scratch: &'static str,
    /// When set (non-empty), [`BaseDirs::from_env`] errors instead of falling
    /// back to an OS home.
    pub require_override: &'static str,
}

/// [`EnvVars`] named from one prefix: `<P>_ROOT`, `<P>_DURABLE_DIR`,
/// `<P>_CONFIG_DIR`, `<P>_CACHE_DIR`, `<P>_LOGS_DIR`, `<P>_RUNTIME_DIR`,
/// `<P>_SCRATCH_DIR` and `<P>_REQUIRE_OVERRIDE`.
///
/// Usable in a `const`:
///
/// ```
/// const ENV: tiered_dirs::EnvVars = tiered_dirs::env_vars!("MYAPP");
/// assert_eq!(ENV.root, "MYAPP_ROOT");
/// assert_eq!(ENV.cache, "MYAPP_CACHE_DIR");
/// ```
///
/// **Stability:** stable in 0.x.
#[macro_export]
macro_rules! env_vars {
    ($prefix:literal) => {
        $crate::EnvVars {
            root: concat!($prefix, "_ROOT"),
            durable: concat!($prefix, "_DURABLE_DIR"),
            config: concat!($prefix, "_CONFIG_DIR"),
            cache: concat!($prefix, "_CACHE_DIR"),
            logs: concat!($prefix, "_LOGS_DIR"),
            runtime: concat!($prefix, "_RUNTIME_DIR"),
            scratch: concat!($prefix, "_SCRATCH_DIR"),
            require_override: concat!($prefix, "_REQUIRE_OVERRIDE"),
        }
    };
}

impl EnvVars {
    /// The variable that moves one base directory: a [`Home`]'s, or scratch's
    /// for `None` (scratch is not a home).
    pub const fn dir(&self, home: Option<Home>) -> &'static str {
        match home {
            Some(Home::Durable) => self.durable,
            Some(Home::Config) => self.config,
            Some(Home::Cache) => self.cache,
            Some(Home::Logs) => self.logs,
            Some(Home::Runtime) => self.runtime,
            None => self.scratch,
        }
    }

    /// Every variable that moves a base directory: the root and the six
    /// per-directory names. Excludes [`EnvVars::require_override`], which
    /// moves nothing.
    pub const fn overrides(&self) -> [&'static str; 7] {
        [
            self.root,
            self.durable,
            self.config,
            self.cache,
            self.logs,
            self.runtime,
            self.scratch,
        ]
    }

    /// Whether `var` sets any of [`EnvVars::overrides`] to a non-empty value.
    pub fn is_overridden(&self, var: impl Fn(&str) -> Option<OsString>) -> bool {
        self.overrides()
            .iter()
            .any(|name| var(name).is_some_and(|value| !value.is_empty()))
    }
}

/// Whether a bundle identifier sits under `vendor`: a bare prefix test,
/// matching the TS twin's `isVendorBundleId`. Nothing stricter: a dot-boundary
/// rule would make the twins disagree about which apps conform.
///
/// **Stability:** stable in 0.x.
pub fn is_vendor_bundle_id(vendor: &str, bundle_id: &str) -> bool {
    bundle_id.starts_with(vendor)
}

/// Debug-only [`is_vendor_bundle_id`] check, for a caller with no
/// `TieredDirs`. A migration tracker, not a gate: it cannot break a release
/// build.
///
/// **Stability:** stable in 0.x.
pub fn assert_vendor_bundle_id(vendor: &str, bundle_id: &str) {
    debug_assert!(
        is_vendor_bundle_id(vendor, bundle_id),
        "bundle identifier {bundle_id:?} does not start with {vendor:?}",
    );
}

/// Directory name that holds runtime state where the platform offers no
/// runtime directory of its own (trap 2).
const RUNTIME_FALLBACK_SEGMENT: &str = "run";

/// Everything this crate can fail with.
///
/// New variants may be added in a compatible release (0.1.z), so a `match`
/// needs a wildcard arm.
///
/// **Stability:** stable in 0.x. The four variants and their fields are not
/// expected to change; new variants may be added.
#[derive(Debug, thiserror::Error, PartialEq, Eq, Clone)]
#[non_exhaustive]
pub enum Error {
    /// A base directory the caller asked for does not exist on this machine.
    /// Returned, never panicked: headless CI and sandboxes can lack a home.
    #[error("no {home} base directory available on this platform")]
    MissingBaseDir {
        /// The base directory's name: a [`Home::as_str`] value, or `scratch`.
        home: &'static str,
    },

    /// An override variable holds a relative path. Refused rather than
    /// resolved against the working directory or ignored: either would put
    /// state somewhere the caller did not name.
    #[error("{var} must be an absolute path")]
    RelativeOverride {
        /// The variable that holds the relative path.
        var: &'static str,
    },

    /// `require_var` is set, and a base directory would fall back to the OS
    /// home because neither `root_var` nor `var` is set.
    #[error(
        "{require_var} is set but neither {root_var} nor {var} is: set \
         {root_var} to a scratch directory, or build from BaseDirs::rooted"
    )]
    OverrideRequired {
        /// The first per-directory variable found unset.
        var: &'static str,
        /// [`EnvVars::root`].
        root_var: &'static str,
        /// [`EnvVars::require_override`].
        require_var: &'static str,
    },

    /// A caller-supplied segment is not a safe single path segment.
    #[error(
        "invalid {kind} key {key:?}: want a leading letter/digit then ._-, \
         no path separator or \"..\""
    )]
    InvalidKey {
        /// What the segment was for: `vendor`, `suite`, `standalone`,
        /// `scope kind`, `scope` or `app`.
        kind: &'static str,
        /// The segment as given.
        key: String,
    },
}

/// Whether `key` is a safe single path segment: a leading ASCII letter/digit,
/// then letters/digits and `.`/`_`/`-`, with no separator and no `..`.
///
/// Mirrors the TS twin's `isValidSegment`. [`TieredDirs::with_base_dirs`],
/// [`TieredDirs::suite`], [`Dir::scoped`] and [`Dir::app`] apply it
/// themselves; this is for callers that want the answer without the path.
///
/// **Stability:** stable in 0.x.
pub fn is_valid_segment(key: &str) -> bool {
    if key.is_empty() {
        return false;
    }
    if key.contains('/') || key.contains('\\') || key.contains("..") {
        return false;
    }
    let first_ok = key
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphanumeric());
    first_ok
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn check_key(kind: &'static str, key: &str) -> Result<(), Error> {
    if is_valid_segment(key) {
        Ok(())
    } else {
        Err(Error::InvalidKey {
            kind,
            key: key.to_string(),
        })
    }
}

/// The horizontal axis: how durable a piece of state is.
///
/// Distinct from the tier axis, and orthogonal to it — every tier offers
/// every home.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Home {
    /// State that must survive: registries, minted ids, user content.
    Durable,
    /// User-editable settings.
    Config,
    /// Regenerable derived state. The OS may purge it at any time.
    Cache,
    /// Log files. Never cache — purging logs loses the evidence.
    Logs,
    /// Process-lifetime state: pidfiles, sockets, locks.
    Runtime,
}

impl Home {
    /// Stable lowercase name, used in error messages and by the parity
    /// fixture as the home column.
    pub const fn as_str(self) -> &'static str {
        match self {
            Home::Durable => "durable",
            Home::Config => "config",
            Home::Cache => "cache",
            Home::Logs => "logs",
            Home::Runtime => "runtime",
        }
    }

    /// Every home.
    pub const ALL: [Home; 5] = [
        Home::Durable,
        Home::Config,
        Home::Cache,
        Home::Logs,
        Home::Runtime,
    ];
}

/// The platform base directories, resolved once: the five homes plus
/// `scratch`.
///
/// Construct with [`BaseDirs::from_env`] in production and
/// [`BaseDirs::rooted`] or [`BaseDirs::from_parts`] in tests. Once built,
/// nothing in this crate consults the environment again — path resolution
/// below this type is pure.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BaseDirs {
    durable: PathBuf,
    config: PathBuf,
    cache: PathBuf,
    logs: PathBuf,
    runtime: PathBuf,
    scratch: PathBuf,
}

impl BaseDirs {
    /// Resolve from the environment and the platform, once.
    ///
    /// Each base directory takes the first answer in this order:
    ///
    /// 1. Its own variable: [`EnvVars::dir`].
    /// 2. [`EnvVars::root`] — the [`BaseDirs::rooted`] layout.
    /// 3. The OS default:
    ///
    /// | home    | OS default |
    /// |---------|------------|
    /// | durable | `dirs::data_dir()` |
    /// | config  | `dirs::config_dir()` |
    /// | cache   | `dirs::cache_dir()` |
    /// | logs    | `~/Library/Logs` on macOS; `dirs::state_dir()`, else `<durable>/logs`, elsewhere |
    /// | runtime | `dirs::runtime_dir()` where the platform has one, else `<durable>/run` |
    /// | scratch | `std::env::temp_dir()` |
    ///
    /// Runtime follows durable: when the runtime variable is unset but durable
    /// is moved by step 1 or 2, runtime is `<durable>/run`, never the OS
    /// runtime directory. An empty variable counts as unset.
    ///
    /// Errors rather than panics when a base directory is unavailable, or
    /// when an override is not an absolute path.
    ///
    /// Two test rules run first (see "Tests never resolve a real home" in the
    /// crate docs): in a cargo test binary an unset root variable reads as
    /// [`test_root`], and with [`EnvVars::require_override`] set an OS
    /// fallback is [`Error::OverrideRequired`].
    ///
    /// # Errors
    ///
    /// [`Error::RelativeOverride`] when a variable holds a relative path,
    /// [`Error::OverrideRequired`] when [`EnvVars::require_override`] is set and
    /// a base directory would fall back to the OS default, and
    /// [`Error::MissingBaseDir`] when the platform has no such directory.
    pub fn from_env(vars: &EnvVars) -> Result<Self, Error> {
        Self::from_env_guarded(vars, |name| std::env::var_os(name), test_root())
    }

    /// [`BaseDirs::from_env`] with the environment and the test root
    /// injected, so the test rules are testable without the process env.
    fn from_env_guarded(
        vars: &EnvVars,
        var: impl Fn(&str) -> Option<OsString>,
        test_root: Option<&Path>,
    ) -> Result<Self, Error> {
        let var = |name: &str| var(name).filter(|value| !value.is_empty());
        if var(vars.root).is_some() {
            return Self::from_env_with(vars, var);
        }
        if let Some(root) = test_root {
            return Self::from_env_with(vars, |name| {
                if name == vars.root {
                    Some(root.as_os_str().to_owned())
                } else {
                    var(name)
                }
            });
        }
        if var(vars.require_override).is_some() {
            // Runtime follows a moved durable, so it needs no variable of its own.
            let required = [
                vars.durable,
                vars.config,
                vars.cache,
                vars.logs,
                vars.scratch,
            ];
            if let Some(missing) = required.into_iter().find(|name| var(name).is_none()) {
                return Err(Error::OverrideRequired {
                    var: missing,
                    root_var: vars.root,
                    require_var: vars.require_override,
                });
            }
        }
        Self::from_env_with(vars, var)
    }

    /// [`BaseDirs::from_env`] with the override variables read through `var`
    /// instead of the process environment. The OS defaults still come from
    /// the platform. The seam that lets a test exercise every precedence case
    /// without mutating the process env.
    ///
    /// # Errors
    ///
    /// [`Error::RelativeOverride`] when a variable holds a relative path, and
    /// [`Error::MissingBaseDir`] when the platform has no such directory.
    #[allow(
        clippy::disallowed_methods,
        reason = "this is the one place that resolves platform base directories"
    )]
    pub fn from_env_with(
        vars: &EnvVars,
        var: impl Fn(&str) -> Option<OsString>,
    ) -> Result<Self, Error> {
        let read = |name: &'static str| -> Result<Option<PathBuf>, Error> {
            match var(name).filter(|value| !value.is_empty()) {
                None => Ok(None),
                Some(value) => {
                    let path = PathBuf::from(value);
                    if path.is_absolute() {
                        Ok(Some(path))
                    } else {
                        Err(Error::RelativeOverride { var: name })
                    }
                }
            }
        };
        let rooted = read(vars.root)?.map(Self::rooted);
        let from_root = |pick: fn(&Self) -> &Path| rooted.as_ref().map(|r| pick(r).to_path_buf());

        let durable = read(vars.durable)?.or_else(|| from_root(|r| &r.durable));
        let durable_moved = durable.is_some();
        let durable = durable.or_else(dirs::data_dir);
        let config = read(vars.config)?
            .or_else(|| from_root(|r| &r.config))
            .or_else(dirs::config_dir);
        let cache = read(vars.cache)?
            .or_else(|| from_root(|r| &r.cache))
            .or_else(dirs::cache_dir);
        let logs = read(vars.logs)?
            .or_else(|| from_root(|r| &r.logs))
            .or_else(env_logs_dir);
        // `None` makes `from_parts` fall back to `<durable>/run`.
        let runtime = match read(vars.runtime)? {
            Some(runtime) => Some(runtime),
            None if durable_moved => None,
            None => dirs::runtime_dir(),
        };
        let scratch = read(vars.scratch)?
            .or_else(|| from_root(|r| &r.scratch))
            .or_else(|| Some(std::env::temp_dir()));
        Self::from_parts(durable, config, cache, logs, runtime, scratch)
    }

    /// Assemble from raw optional roots, exactly as `dirs` hands them over.
    ///
    /// A `None` runtime is not an error: it resolves to `<durable>/run`
    /// (trap 2). Every other `None` is an [`Error::MissingBaseDir`]
    /// (trap 3). This is the seam that lets a test exercise a machine with no
    /// home directory.
    ///
    /// # Errors
    ///
    /// [`Error::MissingBaseDir`] for the first of durable, config, cache, logs
    /// and scratch that is `None`.
    pub fn from_parts(
        durable: Option<PathBuf>,
        config: Option<PathBuf>,
        cache: Option<PathBuf>,
        logs: Option<PathBuf>,
        runtime: Option<PathBuf>,
        scratch: Option<PathBuf>,
    ) -> Result<Self, Error> {
        let durable = durable.ok_or(Error::MissingBaseDir { home: "durable" })?;
        let config = config.ok_or(Error::MissingBaseDir { home: "config" })?;
        let cache = cache.ok_or(Error::MissingBaseDir { home: "cache" })?;
        let logs = logs.ok_or(Error::MissingBaseDir { home: "logs" })?;
        let scratch = scratch.ok_or(Error::MissingBaseDir { home: "scratch" })?;
        let runtime = runtime.unwrap_or_else(|| durable.join(RUNTIME_FALLBACK_SEGMENT));
        Ok(Self {
            durable,
            config,
            cache,
            logs,
            runtime,
            scratch,
        })
    }

    /// Every base directory under one stub root: `<root>/durable`,
    /// `<root>/config`, `<root>/cache`, `<root>/logs`, `<root>/scratch`, and
    /// runtime at `<root>/durable/run`.
    ///
    /// The layout [`EnvVars::root`] selects, and the test and parity-fixture
    /// seam. The TS twin ships the same helper with the same layout, so a
    /// fixture row asserts identical absolute paths on both arms.
    pub fn rooted(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref();
        let durable = root.join("durable");
        let runtime = durable.join(RUNTIME_FALLBACK_SEGMENT);
        Self {
            durable,
            config: root.join("config"),
            cache: root.join("cache"),
            logs: root.join("logs"),
            runtime,
            scratch: root.join("scratch"),
        }
    }

    /// The base directory for one home.
    pub fn get(&self, home: Home) -> &Path {
        match home {
            Home::Durable => &self.durable,
            Home::Config => &self.config,
            Home::Cache => &self.cache,
            Home::Logs => &self.logs,
            Home::Runtime => &self.runtime,
        }
    }

    /// The platform temp directory. Deliberately not reachable through
    /// [`BaseDirs::get`]: scratch is not a [`Home`], because nothing in it
    /// outlives the call that wrote it.
    pub fn scratch(&self) -> &Path {
        &self.scratch
    }
}

/// `<temp>/tiered-dirs-test-<pid>-<start nanos>` when this process is a test
/// binary that cargo or nextest runs, else `None`. Resolved once per process.
///
/// A test binary lives in `<target>/<profile>/deps/` and runs with `CARGO` (or
/// `NEXTEST`) set. Requiring both keeps an installed app, or a `cargo run`
/// binary in `<target>/<profile>/`, on the real homes. A doctest binary lives
/// in a rustdoc temp dir and gets no default; [`EnvVars::require_override`]
/// catches it when a test runner sets that variable.
///
/// The start time keeps a later process that reuses the pid off this one's
/// leftover state. Callers that read the environment themselves, such as a
/// product-tier layer, use this to apply the same default.
///
/// **Stability:** stable in 0.x.
pub fn test_root() -> Option<&'static Path> {
    static ROOT: std::sync::OnceLock<Option<PathBuf>> = std::sync::OnceLock::new();
    ROOT.get_or_init(|| {
        let under_runner =
            std::env::var_os("CARGO").is_some() || std::env::var_os("NEXTEST").is_some();
        let exe = std::env::current_exe().ok()?;
        let in_deps = exe.parent().and_then(Path::file_name) == Some("deps".as_ref());
        let started = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        (under_runner && in_deps).then(|| {
            std::env::temp_dir().join(format!("tiered-dirs-test-{}-{started}", std::process::id()))
        })
    })
    .as_deref()
}

/// macOS keeps logs in its own place and `dirs` has no accessor for it
/// (trap 1). Elsewhere the XDG state directory is the closest match, and where
/// the platform has none — Windows — logs land at `<durable>/logs`.
///
/// The local data directory is deliberately NOT the fallback: on Windows that
/// is `%LOCALAPPDATA%`, the same root as `cache_dir()`, so logs would sit in
/// the tree the OS purges. That is trap 1 by another route. The TS twin's
/// per-OS table resolves the same three cells.
#[allow(
    clippy::disallowed_methods,
    reason = "this is the one place that resolves platform base directories"
)]
fn env_logs_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|home| home.join("Library").join("Logs"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        dirs::state_dir().or_else(|| dirs::data_dir().map(|data| data.join("logs")))
    }
}

/// The entry point. Holds the vendor and the resolved base directories, and
/// hands out tiers.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TieredDirs {
    vendor: String,
    base: BaseDirs,
}

impl TieredDirs {
    /// Resolve the platform base directories once, reading the override
    /// variables `vars` names, and build a `TieredDirs` for `vendor`.
    ///
    /// `vendor` is validated as a single path segment, e.g. `com.example`.
    ///
    /// # Errors
    ///
    /// The errors of [`BaseDirs::from_env`], and [`Error::InvalidKey`] when
    /// `vendor` is not a valid segment.
    pub fn from_env(vendor: &str, vars: &EnvVars) -> Result<Self, Error> {
        Self::with_base_dirs(vendor, BaseDirs::from_env(vars)?)
    }

    /// [`TieredDirs::from_env`] with the variables read through `var`; see
    /// [`BaseDirs::from_env_with`] for what it skips.
    ///
    /// # Errors
    ///
    /// The errors of [`BaseDirs::from_env_with`], and [`Error::InvalidKey`] when
    /// `vendor` is not a valid segment.
    pub fn from_env_with(
        vendor: &str,
        vars: &EnvVars,
        var: impl Fn(&str) -> Option<OsString>,
    ) -> Result<Self, Error> {
        Self::with_base_dirs(vendor, BaseDirs::from_env_with(vars, var)?)
    }

    /// Build from injected base directories. The testable constructor.
    ///
    /// `vendor` is validated as a single path segment, e.g. `com.example`.
    ///
    /// # Errors
    ///
    /// [`Error::InvalidKey`] when `vendor` is not a valid segment.
    pub fn with_base_dirs(vendor: &str, base: BaseDirs) -> Result<Self, Error> {
        check_key("vendor", vendor)?;
        Ok(Self {
            vendor: vendor.to_string(),
            base,
        })
    }

    /// The vendor segment this `TieredDirs` was built with.
    pub fn vendor_name(&self) -> &str {
        &self.vendor
    }

    /// The base directories this `TieredDirs` resolved at construction.
    pub fn base_dirs(&self) -> &BaseDirs {
        &self.base
    }

    /// The vendor tier: `<vendor>`. Shared by every product line.
    pub fn vendor(&self) -> Tier<'_> {
        Tier {
            base: &self.base,
            kind: TierKind::Vendor,
            segment: self.vendor.clone(),
        }
    }

    /// The suite tier: `<vendor>.<suite_key>`. Shared by the products that
    /// share user data.
    ///
    /// `suite_key` is validated as a single path segment; it is a
    /// caller-supplied constant, never derived from a bundle identifier.
    ///
    /// # Errors
    ///
    /// [`Error::InvalidKey`] when `suite_key` is not a valid segment.
    pub fn suite(&self, suite_key: &str) -> Result<Tier<'_>, Error> {
        check_key("suite", suite_key)?;
        Ok(Tier {
            base: &self.base,
            kind: TierKind::Suite,
            segment: format!("{}.{suite_key}", self.vendor),
        })
    }

    /// The standalone tier: the bare `tool` name, with NO vendor segment.
    ///
    /// For a general tool the vendor ships into other people's repositories.
    /// It is not part of the vendor's suite, so it must not write under the
    /// vendor's namespace; it owns `~/.config/<tool>` the way any general CLI
    /// does.
    ///
    /// `tool` is validated as a single path segment. Use
    /// [`TieredDirs::suite`] for anything that ships as part of the suite —
    /// the two are different addresses and nothing merges them.
    ///
    /// # Errors
    ///
    /// [`Error::InvalidKey`] when `tool` is not a valid segment.
    pub fn standalone(&self, tool: &str) -> Result<Tier<'_>, Error> {
        check_key("standalone", tool)?;
        Ok(Tier {
            base: &self.base,
            kind: TierKind::Standalone,
            segment: tool.to_string(),
        })
    }

    /// Whether a bundle identifier sits under this vendor.
    ///
    /// A bare prefix test, matching the TS twin's `isVendorBundleId`. Nothing
    /// stricter: a dot-boundary rule would make the twins disagree about which
    /// apps conform.
    pub fn is_vendor_bundle_id(&self, bundle_id: &str) -> bool {
        is_vendor_bundle_id(&self.vendor, bundle_id)
    }

    /// Debug-only check that a bundle identifier sits under this vendor.
    ///
    /// A migration tracker, not a gate: it cannot break a release build. An
    /// app still on a legacy prefix fails it, which is how adopting this crate
    /// surfaces the app as non-conformant.
    ///
    /// TS has no debug assertion, so the twin stops at
    /// [`TieredDirs::is_vendor_bundle_id`] and leaves the caller to decide.
    /// Same predicate either way.
    pub fn assert_vendor_bundle_id(&self, bundle_id: &str) {
        assert_vendor_bundle_id(&self.vendor, bundle_id);
    }

    /// The platform temp directory, untiered: state that does not outlive the
    /// call that wrote it.
    ///
    /// Not [`Tier::runtime`]. Runtime holds state that DOES outlive the call
    /// and describes a live process — a pidfile, a socket, a lock — and the OS
    /// sweeps temp while such a process is still running.
    pub fn scratch(&self) -> Dir {
        Dir {
            path: self.base.scratch.clone(),
        }
    }
}

/// Which constructor produced a [`Tier`].
///
/// Exposed so a caller — or a gate run over a third party's install — can tell
/// a suite address from a standalone one without parsing the segment string.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TierKind {
    /// [`TieredDirs::vendor`]: `<vendor>`.
    Vendor,
    /// [`TieredDirs::suite`]: `<vendor>.<suite_key>`.
    Suite,
    /// [`TieredDirs::standalone`]: the bare tool name, no vendor.
    Standalone,
}

impl TierKind {
    /// Stable lowercase name, used by the parity fixture as the tier column.
    pub const fn as_str(self) -> &'static str {
        match self {
            TierKind::Vendor => "vendor",
            TierKind::Suite => "suite",
            TierKind::Standalone => "standalone",
        }
    }

    /// Every tier kind.
    pub const ALL: [TierKind; 3] = [TierKind::Vendor, TierKind::Suite, TierKind::Standalone];
}

/// One tier — a directory segment applied under every home.
///
/// Tiers are distinct addresses. Reading one never falls back to another.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tier<'a> {
    base: &'a BaseDirs,
    kind: TierKind,
    segment: String,
}

impl Tier<'_> {
    /// The directory segment: `<vendor>`, `<vendor>.<suite_key>`, or a
    /// standalone tool's bare name.
    pub fn segment(&self) -> &str {
        &self.segment
    }

    /// Which constructor produced this tier.
    pub fn kind(&self) -> TierKind {
        self.kind
    }

    /// This tier under one home.
    pub fn home(&self, home: Home) -> Dir {
        Dir {
            path: self.base.get(home).join(&self.segment),
        }
    }

    /// State that must survive.
    pub fn durable(&self) -> Dir {
        self.home(Home::Durable)
    }

    /// User-editable settings.
    pub fn config(&self) -> Dir {
        self.home(Home::Config)
    }

    /// Regenerable derived state. The OS may purge it.
    pub fn cache(&self) -> Dir {
        self.home(Home::Cache)
    }

    /// Log files.
    pub fn logs(&self) -> Dir {
        self.home(Home::Logs)
    }

    /// Process-lifetime state: pidfiles, sockets, locks. Never under cache.
    pub fn runtime(&self) -> Dir {
        self.home(Home::Runtime)
    }
}

/// A resolved directory. Chain [`Dir::scoped`] and [`Dir::app`] to narrow it.
///
/// A pure path value: this crate creates nothing on disk. The caller decides
/// when to `create_dir_all`.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dir {
    path: PathBuf,
}

impl Dir {
    /// The resolved path.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Consume the `Dir` for its path.
    pub fn into_path(self) -> PathBuf {
        self.path
    }

    /// Key this directory by a content root's id: `<dir>/<kind>/<key>`, e.g.
    /// `scoped("vaults", vault_id)`.
    ///
    /// Both segments are validated.
    ///
    /// # Errors
    ///
    /// [`Error::InvalidKey`] when `kind` or `key` is not a valid segment.
    pub fn scoped(&self, kind: &str, key: &str) -> Result<Dir, Error> {
        check_key("scope kind", kind)?;
        check_key("scope", key)?;
        Ok(Dir {
            path: self.path.join(kind).join(key),
        })
    }

    /// The per-app leaf: `<dir>/<app>`. Validated as a single path segment.
    ///
    /// # Errors
    ///
    /// [`Error::InvalidKey`] when `app` is not a valid segment.
    pub fn app(&self, app: &str) -> Result<Dir, Error> {
        check_key("app", app)?;
        Ok(Dir {
            path: self.path.join(app),
        })
    }
}

impl AsRef<Path> for Dir {
    fn as_ref(&self) -> &Path {
        &self.path
    }
}

impl From<Dir> for PathBuf {
    fn from(dir: Dir) -> Self {
        dir.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VENDOR: &str = "com.example";
    const ENV: EnvVars = env_vars!("EXAMPLE");

    fn dirs() -> TieredDirs {
        TieredDirs::with_base_dirs(VENDOR, BaseDirs::rooted("/stub")).unwrap()
    }

    #[test]
    fn env_vars_derives_every_name_from_the_prefix() {
        assert_eq!(
            ENV,
            EnvVars {
                root: "EXAMPLE_ROOT",
                durable: "EXAMPLE_DURABLE_DIR",
                config: "EXAMPLE_CONFIG_DIR",
                cache: "EXAMPLE_CACHE_DIR",
                logs: "EXAMPLE_LOGS_DIR",
                runtime: "EXAMPLE_RUNTIME_DIR",
                scratch: "EXAMPLE_SCRATCH_DIR",
                require_override: "EXAMPLE_REQUIRE_OVERRIDE",
            }
        );
        assert_eq!(ENV.dir(None), "EXAMPLE_SCRATCH_DIR");
        assert_eq!(ENV.dir(Some(Home::Logs)), "EXAMPLE_LOGS_DIR");
        assert!(!ENV.overrides().contains(&ENV.require_override));
    }

    #[test]
    fn the_vendor_is_validated() {
        let base = BaseDirs::rooted("/stub");
        assert_eq!(
            TieredDirs::with_base_dirs("a/b", base.clone()).unwrap_err(),
            Error::InvalidKey {
                kind: "vendor",
                key: "a/b".to_string()
            }
        );
        assert!(TieredDirs::with_base_dirs("", base).is_err());
        assert_eq!(dirs().vendor_name(), VENDOR);
    }

    #[test]
    fn suite_segment_is_composed_from_vendor() {
        let dirs = dirs();
        assert_eq!(dirs.vendor().segment(), "com.example");
        assert_eq!(dirs.suite("notes").unwrap().segment(), "com.example.notes");
    }

    #[test]
    fn every_home_resolves_under_its_own_base() {
        let dirs = dirs();
        let suite = dirs.suite("notes").unwrap();
        assert_eq!(
            suite.durable().path(),
            Path::new("/stub/durable/com.example.notes")
        );
        assert_eq!(
            suite.config().path(),
            Path::new("/stub/config/com.example.notes")
        );
        assert_eq!(
            suite.cache().path(),
            Path::new("/stub/cache/com.example.notes")
        );
        assert_eq!(
            suite.logs().path(),
            Path::new("/stub/logs/com.example.notes")
        );
        assert_eq!(
            suite.runtime().path(),
            Path::new("/stub/durable/run/com.example.notes")
        );
    }

    #[test]
    fn named_home_methods_match_the_home_enum() {
        let dirs = dirs();
        let tier = dirs.vendor();
        for (home, dir) in [
            (Home::Durable, tier.durable()),
            (Home::Config, tier.config()),
            (Home::Cache, tier.cache()),
            (Home::Logs, tier.logs()),
            (Home::Runtime, tier.runtime()),
        ] {
            assert_eq!(tier.home(home), dir, "{}", home.as_str());
        }
    }

    #[test]
    fn scoped_then_app_nests_in_order() {
        let got = dirs()
            .suite("notes")
            .unwrap()
            .cache()
            .scoped("vaults", "01HZY-abc")
            .unwrap()
            .app("search")
            .unwrap();
        assert_eq!(
            got.path(),
            Path::new("/stub/cache/com.example.notes/vaults/01HZY-abc/search")
        );
    }

    #[test]
    fn tiers_are_distinct_addresses() {
        let dirs = dirs();
        assert_ne!(
            dirs.vendor().durable(),
            dirs.suite("notes").unwrap().durable()
        );
        assert_ne!(
            dirs.suite("tool").unwrap().durable(),
            dirs.standalone("tool").unwrap().durable()
        );
    }

    #[test]
    fn a_standalone_tool_gets_no_vendor_segment() {
        // A general tool installed in someone else's repository must not
        // write under the vendor's namespace.
        let dirs = dirs();
        let tier = dirs.standalone("tool").unwrap();
        assert_eq!(tier.segment(), "tool");
        assert!(!tier.segment().contains(VENDOR));
        assert_eq!(tier.config().path(), Path::new("/stub/config/tool"));
        assert_eq!(tier.durable().path(), Path::new("/stub/durable/tool"));
        assert_eq!(tier.runtime().path(), Path::new("/stub/durable/run/tool"));
    }

    #[test]
    fn tier_kind_names_the_constructor() {
        let dirs = dirs();
        assert_eq!(dirs.vendor().kind(), TierKind::Vendor);
        assert_eq!(dirs.suite("notes").unwrap().kind(), TierKind::Suite);
        assert_eq!(
            dirs.standalone("tool").unwrap().kind(),
            TierKind::Standalone
        );
        for kind in TierKind::ALL {
            assert!(!kind.as_str().is_empty());
        }
    }

    #[test]
    fn scratch_is_the_temp_dir_and_is_not_a_tier() {
        let dirs = dirs();
        assert_eq!(dirs.scratch().path(), Path::new("/stub/scratch"));
        assert!(!dirs.scratch().path().to_string_lossy().contains(VENDOR));
        // It narrows like any other directory.
        assert_eq!(
            dirs.scratch().app("sandbox").unwrap().path(),
            Path::new("/stub/scratch/sandbox")
        );
    }

    #[test]
    fn scratch_is_not_the_runtime_home() {
        // Different lifetimes. A pidfile outlives the call and describes a
        // live process; a scratch file does not outlive the call at all.
        let base = BaseDirs::rooted("/stub");
        assert_ne!(base.scratch(), base.get(Home::Runtime));
        assert_ne!(dirs().scratch().path(), dirs().vendor().runtime().path());
    }

    #[test]
    fn keys_reject_separators_dotdot_and_empty() {
        let dirs = dirs();
        let cache = dirs.vendor().cache();
        for bad in [
            "", "..", "a/b", "a\\b", "../x", "a..b", ".hidden", "-lead", "_lead", "a b", "a:b",
        ] {
            assert!(
                cache.app(bad).is_err(),
                "expected app {bad:?} to be rejected"
            );
            assert!(
                cache.scoped("vaults", bad).is_err(),
                "expected scope key {bad:?} to be rejected"
            );
            assert!(
                cache.scoped(bad, "v7").is_err(),
                "expected scope kind {bad:?} to be rejected"
            );
            assert!(
                dirs.suite(bad).is_err(),
                "expected suite key {bad:?} to be rejected"
            );
            assert!(
                dirs.standalone(bad).is_err(),
                "expected standalone key {bad:?} to be rejected"
            );
        }
    }

    #[test]
    fn keys_accept_the_shapes_the_ts_regex_admits() {
        let cache = dirs().vendor().cache();
        for good in ["a", "0", "search-ui", "search.ui", "search_ui", "V7"] {
            assert!(
                cache.app(good).is_ok(),
                "expected app {good:?} to be accepted"
            );
        }
    }

    #[test]
    fn invalid_key_error_names_the_kind() {
        let err = dirs().vendor().cache().app("a/b").unwrap_err();
        assert_eq!(
            err,
            Error::InvalidKey {
                kind: "app",
                key: "a/b".to_string()
            }
        );
    }

    #[test]
    fn runtime_is_not_cache() {
        // Trap 2. The OS may purge cache while the process a pidfile
        // describes is still alive, so runtime falls back under durable.
        let base = BaseDirs::from_parts(
            Some(PathBuf::from("/d")),
            Some(PathBuf::from("/c")),
            Some(PathBuf::from("/cache")),
            Some(PathBuf::from("/l")),
            None,
            Some(PathBuf::from("/tmp")),
        )
        .unwrap();
        assert_eq!(base.get(Home::Runtime), Path::new("/d/run"));
        assert!(!base.get(Home::Runtime).starts_with("/cache"));

        let dirs = TieredDirs::with_base_dirs(VENDOR, base).unwrap();
        let runtime = dirs.suite("notes").unwrap().runtime();
        assert_eq!(runtime.path(), Path::new("/d/run/com.example.notes"));
        assert!(!runtime.path().starts_with("/cache"));
    }

    #[test]
    fn a_supplied_runtime_dir_wins_over_the_fallback() {
        let base = BaseDirs::from_parts(
            Some(PathBuf::from("/d")),
            Some(PathBuf::from("/c")),
            Some(PathBuf::from("/cache")),
            Some(PathBuf::from("/l")),
            Some(PathBuf::from("/run/user/501")),
            Some(PathBuf::from("/tmp")),
        )
        .unwrap();
        assert_eq!(base.get(Home::Runtime), Path::new("/run/user/501"));
    }

    #[test]
    fn a_missing_base_dir_is_an_error_not_a_panic() {
        // Trap 3. Headless CI and sandboxes do not always have a home.
        let some = |p: &str| Some(PathBuf::from(p));
        let cases: [(&str, [Option<PathBuf>; 5]); 5] = [
            (
                "durable",
                [None, some("/c"), some("/x"), some("/l"), some("/t")],
            ),
            (
                "config",
                [some("/d"), None, some("/x"), some("/l"), some("/t")],
            ),
            (
                "cache",
                [some("/d"), some("/c"), None, some("/l"), some("/t")],
            ),
            (
                "logs",
                [some("/d"), some("/c"), some("/x"), None, some("/t")],
            ),
            (
                "scratch",
                [some("/d"), some("/c"), some("/x"), some("/l"), None],
            ),
        ];
        for (home, [durable, config, cache, logs, scratch]) in cases {
            let err =
                BaseDirs::from_parts(durable, config, cache, logs, None, scratch).unwrap_err();
            assert_eq!(err, Error::MissingBaseDir { home });
        }
    }

    #[test]
    fn from_env_resolves_or_errors_without_panicking() {
        // Whichever way this machine answers, it must not unwrap.
        match BaseDirs::from_env(&ENV) {
            Ok(base) => {
                for home in Home::ALL {
                    assert!(base.get(home).is_absolute(), "{}", home.as_str());
                }
                assert!(base.scratch().is_absolute());
                // Logs never fold into cache — the OS purges cache.
                assert_ne!(base.get(Home::Logs), base.get(Home::Cache));
                assert_ne!(base.get(Home::Runtime), base.get(Home::Cache));
                // Scratch is swept; runtime describes a live process.
                assert_ne!(base.scratch(), base.get(Home::Runtime));
            }
            Err(Error::MissingBaseDir { .. }) => {}
            Err(other) => panic!("unexpected error: {other}"),
        }
    }

    /// This binary runs under cargo, so the default environment resolves
    /// every home under the scratch root, never a real one.
    #[test]
    fn a_cargo_test_binary_resolves_under_the_scratch_root() {
        if std::env::var_os(ENV.root).is_some_and(|v| !v.is_empty()) {
            return; // An explicit root wins; nothing to prove here.
        }
        let root = test_root().expect("cargo runs this test binary");
        // Unique per process, so a reused pid does not inherit old state.
        let name = root.file_name().unwrap().to_str().unwrap();
        let prefix = format!("tiered-dirs-test-{}-", std::process::id());
        assert!(
            name.len() > prefix.len() && name.starts_with(&prefix),
            "{name}"
        );
        let dirs = TieredDirs::from_env(VENDOR, &ENV).unwrap();
        for home in Home::ALL {
            assert!(dirs.base_dirs().get(home).starts_with(root), "{home:?}");
        }
        assert!(dirs.base_dirs().scratch().starts_with(root));
    }

    /// A POSIX-style absolute path made absolute on the host. On Windows a
    /// path needs a drive to be absolute, so `/d` becomes `C:/d`.
    fn abs(path: &str) -> PathBuf {
        PathBuf::from(host_value(path))
    }

    /// An override value as the host spells an absolute path: [`abs`] for a
    /// value that starts with `/`, anything else unchanged.
    fn host_value(value: &str) -> String {
        if cfg!(windows) && value.starts_with('/') {
            format!("C:{value}")
        } else {
            value.to_string()
        }
    }

    fn guarded(vars: &[(&str, &str)], test_root: Option<&str>) -> Result<BaseDirs, Error> {
        let test_root = test_root.map(abs);
        BaseDirs::from_env_guarded(
            &ENV,
            |name| {
                vars.iter()
                    .find(|(key, _)| *key == name)
                    .map(|(_, value)| OsString::from(host_value(value)))
            },
            test_root.as_deref(),
        )
    }

    #[test]
    fn the_test_root_stands_in_for_an_unset_root_var() {
        assert_eq!(
            guarded(&[], Some("/t")).unwrap(),
            BaseDirs::rooted(abs("/t"))
        );
        // A per-home override still wins over it.
        let base = guarded(&[("EXAMPLE_CACHE_DIR", "/c")], Some("/t")).unwrap();
        assert_eq!(base.get(Home::Cache), abs("/c"));
        assert_eq!(base.get(Home::Durable), abs("/t/durable"));
        // An explicit root wins over the test root, and over the guard.
        assert_eq!(
            guarded(
                &[("EXAMPLE_ROOT", "/r"), (ENV.require_override, "1")],
                Some("/t")
            )
            .unwrap(),
            BaseDirs::rooted(abs("/r")),
        );
    }

    #[test]
    fn require_override_refuses_an_os_fallback_and_names_the_fix() {
        let err = guarded(&[(ENV.require_override, "1")], None).unwrap_err();
        assert_eq!(
            err,
            Error::OverrideRequired {
                var: "EXAMPLE_DURABLE_DIR",
                root_var: "EXAMPLE_ROOT",
                require_var: "EXAMPLE_REQUIRE_OVERRIDE",
            }
        );
        assert!(err.to_string().contains("set EXAMPLE_ROOT"), "{err}");
        let partial = guarded(
            &[(ENV.require_override, "1"), ("EXAMPLE_DURABLE_DIR", "/d")],
            None,
        )
        .unwrap_err();
        assert!(
            matches!(
                partial,
                Error::OverrideRequired {
                    var: "EXAMPLE_CONFIG_DIR",
                    ..
                }
            ),
            "{partial:?}"
        );
        // Every home moved: nothing falls back, so nothing is refused.
        let all = [
            (ENV.require_override, "1"),
            ("EXAMPLE_DURABLE_DIR", "/d"),
            ("EXAMPLE_CONFIG_DIR", "/c"),
            ("EXAMPLE_CACHE_DIR", "/k"),
            ("EXAMPLE_LOGS_DIR", "/l"),
            ("EXAMPLE_SCRATCH_DIR", "/s"),
        ];
        assert_eq!(
            guarded(&all, None).unwrap().get(Home::Runtime),
            abs("/d/run")
        );
        // An empty value counts as unset.
        assert!(guarded(&[(ENV.require_override, "")], None).is_ok());
    }

    /// `from_env_with` over a fixed map, so no test touches the process env.
    fn from_vars(vars: &[(&str, &str)]) -> Result<BaseDirs, Error> {
        BaseDirs::from_env_with(&ENV, |name| {
            vars.iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| OsString::from(host_value(value)))
        })
    }

    fn all_six(base: &BaseDirs) -> [&Path; 6] {
        [
            base.get(Home::Durable),
            base.get(Home::Config),
            base.get(Home::Cache),
            base.get(Home::Logs),
            base.get(Home::Runtime),
            base.scratch(),
        ]
    }

    #[test]
    fn the_root_var_alone_moves_all_six_base_dirs() {
        let base = from_vars(&[("EXAMPLE_ROOT", "/scratch")]).unwrap();
        assert_eq!(base, BaseDirs::rooted(abs("/scratch")));
        for path in all_six(&base) {
            assert!(path.starts_with(abs("/scratch")), "{path:?}");
        }
    }

    #[test]
    fn a_home_var_beats_the_root_var_for_its_own_home_only() {
        let base = from_vars(&[("EXAMPLE_ROOT", "/r"), ("EXAMPLE_CACHE_DIR", "/warm")]).unwrap();
        assert_eq!(base.get(Home::Cache), abs("/warm"));
        assert_eq!(base.get(Home::Durable), abs("/r/durable"));
        assert_eq!(base.get(Home::Runtime), abs("/r/durable/run"));
        assert_eq!(base.scratch(), abs("/r/scratch"));
    }

    #[test]
    fn a_home_var_alone_moves_only_its_home() {
        let Ok(os) = from_vars(&[]) else { return };
        let base = from_vars(&[("EXAMPLE_SCRATCH_DIR", "/s")]).unwrap();
        assert_eq!(base.scratch(), abs("/s"));
        for home in Home::ALL {
            assert_eq!(base.get(home), os.get(home), "{}", home.as_str());
        }
    }

    #[test]
    fn runtime_follows_an_overridden_durable() {
        let Ok(_) = from_vars(&[]) else { return };
        let base = from_vars(&[("EXAMPLE_DURABLE_DIR", "/d")]).unwrap();
        assert_eq!(base.get(Home::Runtime), abs("/d/run"));
        let base = from_vars(&[("EXAMPLE_ROOT", "/r"), ("EXAMPLE_DURABLE_DIR", "/d")]).unwrap();
        assert_eq!(base.get(Home::Runtime), abs("/d/run"));
        let base = from_vars(&[
            ("EXAMPLE_DURABLE_DIR", "/d"),
            ("EXAMPLE_RUNTIME_DIR", "/rt"),
        ])
        .unwrap();
        assert_eq!(base.get(Home::Runtime), abs("/rt"));
    }

    #[test]
    #[allow(
        clippy::disallowed_methods,
        reason = "checks resolution against the OS defaults"
    )]
    fn no_override_is_the_os_default() {
        let Ok(os) = BaseDirs::from_parts(
            dirs::data_dir(),
            dirs::config_dir(),
            dirs::cache_dir(),
            env_logs_dir(),
            dirs::runtime_dir(),
            Some(std::env::temp_dir()),
        ) else {
            return;
        };
        assert_eq!(from_vars(&[]).unwrap(), os);
        // An empty value counts as unset.
        assert_eq!(from_vars(&[("EXAMPLE_ROOT", "")]).unwrap(), os);
    }

    #[test]
    fn a_relative_override_is_refused() {
        assert_eq!(
            from_vars(&[("EXAMPLE_ROOT", "scratch")]).unwrap_err(),
            Error::RelativeOverride {
                var: "EXAMPLE_ROOT"
            }
        );
        assert_eq!(
            from_vars(&[("EXAMPLE_LOGS_DIR", "logs")]).unwrap_err(),
            Error::RelativeOverride {
                var: "EXAMPLE_LOGS_DIR"
            }
        );
    }

    /// On Windows `\state` is relative to the current drive, so it is refused.
    #[cfg(windows)]
    #[test]
    fn a_path_with_no_drive_is_relative_on_windows() {
        let err = BaseDirs::from_env_with(&ENV, |name| {
            (name == "EXAMPLE_ROOT").then(|| OsString::from("\\state"))
        })
        .unwrap_err();
        assert_eq!(
            err,
            Error::RelativeOverride {
                var: "EXAMPLE_ROOT"
            }
        );
    }

    /// A UNC path is absolute on Windows, so it is accepted.
    #[cfg(windows)]
    #[test]
    fn a_unc_path_is_absolute_on_windows() {
        let base = BaseDirs::from_env_with(&ENV, |name| {
            (name == "EXAMPLE_ROOT").then(|| OsString::from(r"\\server\share\state"))
        })
        .unwrap();
        assert_eq!(base, BaseDirs::rooted(r"\\server\share\state"));
    }

    #[test]
    fn dir_converts_to_a_path() {
        let dir = dirs().vendor().durable();
        let by_ref: &Path = dir.as_ref();
        assert_eq!(by_ref, Path::new("/stub/durable/com.example"));
        let owned: PathBuf = dir.into_path();
        assert_eq!(owned, PathBuf::from("/stub/durable/com.example"));
    }

    #[test]
    fn vendor_is_a_prefix_of_a_conforming_bundle_id() {
        let dirs = dirs();
        dirs.assert_vendor_bundle_id("com.example.notes.desktop");
        assert!(dirs.is_vendor_bundle_id("com.example.tool"));
        assert!(!dirs.is_vendor_bundle_id("com.legacy.notes"));
    }

    #[test]
    fn is_valid_segment_answers_without_building_a_path() {
        assert!(is_valid_segment("search-ui"));
        assert!(!is_valid_segment("a/b"));
        assert_eq!(
            is_valid_segment("a..b"),
            dirs().vendor().cache().app("a..b").is_ok()
        );
    }
}

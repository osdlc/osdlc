//! Machine-local directories for one vendor's products, addressed on two axes.
//!
//! # Two axes, not one
//!
//! A directory is addressed by naming both axes. Neither alone is an address.
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
//! **Home — how long the state must last:** `durable`, `config`, `cache`,
//! `state`, `logs`, `runtime`.
//!
//! **Convention — which per-OS table the homes come from:**
//! [`Convention::Native`] (the default) or [`Convention::Xdg`]. They differ on
//! macOS only. CLI and developer tools use Xdg. GUI apps use Native. A caller
//! picks one through [`ResolveOptions`]. See [`Convention`].
//!
//! [`TieredDirs::scratch`] is on neither axis. See "`scratch` is not a
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
//! segment is built as `vendor + "." + suite_key`. It is not derived from a
//! bundle identifier, on purpose. Bundle identifiers carry brand and product
//! segments that change on their own schedule. `suite_key` stays a
//! caller-supplied constant.
//!
//! # A general tool supplies its own root
//!
//! The vendor and suite tiers are for a suite: products that share one owner,
//! and at the suite tier one user's data. A general tool the vendor ships into
//! other people's repositories is not in that suite. Installed in a third
//! party's checkout, `suite("tool")` would create a vendor-named directory on
//! their machine.
//!
//! [`TieredDirs::standalone`] is the tier for that tool. Its segment is the
//! bare tool name, with no vendor in it. Its config directory is
//! `~/.config/<tool>` on Linux, and on macOS under [`Convention::Xdg`]. It is
//! `~/Library/Application Support/<tool>` on macOS under
//! [`Convention::Native`].
//!
//! [`Tier::kind`] reports which constructor produced a tier, so a caller or a
//! check can tell a suite address from a standalone one without parsing the
//! segment.
//!
//! # The product tier
//!
//! The product tier is one product's own directory, keyed by its bundle
//! identifier. An app framework such as Tauri usually resolves it, so this
//! crate takes no framework dependency and leaves that tier to a thin layer
//! above it. Such a layer can use [`TieredDirs::is_vendor_bundle_id`] to check
//! that the product's bundle identifier starts with the vendor.
//!
//! # `scratch` is not a home
//!
//! [`TieredDirs::scratch`] returns the platform temp directory. It wraps
//! `std::env::temp_dir()` and adds nothing to it. It exists so that "no direct
//! OS path call outside this crate" can be checked with a search, with no
//! exception.
//!
//! It has no tier, and it is not [`Home::Runtime`]. Scratch holds state that
//! does not outlive a single call, such as a temp file a command writes and
//! removes. Runtime holds state that outlives the call and describes a live
//! process: a pidfile, a socket, a lock. A pidfile in scratch can be deleted
//! when the OS clears temp while its process still runs. A scratch file in
//! runtime is never cleaned up at all.
//!
//! # Tiers are distinct addresses. There is no merge.
//!
//! `vendor().durable()` and `suite(k).durable()` are different locations.
//! This crate never reads both and merges them. A given piece of state lives
//! at exactly one tier and the caller names the tier it means.
//!
//! # Three problems this crate handles
//!
//! 1. `logs` has no `dirs` equivalent. macOS uses `~/Library/Logs`.
//!    [`BaseDirs::from_env`] branches on the platform explicitly. Putting logs
//!    under cache would be wrong without any error, because the OS purges
//!    cache.
//! 2. Only `XDG_RUNTIME_DIR` names a runtime directory, and it is usually set
//!    on Linux only. Where it is absent, runtime resolves under
//!    `<durable>/run`, not under cache. The OS may purge cache while the
//!    process a pidfile describes is still alive.
//! 3. Every base directory can fail. Headless CI and sandboxes do not always
//!    have a home directory. Nothing here unwraps. A missing base directory is
//!    [`Error::MissingBaseDir`].
//!
//! # Testability
//!
//! Base directories are resolved once, at construction, and can be injected.
//! Nothing below [`BaseDirs`] reads the environment, so a test checks exact
//! paths without touching a real home directory. The parity fixture uses
//! [`BaseDirs::rooted`]. [`BaseDirs::xdg`] builds the XDG layout under any
//! home. [`BaseDirs::from_env_with`] takes the override variables from a
//! test's own map.
//!
//! # Overrides and scratch roots
//!
//! Every base directory can be moved by environment variable, so a test or
//! harness can run a whole app inside one scratch root. The caller names the
//! variables with [`EnvVars`], through [`env_vars!`] and one shared prefix:
//! `env_vars!("MYAPP")` reads `MYAPP_ROOT`, `MYAPP_<HOME>_DIR`,
//! `MYAPP_SCRATCH_DIR`, `MYAPP_REQUIRE_OVERRIDE` and `MYAPP_CONVENTION`.
//!
//! For each base directory, the first source that is set wins: the per-home
//! variable, then the root variable laid out as [`BaseDirs::rooted`], then the
//! OS default for the convention. `<P>_CONVENTION` picks that convention over
//! the caller's. See [`BaseDirs::from_env`]. The TypeScript package's
//! `systemBaseDirs` resolves in the same order. The `env_cases` in the parity
//! fixture check that.
//!
//! # Tests never resolve a real home
//!
//! [`BaseDirs::from_env`], and so [`TieredDirs::from_env`], apply two rules
//! before that order:
//!
//! - **A cargo test binary defaults to a scratch root.** When the root
//!   variable is unset in a test binary that cargo or nextest runs, it reads
//!   as [`test_root`]: `<temp>/tiered-dirs-test-<pid>-<start nanos>`, unique
//!   per process. Plain `cargo test` needs no setup, and a killed run leaves
//!   its files in temp, not in the real homes. A test binary run directly,
//!   as an IDE debugger does, has no `CARGO` set and gets none. A caller
//!   that wants the OS defaults even under cargo turns this rule off with
//!   [`ResolveOptions::with_test_root`].
//! - **[`EnvVars::require_override`] turns the OS fallback into an error.** A
//!   test runner sets it. Child processes inherit it, so a binary a test
//!   spawns without a scratch root fails loudly instead of writing to the
//!   real home.
//!
//! [`BaseDirs::from_env_with`] and [`TieredDirs::from_env_with`] apply
//! neither rule. A test that means to read the OS defaults calls one of them.
//!
//! # Windows
//!
//! An override variable must hold an absolute path. On Windows that means a
//! drive or a UNC prefix: `C:\state` or `\\server\share\state`. A path such as
//! `\state` is relative to the current drive, so it is refused like any other
//! relative path.
//!
//! # The TypeScript package
//!
//! A TypeScript version is published as `@osdlc/tiered-dirs` on npm.
//! Both are checked against `tests/fixtures/parity.json`. The two must give
//! the same path for a given (tier, home, scope, app). Otherwise a Rust
//! program and a TypeScript program would put the same state in different
//! places. Neither package may add a path shape the other lacks.
//!
//! # Stability
//!
//! Each public item's docs say "stable in 0.x": a breaking change to it ships
//! only in a new 0.x minor release, with a CHANGELOG entry. [`Error`],
//! [`Convention`] and [`TierKind`] are `#[non_exhaustive]`, so a later release
//! can add a variant without a breaking change. [`EnvVars`] and
//! [`ResolveOptions`] are too, so a later release can add a field. [`Home`]
//! is exhaustive: adding a home changes every caller's layout, so it is a
//! breaking (0.x minor) release.

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
/// fields are public for reading. The struct is `#[non_exhaustive]`, so a
/// later release can add a variable without a breaking change.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
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
    /// Moves the state home.
    pub state: &'static str,
    /// Moves the logs home.
    pub logs: &'static str,
    /// Moves the runtime home.
    pub runtime: &'static str,
    /// Moves the scratch root.
    pub scratch: &'static str,
    /// When set (non-empty), [`BaseDirs::from_env`] errors instead of falling
    /// back to an OS home.
    pub require_override: &'static str,
    /// Picks the [`Convention`], over the one the caller passed: `native` or
    /// `xdg`. Moves no directory itself.
    pub convention: &'static str,
}

/// [`EnvVars`] named from one prefix: `<P>_ROOT`, `<P>_DURABLE_DIR`,
/// `<P>_CONFIG_DIR`, `<P>_CACHE_DIR`, `<P>_STATE_DIR`, `<P>_LOGS_DIR`,
/// `<P>_RUNTIME_DIR`, `<P>_SCRATCH_DIR`, `<P>_REQUIRE_OVERRIDE` and
/// `<P>_CONVENTION`.
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
        $crate::EnvVars::__from_names(
            ::core::concat!($prefix, "_ROOT"),
            ::core::concat!($prefix, "_DURABLE_DIR"),
            ::core::concat!($prefix, "_CONFIG_DIR"),
            ::core::concat!($prefix, "_CACHE_DIR"),
            ::core::concat!($prefix, "_STATE_DIR"),
            ::core::concat!($prefix, "_LOGS_DIR"),
            ::core::concat!($prefix, "_RUNTIME_DIR"),
            ::core::concat!($prefix, "_SCRATCH_DIR"),
            ::core::concat!($prefix, "_REQUIRE_OVERRIDE"),
            ::core::concat!($prefix, "_CONVENTION"),
        )
    };
}

impl EnvVars {
    /// What [`env_vars!`] expands to. Not public API: use the macro.
    #[doc(hidden)]
    #[allow(
        clippy::too_many_arguments,
        reason = "one name per field, in field order"
    )]
    pub const fn __from_names(
        root: &'static str,
        durable: &'static str,
        config: &'static str,
        cache: &'static str,
        state: &'static str,
        logs: &'static str,
        runtime: &'static str,
        scratch: &'static str,
        require_override: &'static str,
        convention: &'static str,
    ) -> Self {
        Self {
            root,
            durable,
            config,
            cache,
            state,
            logs,
            runtime,
            scratch,
            require_override,
            convention,
        }
    }

    /// The variable that moves one base directory: a [`Home`]'s, or scratch's
    /// for `None` (scratch is not a home).
    pub const fn dir(&self, home: Option<Home>) -> &'static str {
        match home {
            Some(Home::Durable) => self.durable,
            Some(Home::Config) => self.config,
            Some(Home::Cache) => self.cache,
            Some(Home::State) => self.state,
            Some(Home::Logs) => self.logs,
            Some(Home::Runtime) => self.runtime,
            None => self.scratch,
        }
    }

    /// Every variable that moves a base directory: the root, then the
    /// per-directory names. Excludes [`EnvVars::require_override`] and
    /// [`EnvVars::convention`], which move nothing.
    pub fn overrides(&self) -> impl Iterator<Item = &'static str> + use<> {
        [
            self.root,
            self.durable,
            self.config,
            self.cache,
            self.state,
            self.logs,
            self.runtime,
            self.scratch,
        ]
        .into_iter()
    }

    /// Whether `var` sets any of [`EnvVars::overrides`] to a non-empty value.
    pub fn is_overridden(&self, var: impl Fn(&str) -> Option<OsString>) -> bool {
        self.overrides()
            .any(|name| var(name).is_some_and(|value| !value.is_empty()))
    }
}

/// Whether a bundle identifier starts with `vendor`: a bare prefix test,
/// matching the TypeScript package's `isVendorBundleId`. It is deliberately no
/// stricter. A dot-boundary rule would make the two packages disagree about
/// which apps conform.
///
/// **Stability:** stable in 0.x.
pub fn is_vendor_bundle_id(vendor: &str, bundle_id: &str) -> bool {
    bundle_id.starts_with(vendor)
}

/// Debug-only [`is_vendor_bundle_id`] check, for a caller with no
/// `TieredDirs`. It reports apps that do not conform but cannot break a
/// release build.
///
/// **Stability:** stable in 0.x.
pub fn assert_vendor_bundle_id(vendor: &str, bundle_id: &str) {
    debug_assert!(
        is_vendor_bundle_id(vendor, bundle_id),
        "bundle identifier {bundle_id:?} does not start with {vendor:?}",
    );
}

/// Directory name that holds runtime state where the platform offers no
/// runtime directory of its own (problem 2 in the crate docs).
const RUNTIME_FALLBACK_SEGMENT: &str = "run";

/// Folders this crate places directly under another home's base on some OS:
/// state under cache and logs under durable on Windows, and runtime under
/// durable wherever the platform has no runtime directory. A tier segment
/// with one of these names would land on that home's root, so
/// [`is_valid_segment`] refuses them in any letter case.
const RESERVED_SEGMENTS: [&str; 3] = ["state", "logs", RUNTIME_FALLBACK_SEGMENT];

/// Everything this crate can fail with.
///
/// New variants may be added in any release, so a `match` needs a wildcard
/// arm.
///
/// **Stability:** stable in 0.x. A change to the five variants or their fields
/// ships only in a new 0.x minor release. New variants may be added in any
/// release.
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

    /// An override variable holds a relative path. It is refused, not resolved
    /// against the working directory or ignored. Either would put state
    /// somewhere the caller did not name.
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

    /// [`EnvVars::convention`] holds something other than `native` or `xdg`,
    /// or [`Convention`]'s `FromStr` got one. The variable is trimmed, then
    /// must match exactly, in lower case.
    #[error("{var} must be \"native\" or \"xdg\", got {value:?}")]
    InvalidConvention {
        /// [`EnvVars::convention`], or `convention` from
        /// [`Convention::from_str`](std::str::FromStr::from_str).
        var: &'static str,
        /// The value as given.
        value: String,
    },

    /// A caller-supplied segment is not a safe single path segment, or is
    /// one of the reserved names `state`, `logs` and `run`.
    #[error(
        "invalid {kind} key {key:?}: want a leading letter/digit then ._-, \
         no path separator or \"..\", and not state, logs or run"
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
/// `state`, `logs` and `run` are refused in any letter case. This crate puts
/// those folders under another home's base on some OS (state beside the cache
/// folders on Windows, for one), so a tier named after one would land on that
/// home's root. Windows and macOS paths ignore case, so `State` is refused too.
///
/// Matches the TypeScript package's `isValidSegment`.
/// [`TieredDirs::with_base_dirs`], [`TieredDirs::suite`], [`Dir::scoped`] and
/// [`Dir::app`] apply it themselves. This function is for callers that want
/// the check without building a path.
///
/// **Stability:** stable in 0.x.
pub fn is_valid_segment(key: &str) -> bool {
    if key.is_empty() {
        return false;
    }
    if key.contains('/') || key.contains('\\') || key.contains("..") {
        return false;
    }
    if RESERVED_SEGMENTS
        .iter()
        .any(|reserved| key.eq_ignore_ascii_case(reserved))
    {
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

/// How long a piece of state must last.
///
/// Separate from the tier axis. Every tier has every home.
///
/// **Stability:** stable in 0.x. Exhaustive on purpose: a new home changes
/// every caller's layout, so adding one is a breaking (0.x minor) release.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Home {
    /// State that must survive: registries, minted ids, user content.
    Durable,
    /// User-editable settings.
    Config,
    /// Regenerable derived state. The OS may purge it at any time.
    Cache,
    /// State that should outlive a restart but is not user data: history,
    /// recent files, trust markers.
    State,
    /// Log files. Never under cache, because purging logs loses the evidence.
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
            Home::State => "state",
            Home::Logs => "logs",
            Home::Runtime => "runtime",
        }
    }

    /// Every home.
    pub const ALL: [Home; 6] = [
        Home::Durable,
        Home::Config,
        Home::Cache,
        Home::State,
        Home::Logs,
        Home::Runtime,
    ];
}

/// Which per-OS table the homes come from when no override moves them.
///
/// The two differ on macOS only:
///
/// | home    | Native (macOS)                       | Xdg (macOS)                               |
/// |---------|--------------------------------------|-------------------------------------------|
/// | durable | `~/Library/Application Support`      | `$XDG_DATA_HOME`, else `~/.local/share`   |
/// | config  | `~/Library/Application Support`      | `$XDG_CONFIG_HOME`, else `~/.config`      |
/// | cache   | `~/Library/Caches`                   | `$XDG_CACHE_HOME`, else `~/.cache`        |
/// | state   | `~/Library/Application Support`      | `$XDG_STATE_HOME`, else `~/.local/state`  |
/// | logs    | `~/Library/Logs`                     | `$XDG_STATE_HOME`, else `~/.local/state`  |
/// | runtime | `~/Library/Application Support/run`  | `$XDG_RUNTIME_DIR`, else `<durable>/run`  |
///
/// Linux uses the XDG table under both. Windows uses its Known Folders under
/// both, so Xdg means Native there. A CLI or developer tool uses `Xdg`, where
/// its users look for dotfiles. A GUI app uses `Native`.
///
/// [`EnvVars::convention`] picks one over the caller's choice, which is
/// [`ResolveOptions::convention`].
///
/// **Stability:** stable in 0.x. New variants may be added.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum Convention {
    /// The platform's own locations. The default.
    #[default]
    Native,
    /// The XDG Base Directory rules, on macOS as on Linux.
    Xdg,
}

impl Convention {
    /// Every convention, the default first.
    pub const ALL: &'static [Convention] = &[Convention::Native, Convention::Xdg];

    /// The name [`EnvVars::convention`] takes: `native` or `xdg`.
    pub const fn as_str(self) -> &'static str {
        match self {
            Convention::Native => "native",
            Convention::Xdg => "xdg",
        }
    }
}

/// Parses [`Convention::as_str`]: exactly `native` or `xdg`, in lower case,
/// untrimmed.
impl std::str::FromStr for Convention {
    type Err = Error;

    /// # Errors
    ///
    /// [`Error::InvalidConvention`] with `var` set to `"convention"`.
    fn from_str(value: &str) -> Result<Self, Error> {
        Convention::ALL
            .iter()
            .copied()
            .find(|convention| convention.as_str() == value)
            .ok_or_else(|| Error::InvalidConvention {
                var: "convention",
                value: value.to_string(),
            })
    }
}

/// How [`BaseDirs::from_env`] and [`TieredDirs::from_env`] resolve, and their
/// `_with` forms.
///
/// One value holds every option, so a new option is a new field here rather
/// than a new constructor. Build it with [`ResolveOptions::new`] or `default()`, then
/// the `with_*` setters:
///
/// ```
/// use tiered_dirs::{Convention, ResolveOptions};
///
/// const CLI: ResolveOptions = ResolveOptions::new().with_convention(Convention::Xdg);
/// assert_eq!(CLI.convention, Convention::Xdg);
/// assert!(CLI.test_root);
/// assert_eq!(ResolveOptions::default(), ResolveOptions::new());
/// ```
///
/// **Stability:** stable in 0.x. `#[non_exhaustive]`, so a later release can
/// add a field without a breaking change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub struct ResolveOptions {
    /// The per-OS table for the OS defaults. [`EnvVars::convention`] overrides
    /// it when set.
    pub convention: Convention,
    /// Whether [`BaseDirs::from_env`] and [`TieredDirs::from_env`] read an
    /// unset root variable as [`test_root`] in a cargo test binary. On by
    /// default. When off, they resolve as they would outside cargo.
    /// [`EnvVars::root`] and [`EnvVars::require_override`] still apply.
    pub test_root: bool,
}

impl ResolveOptions {
    /// The defaults: [`Convention::Native`], with test-root detection on.
    pub const fn new() -> Self {
        Self {
            convention: Convention::Native,
            test_root: true,
        }
    }

    /// These options with `convention`.
    #[must_use]
    pub const fn with_convention(mut self, convention: Convention) -> Self {
        self.convention = convention;
        self
    }

    /// These options with test-root detection on or off. See
    /// [`ResolveOptions::test_root`].
    #[must_use]
    pub const fn with_test_root(mut self, on: bool) -> Self {
        self.test_root = on;
        self
    }
}

/// [`ResolveOptions::new`].
impl Default for ResolveOptions {
    fn default() -> Self {
        Self::new()
    }
}

/// The platform base directories, resolved once: the six homes plus
/// `scratch`.
///
/// Construct with [`BaseDirs::from_env`] in production and
/// [`BaseDirs::rooted`], [`BaseDirs::xdg`] or [`BaseDirs::from_env_with`] in
/// tests. Once built, nothing in this crate reads the environment again. Path
/// resolution below this type is pure.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BaseDirs {
    durable: PathBuf,
    config: PathBuf,
    cache: PathBuf,
    state: PathBuf,
    logs: PathBuf,
    runtime: PathBuf,
    scratch: PathBuf,
}

impl BaseDirs {
    /// Resolve from the environment and the platform, once.
    ///
    /// Each base directory takes the first value set, in this order:
    ///
    /// 1. Its own variable: [`EnvVars::dir`].
    /// 2. [`EnvVars::root`], with the [`BaseDirs::rooted`] layout.
    /// 3. The OS default for the convention. [`EnvVars::convention`] picks
    ///    it when set, else [`ResolveOptions::convention`].
    ///
    /// | home    | Linux, and macOS under Xdg | macOS under Native | Windows |
    /// |---------|----------------------------|--------------------|---------|
    /// | durable | `$XDG_DATA_HOME`, else `~/.local/share` | `~/Library/Application Support` | `%APPDATA%` |
    /// | config  | `$XDG_CONFIG_HOME`, else `~/.config` | `~/Library/Application Support` | `%APPDATA%` |
    /// | cache   | `$XDG_CACHE_HOME`, else `~/.cache` | `~/Library/Caches` | `%LOCALAPPDATA%` |
    /// | state   | `$XDG_STATE_HOME`, else `~/.local/state` | `~/Library/Application Support` | `%LOCALAPPDATA%\state` |
    /// | logs    | `$XDG_STATE_HOME`, else `~/.local/state` | `~/Library/Logs` | `%APPDATA%\logs` |
    /// | runtime | `$XDG_RUNTIME_DIR`, else `<durable>/run` | `<durable>/run` | `<durable>/run` |
    /// | scratch | `std::env::temp_dir()` | the same | the same |
    ///
    /// The `XDG_*` variables are read through the same environment as the
    /// override variables. A relative `XDG_*` value is ignored, as the XDG
    /// spec says. The macOS Native and Windows cells come from `dirs`.
    ///
    /// Runtime follows durable: when the runtime variable is unset but durable
    /// is moved by step 1 or 2, runtime is `<durable>/run`, never the OS
    /// runtime directory. An empty variable counts as unset.
    ///
    /// Two test rules run first (see "Tests never resolve a real home" in the
    /// crate docs). In a cargo test binary an unset root variable reads as
    /// [`test_root`], unless [`ResolveOptions::test_root`] is off. With
    /// [`EnvVars::require_override`] set, an OS fallback is
    /// [`Error::OverrideRequired`].
    ///
    /// A later option goes on [`ResolveOptions`], not on a new constructor.
    ///
    /// # Errors
    ///
    /// [`Error::RelativeOverride`] when a variable holds a relative path,
    /// [`Error::InvalidConvention`] when [`EnvVars::convention`] names no
    /// convention, [`Error::OverrideRequired`] when
    /// [`EnvVars::require_override`] is set and a base directory would fall
    /// back to the OS default, and [`Error::MissingBaseDir`] when the platform
    /// has no such directory.
    pub fn from_env(vars: &EnvVars, opts: ResolveOptions) -> Result<Self, Error> {
        Self::from_env_guarded(vars, opts, |name| std::env::var_os(name), test_root())
    }

    /// [`BaseDirs::from_env`] with the environment and the test root
    /// injected, so the test rules are testable without the process env.
    fn from_env_guarded(
        vars: &EnvVars,
        opts: ResolveOptions,
        var: impl Fn(&str) -> Option<OsString>,
        test_root: Option<&Path>,
    ) -> Result<Self, Error> {
        let var = |name: &str| var(name).filter(|value| !value.is_empty());
        if var(vars.root).is_some() {
            return Self::from_env_with(vars, opts, var);
        }
        if let Some(root) = test_root.filter(|_| opts.test_root) {
            return Self::from_env_with(vars, opts, |name| {
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
                vars.state,
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
        Self::from_env_with(vars, opts, var)
    }

    /// [`BaseDirs::from_env`] with every variable read through `var`
    /// instead of the process environment: the override variables, the
    /// convention variable and `XDG_*`. The home directory and the macOS
    /// Native and Windows cells still come from the platform. A test uses this
    /// to try every precedence case without changing the process env. It
    /// applies neither test rule, so [`ResolveOptions::test_root`] has no
    /// effect here.
    ///
    /// # Errors
    ///
    /// [`Error::RelativeOverride`] when a variable holds a relative path,
    /// [`Error::InvalidConvention`] when [`EnvVars::convention`] names no
    /// convention, and [`Error::MissingBaseDir`] when the platform has no such
    /// directory.
    pub fn from_env_with(
        vars: &EnvVars,
        opts: ResolveOptions,
        var: impl Fn(&str) -> Option<OsString>,
    ) -> Result<Self, Error> {
        let var = |name: &str| var(name).filter(|value| !value.is_empty());
        let convention = env_convention(vars, var)?.unwrap_or(opts.convention);
        let read = |name: &'static str| -> Result<Option<PathBuf>, Error> {
            match var(name) {
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
        let os = os_defaults(convention, var);

        let durable = read(vars.durable)?.or_else(|| from_root(|r| &r.durable));
        let durable_moved = durable.is_some();
        let durable = durable.or(os.durable);
        let config = read(vars.config)?
            .or_else(|| from_root(|r| &r.config))
            .or(os.config);
        let cache = read(vars.cache)?
            .or_else(|| from_root(|r| &r.cache))
            .or(os.cache);
        let state = read(vars.state)?
            .or_else(|| from_root(|r| &r.state))
            .or(os.state);
        let logs = read(vars.logs)?
            .or_else(|| from_root(|r| &r.logs))
            .or(os.logs);
        // `None` makes `from_parts` fall back to `<durable>/run`.
        let runtime = match read(vars.runtime)? {
            Some(runtime) => Some(runtime),
            None if durable_moved => None,
            None => os.runtime,
        };
        let scratch = read(vars.scratch)?
            .or_else(|| from_root(|r| &r.scratch))
            .or_else(|| Some(std::env::temp_dir()));
        Self::from_parts(durable, config, cache, state, logs, runtime, scratch)
    }

    /// Assemble from raw optional roots, exactly as `dirs` returns them.
    ///
    /// A `None` runtime is not an error. It resolves to `<durable>/run`
    /// (problem 2 in the crate docs). Every other `None` is an
    /// [`Error::MissingBaseDir`] (problem 3). A test uses this to simulate a
    /// machine with no home directory.
    ///
    /// # Errors
    ///
    /// [`Error::MissingBaseDir`] for the first of durable, config, cache,
    /// state, logs and scratch that is `None`.
    pub(crate) fn from_parts(
        durable: Option<PathBuf>,
        config: Option<PathBuf>,
        cache: Option<PathBuf>,
        state: Option<PathBuf>,
        logs: Option<PathBuf>,
        runtime: Option<PathBuf>,
        scratch: Option<PathBuf>,
    ) -> Result<Self, Error> {
        let durable = durable.ok_or(Error::MissingBaseDir { home: "durable" })?;
        let config = config.ok_or(Error::MissingBaseDir { home: "config" })?;
        let cache = cache.ok_or(Error::MissingBaseDir { home: "cache" })?;
        let state = state.ok_or(Error::MissingBaseDir { home: "state" })?;
        let logs = logs.ok_or(Error::MissingBaseDir { home: "logs" })?;
        let scratch = scratch.ok_or(Error::MissingBaseDir { home: "scratch" })?;
        let runtime = runtime.unwrap_or_else(|| durable.join(RUNTIME_FALLBACK_SEGMENT));
        Ok(Self {
            durable,
            config,
            cache,
            state,
            logs,
            runtime,
            scratch,
        })
    }

    /// Every base directory under one stub root: `<root>/durable`,
    /// `<root>/config`, `<root>/cache`, `<root>/state`, `<root>/logs`,
    /// `<root>/scratch`, and runtime at `<root>/durable/run`.
    ///
    /// The layout [`EnvVars::root`] selects. Tests and the parity fixture use
    /// it. The TypeScript package has the same helper with the same layout, so
    /// a fixture row checks identical absolute paths in both languages.
    pub fn rooted(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref();
        let durable = root.join("durable");
        let runtime = durable.join(RUNTIME_FALLBACK_SEGMENT);
        Self {
            durable,
            config: root.join("config"),
            cache: root.join("cache"),
            state: root.join("state"),
            logs: root.join("logs"),
            runtime,
            scratch: root.join("scratch"),
        }
    }

    /// The XDG layout under `home`, with the `XDG_*` variables read through
    /// `var`: the [`Convention::Xdg`] table, on any OS. Scratch is
    /// `std::env::temp_dir()`.
    ///
    /// Each home is its `XDG_*` variable when that holds an absolute path,
    /// else its default under `home`. A relative value is ignored, as the XDG
    /// spec says. Logs share the state home. Runtime is `$XDG_RUNTIME_DIR`,
    /// else `<durable>/run`. The TypeScript package's `xdgBaseDirs` builds the
    /// same layout. The parity fixture's `convention_cases` check that.
    pub fn xdg(home: impl AsRef<Path>, var: impl Fn(&str) -> Option<OsString>) -> Self {
        let home = home.as_ref();
        let under = |segments: &[&str]| segments.iter().fold(home.to_path_buf(), |p, s| p.join(s));
        let durable = xdg_var(&var, "XDG_DATA_HOME").unwrap_or_else(|| under(&[".local", "share"]));
        let state = xdg_var(&var, "XDG_STATE_HOME").unwrap_or_else(|| under(&[".local", "state"]));
        Self {
            config: xdg_var(&var, "XDG_CONFIG_HOME").unwrap_or_else(|| under(&[".config"])),
            cache: xdg_var(&var, "XDG_CACHE_HOME").unwrap_or_else(|| under(&[".cache"])),
            logs: state.clone(),
            state,
            runtime: xdg_var(&var, "XDG_RUNTIME_DIR")
                .unwrap_or_else(|| durable.join(RUNTIME_FALLBACK_SEGMENT)),
            durable,
            scratch: std::env::temp_dir(),
        }
    }

    /// The base directory for one home.
    pub fn get(&self, home: Home) -> &Path {
        match home {
            Home::Durable => &self.durable,
            Home::Config => &self.config,
            Home::Cache => &self.cache,
            Home::State => &self.state,
            Home::Logs => &self.logs,
            Home::Runtime => &self.runtime,
        }
    }

    /// The platform temp directory. Not reachable through [`BaseDirs::get`],
    /// on purpose. Scratch is not a [`Home`], because nothing in it outlives
    /// the call that wrote it.
    pub fn scratch(&self) -> &Path {
        &self.scratch
    }
}

/// [`EnvVars::convention`], parsed: trimmed, then `native` or `xdg` exactly.
/// `None` when unset or empty.
fn env_convention(
    vars: &EnvVars,
    var: impl Fn(&str) -> Option<OsString>,
) -> Result<Option<Convention>, Error> {
    let Some(value) = var(vars.convention) else {
        return Ok(None);
    };
    value
        .to_str()
        .and_then(|value| value.trim().parse().ok())
        .map(Some)
        .ok_or_else(|| Error::InvalidConvention {
            var: vars.convention,
            value: value.to_string_lossy().into_owned(),
        })
}

/// An `XDG_*` variable, honoured only when it holds an absolute path.
fn xdg_var(var: impl Fn(&str) -> Option<OsString>, name: &str) -> Option<PathBuf> {
    var(name)
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
}

/// The OS defaults for one convention, before any override. A `None` is a
/// base directory this machine lacks; for runtime it means `<durable>/run`.
struct OsDefaults {
    durable: Option<PathBuf>,
    config: Option<PathBuf>,
    cache: Option<PathBuf>,
    state: Option<PathBuf>,
    logs: Option<PathBuf>,
    runtime: Option<PathBuf>,
}

impl From<BaseDirs> for OsDefaults {
    fn from(base: BaseDirs) -> Self {
        Self {
            durable: Some(base.durable),
            config: Some(base.config),
            cache: Some(base.cache),
            state: Some(base.state),
            logs: Some(base.logs),
            runtime: Some(base.runtime),
        }
    }
}

/// The XDG table under the platform's home directory. With no home, only the
/// `XDG_*` variables that hold absolute paths give directories.
#[cfg(not(windows))]
#[allow(
    clippy::disallowed_methods,
    reason = "this is the one place that resolves platform base directories"
)]
fn xdg_defaults(var: impl Fn(&str) -> Option<OsString>) -> OsDefaults {
    if let Some(home) = dirs::home_dir() {
        return BaseDirs::xdg(home, var).into();
    }
    let state = xdg_var(&var, "XDG_STATE_HOME");
    OsDefaults {
        durable: xdg_var(&var, "XDG_DATA_HOME"),
        config: xdg_var(&var, "XDG_CONFIG_HOME"),
        cache: xdg_var(&var, "XDG_CACHE_HOME"),
        logs: state.clone(),
        state,
        runtime: xdg_var(&var, "XDG_RUNTIME_DIR"),
    }
}

/// macOS: Native is Apple's locations, with logs in `~/Library/Logs`, which
/// `dirs` has no accessor for (problem 1 in the crate docs). Xdg is the XDG
/// table.
#[cfg(target_os = "macos")]
#[allow(
    clippy::disallowed_methods,
    reason = "this is the one place that resolves platform base directories"
)]
fn os_defaults(convention: Convention, var: impl Fn(&str) -> Option<OsString>) -> OsDefaults {
    match convention {
        Convention::Native => OsDefaults {
            durable: dirs::data_dir(),
            config: dirs::config_dir(),
            cache: dirs::cache_dir(),
            state: dirs::data_dir(),
            logs: dirs::home_dir().map(|home| home.join("Library").join("Logs")),
            runtime: None,
        },
        Convention::Xdg => xdg_defaults(var),
    }
}

/// Windows: the Known Folders under both conventions. Xdg means Native here.
///
/// Logs go to `<durable>/logs`, not under `%LOCALAPPDATA%`. That is the same
/// root as cache, which the OS purges (problem 1 in the crate docs). State goes
/// to `%LOCALAPPDATA%\state`. It is machine-local, so it need not roam. That
/// puts it beside each tier's cache folder under the same root, never the same
/// folder. [`is_valid_segment`] refuses `state`, `logs` and `run` as segments,
/// so no tier folder can be another home's root.
#[cfg(windows)]
#[allow(
    clippy::disallowed_methods,
    reason = "this is the one place that resolves platform base directories"
)]
fn os_defaults(_convention: Convention, _var: impl Fn(&str) -> Option<OsString>) -> OsDefaults {
    OsDefaults {
        durable: dirs::data_dir(),
        config: dirs::config_dir(),
        cache: dirs::cache_dir(),
        state: dirs::data_local_dir().map(|local| local.join("state")),
        logs: dirs::data_dir().map(|data| data.join("logs")),
        runtime: None,
    }
}

/// Linux and other Unix systems: the XDG table under both conventions.
#[cfg(not(any(windows, target_os = "macos")))]
fn os_defaults(_convention: Convention, var: impl Fn(&str) -> Option<OsString>) -> OsDefaults {
    xdg_defaults(var)
}

/// `<temp>/tiered-dirs-test-<pid>-<start nanos>` when this process is a test
/// binary that cargo or nextest runs, else `None`. Resolved once per process.
///
/// A test binary lives in `<target>/<profile>/deps/` and runs with `CARGO` (or
/// `NEXTEST`) set. Requiring both keeps an installed app, or a `cargo run`
/// binary in `<target>/<profile>/`, on the real homes. A doctest binary lives
/// in a rustdoc temp dir and gets no default. [`EnvVars::require_override`]
/// catches it when a test runner sets that variable.
///
/// The start time stops a later process with the same pid from using this
/// one's leftover files. Callers that read the environment themselves, such as a
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

/// The entry point. Holds the vendor and the resolved base directories, and
/// returns tiers.
///
/// **Stability:** stable in 0.x.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TieredDirs {
    vendor: String,
    base: BaseDirs,
}

impl TieredDirs {
    /// Resolve the platform base directories once with
    /// [`BaseDirs::from_env`], reading the override variables `vars` names
    /// and resolving with `opts`, and build a `TieredDirs` for `vendor`.
    ///
    /// `vendor` is validated as a single path segment, e.g. `com.example`.
    ///
    /// # Errors
    ///
    /// The errors of [`BaseDirs::from_env`], and [`Error::InvalidKey`] when
    /// `vendor` is not a valid segment.
    pub fn from_env(vendor: &str, vars: &EnvVars, opts: ResolveOptions) -> Result<Self, Error> {
        Self::with_base_dirs(vendor, BaseDirs::from_env(vars, opts)?)
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
        opts: ResolveOptions,
        var: impl Fn(&str) -> Option<OsString>,
    ) -> Result<Self, Error> {
        Self::with_base_dirs(vendor, BaseDirs::from_env_with(vars, opts, var)?)
    }

    /// Build from injected base directories. Tests use this constructor.
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
    /// `suite_key` is validated as a single path segment. It is a
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

    /// The standalone tier: the bare `tool` name, with no vendor segment.
    ///
    /// For a general tool the vendor ships into other people's repositories.
    /// It is not part of the vendor's suite, so it must not write under the
    /// vendor's directory. Its config directory is `<config>/<tool>`:
    /// `~/.config/<tool>` on Linux and under [`Convention::Xdg`] on macOS, and
    /// `~/Library/Application Support/<tool>` under [`Convention::Native`] on
    /// macOS.
    ///
    /// `tool` is validated as a single path segment. Use
    /// [`TieredDirs::suite`] for anything that ships as part of the suite. The
    /// two are different addresses and nothing merges them.
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

    /// Whether a bundle identifier starts with this vendor.
    ///
    /// A bare prefix test, matching the TypeScript package's
    /// `isVendorBundleId`. It is deliberately no stricter. A dot-boundary rule
    /// would make the two packages disagree about which apps conform.
    pub fn is_vendor_bundle_id(&self, bundle_id: &str) -> bool {
        is_vendor_bundle_id(&self.vendor, bundle_id)
    }

    /// Debug-only check that a bundle identifier starts with this vendor.
    ///
    /// It cannot break a release build. An app still on a legacy prefix fails
    /// it in debug builds, which shows the app does not conform yet.
    ///
    /// TS has no debug assertion, so the TypeScript package has only
    /// [`TieredDirs::is_vendor_bundle_id`] and leaves the caller to decide.
    /// The check is the same in both.
    pub fn assert_vendor_bundle_id(&self, bundle_id: &str) {
        assert_vendor_bundle_id(&self.vendor, bundle_id);
    }

    /// The platform temp directory, with no tier: state that does not outlive
    /// the call that wrote it.
    ///
    /// Not [`Tier::runtime`]. Runtime holds state that outlives the call and
    /// describes a live process: a pidfile, a socket, a lock. The OS may clear
    /// temp while such a process is still running.
    pub fn scratch(&self) -> Dir {
        Dir {
            path: self.base.scratch.clone(),
        }
    }
}

/// Which constructor produced a [`Tier`].
///
/// Exposed so a caller, or a check run over a third party's install, can tell
/// a suite address from a standalone one without parsing the segment string.
///
/// **Stability:** stable in 0.x. `#[non_exhaustive]`, so a later release can
/// add a kind without a breaking change. A `match` outside this crate needs a
/// `_` arm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
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

    /// State that should outlive a restart but is not user data.
    pub fn state(&self) -> Dir {
        self.home(Home::State)
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
                state: "EXAMPLE_STATE_DIR",
                logs: "EXAMPLE_LOGS_DIR",
                runtime: "EXAMPLE_RUNTIME_DIR",
                scratch: "EXAMPLE_SCRATCH_DIR",
                require_override: "EXAMPLE_REQUIRE_OVERRIDE",
                convention: "EXAMPLE_CONVENTION",
            }
        );
        assert_eq!(ENV.dir(None), "EXAMPLE_SCRATCH_DIR");
        assert_eq!(ENV.dir(Some(Home::Logs)), "EXAMPLE_LOGS_DIR");
        assert_eq!(ENV.dir(Some(Home::State)), "EXAMPLE_STATE_DIR");
        assert_eq!(ENV.overrides().count(), 8);
        assert!(!ENV.overrides().any(|name| name == ENV.require_override));
        assert!(!ENV.overrides().any(|name| name == ENV.convention));
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
            suite.state().path(),
            Path::new("/stub/state/com.example.notes")
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
            (Home::State, tier.state()),
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
        // write under the vendor's directory.
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
        // live process. A scratch file does not outlive the call.
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
        // Problem 2. The OS may purge cache while the process a pidfile
        // describes is still alive, so runtime falls back under durable.
        let base = BaseDirs::from_parts(
            Some(PathBuf::from("/d")),
            Some(PathBuf::from("/c")),
            Some(PathBuf::from("/cache")),
            Some(PathBuf::from("/s")),
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
            Some(PathBuf::from("/s")),
            Some(PathBuf::from("/l")),
            Some(PathBuf::from("/run/user/501")),
            Some(PathBuf::from("/tmp")),
        )
        .unwrap();
        assert_eq!(base.get(Home::Runtime), Path::new("/run/user/501"));
    }

    #[test]
    fn a_missing_base_dir_is_an_error_not_a_panic() {
        // Problem 3. Headless CI and sandboxes do not always have a home.
        let some = |p: &str| Some(PathBuf::from(p));
        let names = ["durable", "config", "cache", "state", "logs", "scratch"];
        for (missing, home) in names.into_iter().enumerate() {
            let mut parts = names.map(|name| some(&format!("/{name}")));
            parts[missing] = None;
            let [durable, config, cache, state, logs, scratch] = parts;
            let err = BaseDirs::from_parts(durable, config, cache, state, logs, None, scratch)
                .unwrap_err();
            assert_eq!(err, Error::MissingBaseDir { home });
        }
    }

    #[test]
    fn from_env_resolves_or_errors_without_panicking() {
        // Whatever this machine returns, nothing may panic.
        match BaseDirs::from_env(&ENV, ResolveOptions::new()) {
            Ok(base) => {
                for home in Home::ALL {
                    assert!(base.get(home).is_absolute(), "{}", home.as_str());
                }
                assert!(base.scratch().is_absolute());
                // Logs and state are never under cache, because the OS purges cache.
                assert_ne!(base.get(Home::Logs), base.get(Home::Cache));
                assert_ne!(base.get(Home::State), base.get(Home::Cache));
                assert_ne!(base.get(Home::Runtime), base.get(Home::Cache));
                // The OS clears scratch, and runtime describes a live process.
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
        let dirs = TieredDirs::from_env(VENDOR, &ENV, ResolveOptions::new()).unwrap();
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
        guarded_opts(ResolveOptions::new(), vars, test_root)
    }

    fn guarded_opts(
        opts: ResolveOptions,
        vars: &[(&str, &str)],
        test_root: Option<&str>,
    ) -> Result<BaseDirs, Error> {
        let test_root = test_root.map(abs);
        BaseDirs::from_env_guarded(
            &ENV,
            opts,
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
        // An explicit root wins over the test root and the require-override check.
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
    fn resolve_options_default_to_native_with_the_test_root_on() {
        let opts = ResolveOptions::default();
        assert_eq!(opts, ResolveOptions::new());
        assert_eq!(opts.convention, Convention::Native);
        assert!(opts.test_root);
        assert!(!opts.with_test_root(false).test_root);
        assert!(opts.with_test_root(false).with_test_root(true).test_root);
        let xdg = opts.with_convention(Convention::Xdg);
        assert_eq!(xdg.convention, Convention::Xdg);
        assert!(xdg.test_root);
    }

    #[test]
    fn with_the_test_root_off_a_test_binary_resolves_as_outside_cargo() {
        let off = ResolveOptions::new().with_test_root(false);
        // The OS and env values, not the fake test root.
        assert_eq!(guarded_opts(off, &[], Some("/t")), from_vars(&[]));
        let cache = [("EXAMPLE_CACHE_DIR", "/c")];
        assert_eq!(guarded_opts(off, &cache, Some("/t")), from_vars(&cache));
        // The root variable still wins.
        assert_eq!(
            guarded_opts(off, &[("EXAMPLE_ROOT", "/r")], Some("/t")).unwrap(),
            BaseDirs::rooted(abs("/r")),
        );
        // The require-override check still refuses an OS fallback.
        assert!(matches!(
            guarded_opts(off, &[(ENV.require_override, "1")], Some("/t")),
            Err(Error::OverrideRequired { .. })
        ));
        // With the switch on, the fake test root is used.
        let on = ResolveOptions::new().with_test_root(true);
        assert_eq!(
            guarded_opts(on, &[], Some("/t")).unwrap(),
            BaseDirs::rooted(abs("/t"))
        );
        assert_eq!(
            guarded_opts(on, &[(ENV.require_override, "1")], Some("/t")).unwrap(),
            BaseDirs::rooted(abs("/t"))
        );
    }

    /// This binary runs under cargo, yet with the switch off the real
    /// environment resolves as `from_env_with` over the same environment.
    #[test]
    fn from_env_with_the_test_root_off_skips_the_scratch_root() {
        assert!(test_root().is_some(), "cargo test should have a test root");
        if [ENV.root, ENV.require_override]
            .iter()
            .any(|name| std::env::var_os(name).is_some_and(|v| !v.is_empty()))
        {
            return; // The other rules decide; nothing to prove here.
        }
        let off = ResolveOptions::new().with_test_root(false);
        assert_eq!(
            BaseDirs::from_env(&ENV, off),
            BaseDirs::from_env_with(&ENV, off, |name| std::env::var_os(name)),
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
            ("EXAMPLE_STATE_DIR", "/st"),
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
        BaseDirs::from_env_with(&ENV, ResolveOptions::new(), |name| {
            vars.iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| OsString::from(host_value(value)))
        })
    }

    fn all_seven(base: &BaseDirs) -> [&Path; 7] {
        [
            base.get(Home::Durable),
            base.get(Home::Config),
            base.get(Home::Cache),
            base.get(Home::State),
            base.get(Home::Logs),
            base.get(Home::Runtime),
            base.scratch(),
        ]
    }

    #[test]
    fn the_root_var_alone_moves_all_seven_base_dirs() {
        let base = from_vars(&[("EXAMPLE_ROOT", "/scratch")]).unwrap();
        assert_eq!(base, BaseDirs::rooted(abs("/scratch")));
        assert_eq!(base.get(Home::State), abs("/scratch/state"));
        for path in all_seven(&base) {
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
    fn no_override_is_the_os_default() {
        let os = os_defaults(Convention::Native, |_| None);
        let Ok(os) = BaseDirs::from_parts(
            os.durable,
            os.config,
            os.cache,
            os.state,
            os.logs,
            os.runtime,
            Some(std::env::temp_dir()),
        ) else {
            return;
        };
        assert_eq!(from_vars(&[]).unwrap(), os);
        // An empty value counts as unset.
        assert_eq!(from_vars(&[("EXAMPLE_ROOT", "")]).unwrap(), os);
    }

    /// The Native table off Linux comes from `dirs` and Apple's places.
    #[cfg(target_os = "macos")]
    #[test]
    #[allow(
        clippy::disallowed_methods,
        reason = "checks resolution against the OS defaults"
    )]
    fn the_native_table_on_macos_is_apples() {
        let (Some(home), Ok(base)) = (dirs::home_dir(), from_vars(&[])) else {
            return;
        };
        let support = home.join("Library").join("Application Support");
        assert_eq!(base.get(Home::Durable), support);
        assert_eq!(base.get(Home::Config), support);
        assert_eq!(base.get(Home::Cache), home.join("Library").join("Caches"));
        assert_eq!(base.get(Home::State), support);
        assert_eq!(base.get(Home::Logs), home.join("Library").join("Logs"));
        assert_eq!(base.get(Home::Runtime), support.join("run"));
    }

    /// `from_env_with` over a fixed map, under one convention.
    fn from_vars_in(convention: Convention, vars: &[(&str, &str)]) -> Result<BaseDirs, Error> {
        let opts = ResolveOptions::new().with_convention(convention);
        BaseDirs::from_env_with(&ENV, opts, |name| {
            vars.iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| OsString::from(host_value(value)))
        })
    }

    /// Off Windows, Xdg is the XDG table under the home directory. On
    /// Windows it is the Native table. On Linux the two are the same.
    #[test]
    #[allow(
        clippy::disallowed_methods,
        reason = "checks resolution against the OS defaults"
    )]
    fn the_xdg_convention_is_the_xdg_table_off_windows() {
        let (Some(home), Ok(native)) = (dirs::home_dir(), from_vars(&[])) else {
            return;
        };
        let xdg = from_vars_in(Convention::Xdg, &[]).unwrap();
        if cfg!(windows) {
            assert_eq!(xdg, native);
        } else {
            assert_eq!(xdg, BaseDirs::xdg(&home, |_| None));
            assert_eq!(xdg.get(Home::Config), home.join(".config"));
        }
        if cfg!(not(any(windows, target_os = "macos"))) {
            assert_eq!(xdg, native);
        }
    }

    #[test]
    fn the_convention_var_beats_the_callers_convention() {
        let Ok(native) = from_vars(&[]) else { return };
        let Ok(xdg) = from_vars_in(Convention::Xdg, &[]) else {
            return;
        };
        assert_eq!(from_vars(&[(ENV.convention, "xdg")]).unwrap(), xdg);
        assert_eq!(
            from_vars_in(Convention::Xdg, &[(ENV.convention, "native")]).unwrap(),
            native
        );
        // Trimmed; an empty value counts as unset.
        assert_eq!(from_vars(&[(ENV.convention, " xdg\n")]).unwrap(), xdg);
        assert_eq!(from_vars(&[(ENV.convention, "")]).unwrap(), native);
    }

    #[test]
    fn an_unknown_convention_is_refused() {
        for bad in ["XDG", "Native", "apple", "unix", " "] {
            assert_eq!(
                from_vars(&[(ENV.convention, bad)]).unwrap_err(),
                Error::InvalidConvention {
                    var: "EXAMPLE_CONVENTION",
                    value: bad.to_string(),
                },
            );
        }
        // Refused even when the root moves every directory.
        assert!(from_vars(&[("EXAMPLE_ROOT", "/r"), (ENV.convention, "apple")]).is_err());
    }

    #[test]
    fn under_xdg_an_override_still_wins() {
        let base = from_vars_in(
            Convention::Xdg,
            &[("XDG_CONFIG_HOME", "/xc"), ("EXAMPLE_CONFIG_DIR", "/c")],
        )
        .unwrap();
        assert_eq!(base.get(Home::Config), abs("/c"));
        let base = from_vars_in(Convention::Xdg, &[("EXAMPLE_ROOT", "/r")]).unwrap();
        assert_eq!(base, BaseDirs::rooted(abs("/r")));
    }

    #[test]
    fn the_xdg_layout_reads_its_variables_and_ignores_relative_ones() {
        let home = abs("/h");
        let vars = |pairs: &'static [(&'static str, &'static str)]| {
            move |name: &str| {
                pairs
                    .iter()
                    .find(|(key, _)| *key == name)
                    .map(|(_, value)| OsString::from(host_value(value)))
            }
        };
        let base = BaseDirs::xdg(&home, vars(&[]));
        assert_eq!(base.get(Home::Durable), abs("/h/.local/share"));
        assert_eq!(base.get(Home::Config), abs("/h/.config"));
        assert_eq!(base.get(Home::Cache), abs("/h/.cache"));
        assert_eq!(base.get(Home::State), abs("/h/.local/state"));
        assert_eq!(base.get(Home::Logs), abs("/h/.local/state"));
        assert_eq!(base.get(Home::Runtime), abs("/h/.local/share/run"));
        let base = BaseDirs::xdg(
            &home,
            vars(&[
                ("XDG_DATA_HOME", "/d"),
                ("XDG_CACHE_HOME", "rel"),
                ("XDG_STATE_HOME", ""),
            ]),
        );
        assert_eq!(base.get(Home::Durable), abs("/d"));
        assert_eq!(base.get(Home::Runtime), abs("/d/run"));
        assert_eq!(base.get(Home::Cache), abs("/h/.cache"));
        assert_eq!(base.get(Home::State), abs("/h/.local/state"));
    }

    #[test]
    fn convention_names_match_the_env_values() {
        assert_eq!(Convention::default(), Convention::Native);
        assert_eq!(Convention::ALL[0], Convention::default());
        assert_eq!(Convention::Native.as_str(), "native");
        assert_eq!(Convention::Xdg.as_str(), "xdg");
        for convention in Convention::ALL {
            assert_eq!(convention.as_str().parse(), Ok(*convention));
        }
        // Untrimmed and lower case only; the variable is trimmed first.
        for bad in [" xdg", "XDG", ""] {
            assert_eq!(
                bad.parse::<Convention>(),
                Err(Error::InvalidConvention {
                    var: "convention",
                    value: bad.to_string(),
                })
            );
        }
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
        let err = BaseDirs::from_env_with(&ENV, ResolveOptions::new(), |name| {
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
        let base = BaseDirs::from_env_with(&ENV, ResolveOptions::new(), |name| {
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

    const RESERVED_SPELLINGS: [&str; 6] = ["state", "logs", "run", "State", "LOGS", "Run"];

    #[test]
    fn reserved_names_are_refused_in_any_case() {
        let dirs = dirs();
        for name in RESERVED_SPELLINGS {
            assert!(!is_valid_segment(name), "{name}");
            assert_eq!(
                dirs.standalone(name).unwrap_err(),
                Error::InvalidKey {
                    kind: "standalone",
                    key: name.to_string()
                }
            );
            assert!(TieredDirs::with_base_dirs(name, BaseDirs::rooted("/stub")).is_err());
            assert!(dirs.vendor().cache().app(name).is_err());
        }
        for near in ["states", "log", "runs", "run-1", "state.d"] {
            assert!(is_valid_segment(near), "{near}");
        }
    }

    /// The Windows layout: state under the cache base, logs and runtime under
    /// the durable base.
    fn windows_layout() -> BaseDirs {
        from_vars(&[
            ("EXAMPLE_DURABLE_DIR", "/roaming"),
            ("EXAMPLE_CONFIG_DIR", "/roaming"),
            ("EXAMPLE_CACHE_DIR", "/local"),
            ("EXAMPLE_STATE_DIR", "/local/state"),
            ("EXAMPLE_LOGS_DIR", "/roaming/logs"),
            ("EXAMPLE_SCRATCH_DIR", "/tmp"),
        ])
        .unwrap()
    }

    #[test]
    fn no_tier_lands_on_or_above_another_homes_root() {
        let windows = windows_layout();
        assert_eq!(windows.get(Home::Runtime), abs("/roaming/run"));
        let names = RESERVED_SPELLINGS.into_iter().chain(["notes", "states"]);
        for layout in [windows, BaseDirs::rooted(abs("/stub"))] {
            for name in names.clone() {
                let as_vendor = TieredDirs::with_base_dirs(name, layout.clone());
                let suite_owner = TieredDirs::with_base_dirs(VENDOR, layout.clone()).unwrap();
                let tiers = [
                    as_vendor.as_ref().ok().map(TieredDirs::vendor),
                    suite_owner.suite(name).ok(),
                    suite_owner.standalone(name).ok(),
                ];
                for tier in tiers.iter().flatten() {
                    for home in Home::ALL {
                        let dir = tier.home(home);
                        for other in Home::ALL {
                            let root = layout.get(other);
                            if root == layout.get(home) {
                                continue;
                            }
                            assert!(
                                !root.starts_with(dir.path()),
                                "{name}: {} {} holds the {} root",
                                tier.kind().as_str(),
                                home.as_str(),
                                other.as_str(),
                            );
                        }
                    }
                }
            }
        }
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

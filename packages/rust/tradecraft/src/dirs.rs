//! The machine-local directories tradecraft reads and writes: the machine
//! config file and the `--from-git` checkout cache.
//!
//! Resolved with `tiered-dirs`. The vendor segment and the override variables
//! are the ones earlier builds used, so both stay where they were:
//!
//! - the vendor tier is `com.sizerllc`, and a suite tier is
//!   `com.sizerllc.<suite>`;
//! - `FLEET_ROOT`, `FLEET_<HOME>_DIR`, `FLEET_SCRATCH_DIR`,
//!   `FLEET_REQUIRE_OVERRIDE` and `FLEET_CONVENTION` move the base
//!   directories.

use tiered_dirs::{BaseDirs, EnvVars, ResolveOptions, TieredDirs};

/// The vendor segment every tier path starts with.
pub const VENDOR: &str = "com.sizerllc";

/// The `FLEET_*` variables that move the base directories.
pub const ENV_VARS: EnvVars = tiered_dirs::env_vars!("FLEET");

/// The platform base directories for [`VENDOR`], with the [`ENV_VARS`]
/// overrides and the `tiered-dirs` test-root rules applied.
///
/// # Errors
///
/// When the base directories cannot be resolved, for example with no home
/// directory and no override.
pub fn system() -> Result<TieredDirs, tiered_dirs::Error> {
    TieredDirs::from_env(VENDOR, &ENV_VARS, ResolveOptions::new())
}

/// [`system`] over injected base directories, for tests.
///
/// # Panics
///
/// Never: [`VENDOR`] is a valid path segment.
pub fn with_base_dirs(base: BaseDirs) -> TieredDirs {
    TieredDirs::with_base_dirs(VENDOR, base).expect("VENDOR is a valid path segment")
}

//! The machine-local directories skillwright reads and writes: the machine
//! config file and the `--from-git` checkout cache.
//!
//! Resolved with `tiered-dirs`:
//!
//! - the vendor tier is `dev.osdlc`, and a suite tier is
//!   `dev.osdlc.<suite>`;
//! - `SKILLWRIGHT_ROOT`, `SKILLWRIGHT_<HOME>_DIR`, `SKILLWRIGHT_SCRATCH_DIR`,
//!   `SKILLWRIGHT_REQUIRE_OVERRIDE` and `SKILLWRIGHT_CONVENTION` move the base
//!   directories.

use tiered_dirs::{BaseDirs, EnvVars, ResolveOptions, TieredDirs};

/// The vendor segment every tier path starts with.
pub const VENDOR: &str = "dev.osdlc";

/// The `SKILLWRIGHT_*` variables that move the base directories.
pub const ENV_VARS: EnvVars = tiered_dirs::env_vars!("SKILLWRIGHT");

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_vendor_is_dev_osdlc() {
        assert_eq!(VENDOR, "dev.osdlc");
    }

    #[test]
    fn the_overrides_use_the_skillwright_stem() {
        assert_eq!(ENV_VARS.root, "SKILLWRIGHT_ROOT");
        assert_eq!(ENV_VARS.scratch, "SKILLWRIGHT_SCRATCH_DIR");
        assert_eq!(ENV_VARS.require_override, "SKILLWRIGHT_REQUIRE_OVERRIDE");
        assert_eq!(ENV_VARS.convention, "SKILLWRIGHT_CONVENTION");
        for var in [
            ENV_VARS.durable,
            ENV_VARS.config,
            ENV_VARS.cache,
            ENV_VARS.state,
            ENV_VARS.logs,
            ENV_VARS.runtime,
        ] {
            assert!(
                var.starts_with("SKILLWRIGHT_") && var.ends_with("_DIR"),
                "{var}"
            );
        }
    }

    #[test]
    fn the_checkout_cache_is_under_dev_osdlc_skillwright() {
        let dirs = with_base_dirs(BaseDirs::rooted(std::path::PathBuf::from("/root")));
        let cache = dirs.suite("skillwright").unwrap().cache().into_path();
        assert!(
            cache
                .components()
                .any(|c| c.as_os_str() == "dev.osdlc.skillwright"),
            "{}",
            cache.display()
        );
    }
}

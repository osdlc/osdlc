//! The machine-local directories tradecraft reads and writes: the machine
//! config file and the `--from-git` checkout cache.
//!
//! Resolved with `tiered-dirs`:
//!
//! - the vendor tier is `dev.osdlc`, and a suite tier is
//!   `dev.osdlc.<suite>`;
//! - `TRADECRAFT_ROOT`, `TRADECRAFT_<HOME>_DIR`, `TRADECRAFT_SCRATCH_DIR`,
//!   `TRADECRAFT_REQUIRE_OVERRIDE` and `TRADECRAFT_CONVENTION` move the base
//!   directories.

use tiered_dirs::{BaseDirs, EnvVars, ResolveOptions, TieredDirs};

/// The vendor segment every tier path starts with.
pub const VENDOR: &str = "dev.osdlc";

/// The `TRADECRAFT_*` variables that move the base directories.
pub const ENV_VARS: EnvVars = tiered_dirs::env_vars!("TRADECRAFT");

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
    fn the_overrides_use_the_tradecraft_stem() {
        assert_eq!(ENV_VARS.root, "TRADECRAFT_ROOT");
        assert_eq!(ENV_VARS.scratch, "TRADECRAFT_SCRATCH_DIR");
        assert_eq!(ENV_VARS.require_override, "TRADECRAFT_REQUIRE_OVERRIDE");
        assert_eq!(ENV_VARS.convention, "TRADECRAFT_CONVENTION");
        for var in [
            ENV_VARS.durable,
            ENV_VARS.config,
            ENV_VARS.cache,
            ENV_VARS.state,
            ENV_VARS.logs,
            ENV_VARS.runtime,
        ] {
            assert!(
                var.starts_with("TRADECRAFT_") && var.ends_with("_DIR"),
                "{var}"
            );
        }
    }

    #[test]
    fn the_checkout_cache_is_under_dev_osdlc_tradecraft() {
        let dirs = with_base_dirs(BaseDirs::rooted(std::path::PathBuf::from("/root")));
        let cache = dirs.suite("tradecraft").unwrap().cache().into_path();
        assert!(
            cache
                .components()
                .any(|c| c.as_os_str() == "dev.osdlc.tradecraft"),
            "{}",
            cache.display()
        );
    }
}

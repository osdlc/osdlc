//! What every integration binary here needs before it can run a verb: the
//! machine file pointed somewhere harmless.
//!
//! The override is process-wide and `cargo test` runs a binary's tests in
//! parallel threads, so setting it without a lock would race between tests,
//! and leaving it alone would feed the developer's real machine file into
//! every run.
//!
//! `src/resolve.rs` keeps its own copy for the unit tests: a `#[cfg(test)]`
//! item in the library is not visible from a `tests/` binary.

use std::path::Path;
use std::sync::Mutex;

static ENV_LOCK: Mutex<()> = Mutex::new(());

/// Point the machine file at `path` (or back at its default), run `f`, then
/// restore what was there.
pub fn with_machine_env<T>(path: Option<&Path>, f: impl FnOnce() -> T) -> T {
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let saved = skillwright::config::replace_machine_config_override(path.map(Path::to_path_buf));
    let result = f();
    skillwright::config::replace_machine_config_override(saved);
    result
}

#[allow(dead_code)]
static GIT_LOCK: Mutex<()> = Mutex::new(());

/// Run one `--from-git` case at a time.
///
/// In a cargo test binary `tiered-dirs` resolves the checkout cache under its
/// own per-process scratch root, so nothing here reads or writes a real
/// `$HOME`. The cases share that cache, so they run one at a time.
#[allow(dead_code)]
pub fn with_git_cache<T>(f: impl FnOnce() -> T) -> T {
    let _guard = GIT_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    f()
}

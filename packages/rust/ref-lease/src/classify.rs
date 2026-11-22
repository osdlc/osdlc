//! How the protocol reads git's answers. Pure functions.

/// What a compare-and-swap push did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PushOutcome {
    /// The authority holds the new value.
    Ok,
    /// Another writer got there first.
    CasFailed,
    /// git failed for a reason a retry cannot fix.
    GitFailed,
}

/// What a failed fetch means.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FetchFailure {
    /// The authority has no such ref.
    RefNotFound,
    /// Another process holds the local ref. It clears in milliseconds: retry.
    LockContention,
    /// git failed for any other reason.
    GitFailed,
}

/// The status character `git push --porcelain` prints for a ref, with the
/// rejection reason when the ref was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PushFlag<'a> {
    /// `*`, `+`, ` `, `-`, `=` or `!`.
    pub flag: char,
    /// The reason kind read from git's reason text. Only set when `flag` is
    /// `!`: `stale`, `already-exists`, `lock-failed`, `non-fast-forward`, or
    /// any other string for a rejection that is not a lost race.
    pub rejection: Option<&'a str>,
}

/// The rejections that mean another writer got there first. Every other
/// rejection (a hook, a ref path clash, anything unrecognised) is a git
/// failure: retrying cannot help.
const LOST_RACE: [&str; 4] = ["stale", "already-exists", "lock-failed", "non-fast-forward"];

/// Classify the result git printed for the pushed ref.
///
/// `=` (up to date) needs care: git reports it when the authority already holds
/// the sha being pushed, before it checks the lease. That is a success only for
/// a write whose expected sha is the sha it pushes (`keeps_sha`). For any other
/// write the ref was not where the caller expected, so it lost.
#[must_use]
pub fn push_outcome(result: PushFlag<'_>, keeps_sha: bool) -> PushOutcome {
    match result.flag {
        '!' if LOST_RACE.contains(&result.rejection.unwrap_or("")) => PushOutcome::CasFailed,
        '!' => PushOutcome::GitFailed,
        '=' if keeps_sha => PushOutcome::Ok,
        '=' => PushOutcome::CasFailed,
        _ => PushOutcome::Ok,
    }
}

/// Markers of a fetch that asked for a ref the authority does not have.
const NOT_FOUND_MARKERS: [&str; 5] = [
    "couldn't find remote ref",
    "couldn't find remote",
    "did not match any refs",
    "fatal: couldn't find",
    "no such ref",
];

/// git's messages when another process in the same ref store got to a local
/// ref first: it holds the ref's lock file, or it moved the ref between this
/// fetch reading it and writing it. Both clear on a retry. Other
/// `cannot lock ref` failures, such as a directory/file ref clash, are
/// permanent.
const LOCAL_LOCK_MARKERS: [&str; 2] = [".lock': file exists", "but expected"];

fn has(text: &str, markers: &[&str]) -> bool {
    let low = text.to_lowercase();
    markers.iter().any(|m| low.contains(m))
}

/// Classify the stderr of a failed fetch, run in the C locale.
#[must_use]
pub fn fetch_failure(stderr: &str) -> FetchFailure {
    if has(stderr, &NOT_FOUND_MARKERS) {
        FetchFailure::RefNotFound
    } else if has(stderr, &LOCAL_LOCK_MARKERS) {
        FetchFailure::LockContention
    } else {
        FetchFailure::GitFailed
    }
}

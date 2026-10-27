//! Vault-relative paths: the containment guard and the `_system/` rules.
//!
//! The guard lives in the `path-guard` crate. [`Guard`], [`PathError`] and the
//! text checks in [`lexical`] are re-exported here, so a vault caller needs one
//! dependency. A caller that needs a custom filesystem depends on `path-guard`
//! directly for `Resolver`.

pub use path_guard::{Guard, PathError, lexical};

/// The `_system/` prefix, as a policy rather than as a string literal.
///
/// A vault-relative path is spelled with `/` (see [`lexical::validate_relative`], which
/// folds backslashes) and the prefix is eight bytes long including that
/// separator — the constant is here so no consumer has to know either fact.
pub const SYSTEM_PREFIX: &str = "_system/";

/// Whether `rel` is under `_system/` — **case-insensitively**.
///
/// # The one predicate for the policy
///
/// `_system/**` is where the notes that carry a contract live, and
/// two kinds of caller enforce that: a writer runs corpus validation on a
/// write there, and a rename planner (such as `markdown-relink`) refuses a
/// rename that crosses the boundary in either direction. Those are the same policy and they now
/// ask the same function.
///
/// It lives here because this is the lowest crate both enforcers can depend on,
/// so it is where the single copy has to sit.
///
/// # Why case-insensitive
///
/// The prefix is a proxy for "this file is a config note", and on the two
/// filesystems most users run on it is a case-insensitive one:
/// `_System/ocr.md` and `_system/ocr.md` are the same file on macOS and on
/// Windows. A case-sensitive check lets a write — or a *rename*, which is a
/// write with a longer reach — land content in that file with the corpus
/// validation skipped. Matching case-insensitively costs a Linux vault
/// nothing: a genuinely distinct `_System/` directory there is treated as
/// configuration too, which is the conservative direction to be wrong in.
pub fn is_system_path(rel: &str) -> bool {
    rel.as_bytes()
        .get(..SYSTEM_PREFIX.len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(SYSTEM_PREFIX.as_bytes()))
}

/// `rel` with its `_system/` prefix in canonical lower case, or `None` when it
/// is not a `_system/` path at all.
///
/// The corpus routes on the path string, so recognising `_System/…` as
/// configuration is only half the fix: handed through as typed it matches no
/// contract, and "no contract matches this path" is an *advisory*
/// result, which lets the write through. Canonicalising the prefix is what makes the same file
/// reach the same contract under either spelling. Only the prefix is touched —
/// the rest of the path is the corpus's business and a note's own name is
/// case-sensitive data.
pub fn system_route(rel: &str) -> Option<String> {
    is_system_path(rel).then(|| format!("{SYSTEM_PREFIX}{}", &rel[SYSTEM_PREFIX.len()..]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_system_prefix_is_matched_case_insensitively() {
        // The whole reason one predicate serves every guard: on macOS and
        // Windows `_System/x.md` IS `_system/x.md`, so any spelling of it has
        // to answer the same wherever it is asked.
        assert!(is_system_path("_system/ocr.md"));
        assert!(is_system_path("_System/ocr.md"));
        assert!(is_system_path("_SYSTEM/ocr.md"));
        assert!(is_system_path("_SyStEm/scheduled_tasks/nightly.md"));
    }

    #[test]
    fn only_the_prefix_counts_as_system() {
        assert!(!is_system_path("_systemic/x.md"));
        assert!(!is_system_path("Notes/_system/x.md"));
        assert!(!is_system_path("_system"), "the separator is part of it");
        assert!(!is_system_path(""));
    }

    #[test]
    fn the_route_canonicalises_the_prefix_and_nothing_else() {
        // The corpus routes on the string, so a mis-cased prefix has to reach
        // the same contract — while the note's own name stays case-sensitive
        // data.
        assert_eq!(
            system_route("_System/Scheduled_Tasks/Nightly.md").as_deref(),
            Some("_system/Scheduled_Tasks/Nightly.md")
        );
        assert_eq!(system_route("Notes/a.md"), None);
    }
}

//! Hide rules: the vault's list of excluded files, compiled.
//!
//! The entries use Obsidian's "Excluded files" syntax (`userIgnoreFilters`
//! in `.obsidian/app.json`), matched as Obsidian 1.x matches them:
//!
//! - An entry written `/.../` is a regular expression, matched
//!   case-insensitively anywhere in the vault-relative path (JS `RegExp` with
//!   the `i` flag, `test`). JS syntax that Rust's `regex` lacks, such as
//!   lookaround, does not compile; that entry is skipped with a warning.
//! - Any other entry is a case-insensitive prefix of the vault-relative path.
//!   It is a string prefix, not a path-segment one: `Arch` hides `Archive/`
//!   and `Archived.md`. A folder entry may end with `/`, which keeps
//!   `Archive/` from hiding `Archive 2.md`.
//! - Each entry is trimmed first, and blank entries are ignored.
//!
//! Obsidian tests file paths only. A folder is hidden when its path plus `/`
//! matches a prefix entry, which is exactly when the prefix entries hide
//! everything inside it; the walk prunes such a folder rather than walking
//! it. A regex entry never hides a folder: it tests each file path below.
//!
//! Where the list lives, and reading it, is the caller's job; this module
//! only compiles and matches.

/// One compiled entry.
#[derive(Debug, Clone)]
enum Rule {
    /// Lowercased.
    Prefix(String),
    Regex(regex::Regex),
}

/// A compiled hide list. Empty hides nothing.
#[derive(Debug, Clone, Default)]
pub struct HideRules {
    rules: Vec<Rule>,
}

impl HideRules {
    /// Compile `entries`. Returns the rules and one warning per entry that
    /// was skipped.
    pub fn parse<S: AsRef<str>>(entries: &[S]) -> (HideRules, Vec<String>) {
        let mut rules = Vec::new();
        let mut warnings = Vec::new();
        for raw in entries {
            let entry = raw.as_ref().trim();
            if entry.is_empty() {
                continue;
            }
            match regex_body(entry) {
                Some(body) => match regex::RegexBuilder::new(body)
                    .case_insensitive(true)
                    .build()
                {
                    Ok(re) => rules.push(Rule::Regex(re)),
                    Err(e) => warnings.push(format!("excluded-files entry {entry:?} skipped: {e}")),
                },
                None => rules.push(Rule::Prefix(entry.to_lowercase())),
            }
        }
        (HideRules { rules }, warnings)
    }

    /// Whether the list holds no rules, so nothing is hidden.
    pub fn is_empty(&self) -> bool {
        self.rules.is_empty()
    }

    /// Whether vault-relative `rel` is hidden. `is_dir` tests `rel/` against
    /// the prefix entries only.
    pub fn hides(&self, rel: &str, is_dir: bool) -> bool {
        if self.rules.is_empty() || rel.is_empty() {
            return false;
        }
        let path = if is_dir {
            format!("{}/", rel.trim_end_matches('/'))
        } else {
            rel.to_string()
        };
        let lower = path.to_lowercase();
        self.rules.iter().any(|rule| match rule {
            Rule::Prefix(p) => lower.starts_with(p.as_str()),
            Rule::Regex(re) => !is_dir && re.is_match(&path),
        })
    }

    /// Whether `rel` or any folder above it is hidden.
    pub fn hides_path(&self, rel: &str, is_dir: bool) -> bool {
        if self.rules.is_empty() {
            return false;
        }
        let rel = rel.trim_end_matches('/');
        let mut at = 0;
        while let Some(i) = rel[at..].find('/') {
            if self.hides(&rel[..at + i], true) {
                return true;
            }
            at += i + 1;
        }
        self.hides(rel, is_dir)
    }
}

/// The pattern inside `/.../`, or `None` for a prefix entry.
fn regex_body(entry: &str) -> Option<&str> {
    let inner = entry.strip_prefix('/')?.strip_suffix('/')?;
    (!inner.is_empty()).then_some(inner)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(entries: &[&str]) -> HideRules {
        HideRules::parse(entries).0
    }

    #[test]
    fn a_plain_entry_is_a_case_insensitive_string_prefix() {
        let r = rules(&["Archive"]);
        assert!(r.hides("Archive/old.md", false));
        assert!(r.hides("archive/old.md", false));
        assert!(
            r.hides("Archived.md", false),
            "a string prefix, as Obsidian"
        );
        assert!(r.hides("Archive", true));
        assert!(!r.hides("Notes/Archive/old.md", false));
    }

    #[test]
    fn a_folder_entry_with_a_slash_hides_only_the_folder() {
        let r = rules(&["Archive/"]);
        assert!(r.hides("Archive/old.md", false));
        assert!(r.hides("Archive", true));
        assert!(!r.hides("Archive 2.md", false));
        assert!(!r.hides("Archived", true));
    }

    #[test]
    fn a_file_entry_hides_that_file() {
        let r = rules(&["Notes/secret.md"]);
        assert!(r.hides("Notes/secret.md", false));
        assert!(!r.hides("Notes", true));
        assert!(!r.hides("Notes/other.md", false));
    }

    #[test]
    fn a_slashed_entry_is_a_case_insensitive_unanchored_regex() {
        let r = rules(&["/\\.excalidraw\\.md$/"]);
        assert!(r.hides("Drawings/A.Excalidraw.md", false));
        assert!(!r.hides("Drawings/A.md", false));
        let r = rules(&["/^daily/"]);
        assert!(r.hides("Daily/2026.md", false));
        assert!(!r.hides("Notes/daily.md", false));
    }

    #[test]
    fn an_invalid_regex_is_skipped_with_a_warning() {
        let (r, warnings) = HideRules::parse(&["/(unclosed/", "/(?<=x)y/", "Keep"]);
        assert_eq!(warnings.len(), 2, "{warnings:?}");
        assert!(r.hides("Keep/a.md", false));
        assert!(!r.hides("unclosed/a.md", false));
    }

    #[test]
    fn blank_entries_and_a_bare_slash_pair_are_not_rules() {
        let (r, warnings) = HideRules::parse(&["", "  "]);
        assert!(r.is_empty());
        assert!(warnings.is_empty());
        // `//` is a prefix entry, which no vault-relative path starts with.
        assert!(!rules(&["//"]).hides("a.md", false));
    }

    #[test]
    fn hides_path_checks_the_folders_above() {
        let r = rules(&["Private/"]);
        assert!(r.hides_path("Private/a.md", false));
        assert!(r.hides_path("Private/deep/a.md", false));
        assert!(!r.hides_path("Public/a.md", false));
    }

    #[test]
    fn a_regex_tests_file_paths_only_as_obsidian_does() {
        // Meant for files with no extension; it must not prune `Notes/`.
        let r = rules(&["/^[^.]*$/"]);
        assert!(!r.hides("Notes", true));
        assert!(!r.hides_path("Notes/a.md", false));
        assert!(r.hides("Notes/README", false));
        let r = rules(&["/^Private\\/$/"]);
        assert!(!r.hides("Private", true));
        assert!(!r.hides_path("Private/a.md", false));
    }

    #[test]
    fn entries_are_trimmed() {
        let r = rules(&[" Archive/", "/\\.canvas$/ "]);
        assert!(r.hides("Archive/x.md", false));
        assert!(r.hides("Archive", true));
        assert!(r.hides("Boards/a.canvas", false));
    }
}

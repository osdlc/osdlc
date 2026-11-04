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
//! [`load`] reads the list from where Obsidian keeps it,
//! `.obsidian/app.json`, through a [`Vfs`]. Every walk applies it by default
//! (see [`crate::walk::Hide`]). A tool that keeps the list somewhere else
//! compiles its own entries with [`HideRules::parse`].

use std::path::Path;
use std::sync::Arc;

use vfs_seam::Vfs;

/// Where Obsidian keeps a vault's settings, vault-relative.
pub const OBSIDIAN_APP_JSON: &str = ".obsidian/app.json";
/// The key in [`OBSIDIAN_APP_JSON`] that holds the excluded files.
pub const OBSIDIAN_KEY: &str = "userIgnoreFilters";

/// A vault's excluded files as read by [`load`].
#[derive(Debug, Clone, Default)]
pub struct HideList {
    /// The entries as written, blanks and bad regexes included.
    pub entries: Vec<String>,
    /// The entries compiled.
    pub rules: Arc<HideRules>,
    /// Entries skipped while compiling, and items that are not strings.
    pub warnings: Vec<String>,
    /// Set when the file cannot be read or does not parse. The list is then
    /// empty.
    pub error: Option<String>,
}

/// Reads the vault's excluded files from `.obsidian/app.json`
/// (`userIgnoreFilters`) under `vault_dir`.
///
/// A missing file or key is an empty list. A file that cannot be read or
/// does not parse is an empty list with [`HideList::error`] set: one bad
/// settings file must not stop a walk.
pub fn load(vfs: &dyn Vfs, vault_dir: &Path) -> HideList {
    let path = vault_dir.join(".obsidian").join("app.json");
    let bytes = match vfs.read_file(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.is_not_found() => return HideList::default(),
        Err(e) => {
            return HideList {
                error: Some(format!("{OBSIDIAN_APP_JSON}: {}", e.io_error())),
                ..HideList::default()
            };
        }
    };
    let text = String::from_utf8_lossy(&bytes);
    match parse_app_json(&text) {
        Ok((entries, mut warnings)) => {
            let (rules, skipped) = HideRules::parse(&entries);
            warnings.extend(skipped);
            HideList {
                entries,
                rules: Arc::new(rules),
                warnings,
                error: None,
            }
        }
        Err(error) => HideList {
            error: Some(format!("{OBSIDIAN_APP_JSON}: {error}")),
            ..HideList::default()
        },
    }
}

/// The `userIgnoreFilters` entries in the text of an `app.json`, and a
/// warning for each item that is not a string. An empty file, or one with no
/// such key, is an empty list. Text that is not a JSON object, or a key that
/// is not a list, is an error.
pub fn parse_app_json(text: &str) -> Result<(Vec<String>, Vec<String>), String> {
    if text.trim().is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let root: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("not valid JSON: {e}"))?;
    let obj = root.as_object().ok_or("not a JSON object")?;
    match obj.get(OBSIDIAN_KEY) {
        None | Some(serde_json::Value::Null) => Ok((Vec::new(), Vec::new())),
        Some(serde_json::Value::Array(items)) => {
            let mut entries = Vec::new();
            let mut warnings = Vec::new();
            for (i, item) in items.iter().enumerate() {
                match item.as_str() {
                    Some(s) => entries.push(s.to_string()),
                    None => {
                        warnings.push(format!("{OBSIDIAN_KEY} item {i} is not a string; skipped"))
                    }
                }
            }
            Ok((entries, warnings))
        }
        Some(_) => Err(format!("`{OBSIDIAN_KEY}` is not a list")),
    }
}

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

    fn vault(app_json: Option<&str>) -> vfs_seam::MemVfs {
        let vfs = vfs_seam::MemVfs::new();
        vfs.insert("/v/a.md", "").unwrap();
        if let Some(text) = app_json {
            vfs.insert("/v/.obsidian/app.json", text).unwrap();
        }
        vfs
    }

    #[test]
    fn load_reads_prefixes_folders_and_regexes_from_app_json() {
        let vfs = vault(Some(
            r#"{"alwaysUpdateLinks":true,"userIgnoreFilters":["Archive/","/\\.excalidraw\\.md$/","Notes/secret.md"]}"#,
        ));
        let list = load(&vfs, Path::new("/v"));
        assert_eq!(list.error, None);
        assert_eq!(list.entries.len(), 3, "{:?}", list.entries);
        assert!(list.rules.hides("Archive/old.md", false));
        assert!(list.rules.hides("Draw/A.excalidraw.md", false));
        assert!(list.rules.hides("Notes/secret.md", false));
        assert!(!list.rules.hides("Notes/other.md", false));
    }

    #[test]
    fn load_of_a_missing_file_or_key_is_an_empty_list() {
        for vfs in [
            vault(None),
            vault(Some("")),
            vault(Some("{}")),
            vault(Some(r#"{"userIgnoreFilters":null}"#)),
        ] {
            let list = load(&vfs, Path::new("/v"));
            assert!(list.rules.is_empty());
            assert_eq!(list.error, None);
        }
    }

    #[test]
    fn load_of_a_broken_file_is_an_empty_list_with_an_error() {
        for text in ["{not json", "[]", r#"{"userIgnoreFilters":"Archive/"}"#] {
            let list = load(&vault(Some(text)), Path::new("/v"));
            assert!(list.rules.is_empty(), "{text}");
            assert!(list.error.is_some(), "{text}");
        }
    }

    #[test]
    fn load_skips_an_item_that_is_not_a_string_with_a_warning() {
        let list = load(
            &vault(Some(r#"{"userIgnoreFilters":["Keep/",3,"/(?<=x)y/"]}"#)),
            Path::new("/v"),
        );
        assert_eq!(list.entries, vec!["Keep/", "/(?<=x)y/"]);
        assert_eq!(list.warnings.len(), 2, "{:?}", list.warnings);
        assert!(list.rules.hides("Keep/a.md", false));
    }
}

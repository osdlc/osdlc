//! The skill read model: what a `SKILL.md` is once located.
//!
//! Two shapes, because listing and viewing have opposite cost profiles.
//! [`SkillRef`] is list-shaped — the fields a roster renders, produced for
//! every skill in a scan. [`SkillDetail`] is view-shaped — body text and
//! supporting files, produced for exactly the one skill a user opened.
//!
//! # On the frontmatter split
//!
//! [`split_frontmatter`] wraps `frontmatter_lossless::split_lenient`, the
//! BOM/CRLF-tolerant fence split. It is used here instead of a frontmatter
//! parser from another application's private crate, which this crate must not
//! depend on. `frontmatter-lossless` is a shared package, so it is safe to
//! depend on.

use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::vfs::Vfs;

/// Directories a skill is published into, keyed by the agent runtime that
/// reads them. A skill authored once and exported to five runtimes appears
/// once per runtime on disk; recording which one a hit came from is what lets
/// the UI collapse those copies instead of showing five near-identical rows.
pub const RUNTIME_DIRS: &[(&str, &str)] = &[
    (".claude", "claude"),
    (".codex", "codex"),
    (".opencode", "opencode"),
    (".agents", "agents"),
    (".agent", "agent"),
];

/// A skill as it appears in a roster. One per `SKILL.md` found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillRef {
    /// `<root_id>:<relative_dir>` — stable across scans, unique within one.
    pub id: String,
    /// The corpus root this was found under.
    pub root_id: String,
    /// Frontmatter `name`, falling back to the containing directory's name.
    /// Never empty: a skill with neither is not addressable.
    pub name: String,
    /// Frontmatter `description`. Empty when absent — this is the roster's
    /// subtitle, and an absent description is a quality signal, not an error.
    pub description: String,
    /// Directory containing the `SKILL.md`, relative to the root, forward-slashed.
    pub relative_dir: String,
    /// The runtime whose directory this copy lives under (`claude`, `codex`, …),
    /// or `None` for a plugin-native `skills/` layout that no runtime owns.
    pub runtime: Option<String>,
    /// Frontmatter `tags`, when present and list-shaped.
    pub tags: Vec<String>,
    /// Why this entry is degraded, when it is. A skill whose frontmatter fails
    /// to parse is still listed — hiding it makes a broken skill invisible
    /// exactly when the user is looking for what broke.
    pub problem: Option<String>,
}

/// A single skill, opened.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillDetail {
    /// The skill's identity and location.
    pub reference: SkillRef,
    /// Raw frontmatter block, without the `---` fences. Empty when absent.
    pub frontmatter: String,
    /// Everything after the frontmatter, verbatim.
    pub body: String,
    /// Files co-located with the `SKILL.md`, excluding the `SKILL.md` itself.
    pub files: Vec<SupportingFile>,
}

/// A file living alongside a `SKILL.md` — a helper script, a template, a fixture.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SupportingFile {
    /// Path relative to the skill directory, forward-slashed.
    pub path: String,
    /// File size in bytes.
    pub bytes: u64,
}

/// Splits a `---`-fenced YAML frontmatter block off the front of a document.
///
/// Returns `(frontmatter, body)`. Tolerant by design: a UTF-8 BOM, CRLF line
/// endings, and trailing whitespace on the fence lines all parse. A document
/// with no frontmatter, or an unterminated opening fence, degrades to
/// `("", whole_document)` rather than erroring — a malformed skill must still
/// be readable, because reading it is how the user fixes it.
pub fn split_frontmatter(source: &str) -> (&str, &str) {
    frontmatter_lossless::split_lenient(source)
        .map(|ls| (ls.yaml, ls.body))
        .unwrap_or(("", source))
}

/// Reads a markdown file as UTF-8, keeping the path in the error.
///
/// Shared by [`read_detail`] and [`crate::vault`]: both open an
/// author-written markdown file, and a decode failure on one must read the
/// same as a decode failure on the other. `Io`/`InvalidData` is the variant
/// because it is the one that already carries the path a UI has to name.
pub(crate) fn read_utf8(vfs: &dyn Vfs, path: &Path) -> Result<String, CoreError> {
    let bytes = vfs.read_file(path)?;
    String::from_utf8(bytes).map_err(|e| {
        CoreError::io(
            path,
            std::io::Error::new(std::io::ErrorKind::InvalidData, e),
        )
    })
}

/// Pulls the list-shaped fields out of a frontmatter block.
///
/// Every field is optional and independently recoverable: frontmatter that is
/// not a YAML mapping, or whose `tags` is a scalar rather than a list, yields
/// what it can and reports the rest through the returned problem string.
pub(crate) fn parse_listing_fields(frontmatter: &str) -> (ListingFields, Option<String>) {
    if frontmatter.trim().is_empty() {
        return (ListingFields::default(), Some("no frontmatter".into()));
    }

    let value: serde_yaml::Value = match serde_yaml::from_str(frontmatter) {
        Ok(v) => v,
        Err(e) => {
            return (
                ListingFields::default(),
                Some(format!("invalid frontmatter: {e}")),
            );
        }
    };

    let Some(map) = value.as_mapping() else {
        return (
            ListingFields::default(),
            Some("frontmatter is not a mapping".into()),
        );
    };

    let string_field = |key: &str| {
        map.get(serde_yaml::Value::from(key))
            .and_then(|v| v.as_str())
            .map(str::to_owned)
    };

    let tags = map
        .get(serde_yaml::Value::from("tags"))
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();

    let fields = ListingFields {
        name: string_field("name"),
        description: string_field("description").unwrap_or_default(),
        tags,
    };

    // A skill with no description still lists; that is a quality signal the
    // roster surfaces, not a parse failure.
    (fields, None)
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct ListingFields {
    pub name: Option<String>,
    pub description: String,
    pub tags: Vec<String>,
}

/// The runtime owning a skill directory, inferred from its path.
///
/// Matches the *nearest* runtime directory at or above the skill, so a
/// `.claude/` inside a project inside a `.codex/` export resolves to the
/// inner one.
pub(crate) fn runtime_for(relative_dir: &Path) -> Option<String> {
    relative_dir
        .components()
        .rev()
        .filter_map(|c| match c {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .find_map(|name| {
            RUNTIME_DIRS
                .iter()
                .find(|(dir, _)| *dir == name)
                .map(|(_, runtime)| (*runtime).to_owned())
        })
}

/// Renders a relative path with forward slashes, so ids are stable across
/// platforms and safe to use as wire identifiers.
pub(crate) fn forward_slashed(path: &Path) -> String {
    path.components()
        .filter_map(|c| match c {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Reads one skill in full.
///
/// `relative_dir` is resolved against `root` and checked for containment
/// *lexically before touching the filesystem*, so a `../` traversal is
/// rejected rather than followed.
pub fn read_detail(
    vfs: &dyn Vfs,
    root: &crate::CorpusRoot,
    relative_dir: &str,
) -> Result<SkillDetail, CoreError> {
    let dir = resolve_within(&root.path, relative_dir)?;
    let skill_md = dir.join("SKILL.md");

    let source = read_utf8(vfs, &skill_md)?;
    let (frontmatter, body) = split_frontmatter(&source);

    Ok(SkillDetail {
        reference: build_ref(root, relative_dir, &source),
        frontmatter: frontmatter.to_owned(),
        body: body.to_owned(),
        files: supporting_files(vfs, &dir),
    })
}

/// Builds the list-shaped [`SkillRef`] for one skill from its `SKILL.md` text.
///
/// Shared by the scan and by [`read_detail`] on purpose: a roster row and the
/// header of the detail view that opens from it must never disagree about a
/// skill's name, and the only way to guarantee that is one construction site.
pub(crate) fn build_ref(root: &crate::CorpusRoot, relative_dir: &str, source: &str) -> SkillRef {
    let (frontmatter, _) = split_frontmatter(source);
    let (fields, problem) = parse_listing_fields(frontmatter);

    let fallback_name = Path::new(relative_dir)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unnamed")
        .to_owned();

    SkillRef {
        id: format!("{}:{}", root.id, relative_dir),
        root_id: root.id.clone(),
        name: fields.name.unwrap_or(fallback_name),
        description: fields.description,
        relative_dir: relative_dir.to_owned(),
        runtime: runtime_for(Path::new(relative_dir)),
        tags: fields.tags,
        problem,
    }
}

/// Joins `relative` onto `root`, rejecting anything that escapes.
///
/// Purely lexical: `..` and absolute components are refused outright rather
/// than canonicalised away, so the check does not depend on the path existing
/// and cannot be defeated by a symlink race.
///
/// # One rule, in one place
///
/// The rule itself is `agent_adapt::paths::join_within`, delegated to rather
/// than restated. The version this function used to carry matched on
/// [`Component`], which normalises before you can inspect it, so it accepted
/// four inputs the renderer's rule refuses: `./x` (`CurDir` is dropped by
/// `components()`), `a//b` (the empty segment is normalised away), `""` (zero
/// components — it yields the root itself rather than something inside it),
/// and `C:\…` off Windows (`Component::Prefix` never matches there). Two layers
/// of one product disagreeing about what a safe path is, is how a path that one
/// of them refuses gets written by the other.
///
/// The refusal stays [`CoreError::PathEscapesRoot`]: this is the *read* path,
/// where nothing is written and the hosts already name that variant. The write
/// path applies the same rule through [`crate::guard::resolve_write_path`] and
/// refuses `unsafe-path`, which is the token a host classifies as denied.
pub(crate) fn resolve_within(root: &Path, relative: &str) -> Result<PathBuf, CoreError> {
    agent_adapt::paths::join_within(root, relative)
        .map_err(|_| CoreError::PathEscapesRoot(PathBuf::from(relative)))
}

/// Files beside the `SKILL.md`, one level deep plus immediate subdirectories.
///
/// Bounded deliberately: a skill directory that happens to contain a
/// `node_modules` should not turn opening a skill into a full-tree walk.
/// Unreadable entries are skipped — a supporting-file listing is an aid, and
/// failing the whole detail view over one bad read would be the wrong trade.
///
/// `bytes` comes from reading the file rather than from a `stat`, because
/// [`Vfs`] deliberately has no `stat` (see its module doc). The bound above is
/// what makes that affordable: the reads are a skill's own peers, the same
/// files a publish is about to copy anyway.
fn supporting_files(vfs: &dyn Vfs, dir: &Path) -> Vec<SupportingFile> {
    fn collect(
        vfs: &dyn Vfs,
        base: &Path,
        dir: &Path,
        depth: usize,
        out: &mut Vec<SupportingFile>,
    ) {
        let Ok(entries) = vfs.read_dir(dir) else {
            return;
        };
        for entry in entries {
            let path = dir.join(&entry.name);
            if entry.is_dir {
                if depth > 0 {
                    collect(vfs, base, &path, depth - 1, out);
                }
                continue;
            }
            let Ok(rel) = path.strip_prefix(base) else {
                continue;
            };
            let rel = forward_slashed(rel);
            if rel == "SKILL.md" {
                continue;
            }
            let Ok(bytes) = vfs.read_file(&path) else {
                continue;
            };
            out.push(SupportingFile {
                path: rel,
                bytes: bytes.len() as u64,
            });
        }
    }

    let mut out = Vec::new();
    collect(vfs, dir, dir, 1, &mut out);
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::{CorpusRoot, RootKind};
    use crate::vfs::NativeVfs;

    #[test]
    fn splits_plain_frontmatter() {
        let (fm, body) = split_frontmatter("---\nname: a\n---\n# Title\n");
        assert_eq!(fm, "name: a");
        assert_eq!(body, "# Title\n");
    }

    #[test]
    fn tolerates_bom_and_crlf() {
        let (fm, body) = split_frontmatter("\u{feff}---\r\nname: a\r\n---\r\nbody\r\n");
        assert_eq!(fm, "name: a");
        assert_eq!(body, "body\r\n");
    }

    #[test]
    fn document_without_frontmatter_is_all_body() {
        let (fm, body) = split_frontmatter("# Just a heading\n");
        assert_eq!(fm, "");
        assert_eq!(body, "# Just a heading\n");
    }

    #[test]
    fn unterminated_fence_degrades_to_body_rather_than_erroring() {
        // A half-written skill must stay readable — reading it is how it gets fixed.
        let source = "---\nname: a\nstill going\n";
        let (fm, body) = split_frontmatter(source);
        assert_eq!(fm, "");
        assert_eq!(body, source);
    }

    #[test]
    fn empty_frontmatter_block_is_reported_but_not_fatal() {
        let (fields, problem) = parse_listing_fields("");
        assert_eq!(fields, ListingFields::default());
        assert_eq!(problem.as_deref(), Some("no frontmatter"));
    }

    #[test]
    fn parses_listing_fields() {
        let (fields, problem) = parse_listing_fields(
            "name: my-skill\ndescription: does a thing\ntags:\n  - a\n  - b\n",
        );
        assert_eq!(fields.name.as_deref(), Some("my-skill"));
        assert_eq!(fields.description, "does a thing");
        assert_eq!(fields.tags, vec!["a", "b"]);
        assert!(problem.is_none());
    }

    #[test]
    fn malformed_frontmatter_yields_a_problem_not_a_panic() {
        let (fields, problem) = parse_listing_fields("name: [unclosed\n");
        assert_eq!(fields, ListingFields::default());
        assert!(problem.unwrap().starts_with("invalid frontmatter:"));
    }

    #[test]
    fn scalar_tags_are_dropped_without_losing_the_rest() {
        // Tolerance matters more than strictness in a roster.
        let (fields, problem) = parse_listing_fields("name: a\ntags: not-a-list\n");
        assert_eq!(fields.name.as_deref(), Some("a"));
        assert!(fields.tags.is_empty());
        assert!(problem.is_none());
    }

    #[test]
    fn runtime_is_inferred_from_the_nearest_runtime_dir() {
        assert_eq!(
            runtime_for(Path::new(".claude/skills/foo")).as_deref(),
            Some("claude")
        );
        assert_eq!(
            runtime_for(Path::new("apps/x/.codex/skills/foo")).as_deref(),
            Some("codex")
        );
        // Nested exports resolve to the innermost runtime dir.
        assert_eq!(
            runtime_for(Path::new(".codex/vendor/.claude/skills/foo")).as_deref(),
            Some("claude")
        );
        // A plugin-native `skills/` layout belongs to no runtime.
        assert_eq!(runtime_for(Path::new("repo/tools/skills/foo")), None);
    }

    #[test]
    fn traversal_is_refused_lexically() {
        let root = Path::new("/corpus");
        for relative in [
            "../etc",
            "/etc/passwd",
            // The four the `Component`-matching version let through. Each is a
            // way of naming something other than a file inside the root, and
            // each is refused by the renderer, so each has to be refused here.
            "./x",
            "a//b",
            "",
            "C:\\Windows\\evil.md",
        ] {
            assert!(
                matches!(
                    resolve_within(root, relative),
                    Err(CoreError::PathEscapesRoot(_))
                ),
                "{relative:?} was not refused"
            );
        }
        assert_eq!(
            resolve_within(root, "skills/foo").unwrap(),
            PathBuf::from("/corpus/skills/foo")
        );
    }

    #[test]
    fn the_refusal_names_the_path_as_it_was_supplied() {
        // Unnormalised: a message that printed the folded form would name a
        // path the caller never wrote.
        let err = resolve_within(Path::new("/corpus"), "a/../../etc").unwrap_err();
        assert_eq!(err.to_string(), "path escapes its corpus root: a/../../etc");
    }

    #[test]
    fn reads_a_skill_in_full() {
        let dir = tempfile::tempdir().unwrap();
        let skill_dir = dir.path().join(".claude/skills/greeter");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: greeter\ndescription: says hi\n---\nBody here.\n",
        )
        .unwrap();
        std::fs::write(skill_dir.join("run.sh"), "echo hi\n").unwrap();
        std::fs::create_dir_all(skill_dir.join("templates")).unwrap();
        std::fs::write(skill_dir.join("templates/t.md"), "t").unwrap();

        let root = CorpusRoot::new("r", "R", dir.path(), RootKind::Registered);
        let detail = read_detail(&NativeVfs, &root, ".claude/skills/greeter").unwrap();

        assert_eq!(detail.reference.name, "greeter");
        assert_eq!(detail.reference.description, "says hi");
        assert_eq!(detail.reference.runtime.as_deref(), Some("claude"));
        assert_eq!(detail.reference.id, "r:.claude/skills/greeter");
        assert_eq!(detail.body, "Body here.\n");
        assert!(detail.reference.problem.is_none());

        // SKILL.md excluded; nested file included; deterministic order.
        let paths: Vec<_> = detail.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, vec!["run.sh", "templates/t.md"]);
    }

    #[test]
    fn name_falls_back_to_the_directory_when_frontmatter_lacks_one() {
        let dir = tempfile::tempdir().unwrap();
        let skill_dir = dir.path().join("skills/fallback-named");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "no frontmatter at all\n").unwrap();

        let root = CorpusRoot::new("r", "R", dir.path(), RootKind::Project);
        let detail = read_detail(&NativeVfs, &root, "skills/fallback-named").unwrap();

        assert_eq!(detail.reference.name, "fallback-named");
        assert_eq!(detail.reference.problem.as_deref(), Some("no frontmatter"));
        assert_eq!(detail.reference.runtime, None);
    }

    #[test]
    fn missing_skill_md_surfaces_the_path() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("skills/empty")).unwrap();
        let root = CorpusRoot::new("r", "R", dir.path(), RootKind::Project);

        let err = read_detail(&NativeVfs, &root, "skills/empty").unwrap_err();
        assert!(err.to_string().contains("SKILL.md"));
    }
}

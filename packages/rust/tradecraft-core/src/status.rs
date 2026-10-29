//! Publish state, without publishing: is this unit current at that
//! destination, and if not, what differs.
//!
//! # Status is a comparison, not a query
//!
//! There is no daemon and no database. The answer is computed on demand from
//! three things that are all already on disk: the notes, the destination, and
//! the manifest beside the output. That is what lets a destination be
//! answerable at all when it arrived from another machine, and what lets the
//! answer survive this app being reinstalled.
//!
//! # One code path, not two
//!
//! The classification a status needs is exactly the one a publish performs, so
//! this runs the publish in [`PublishMode::DryRun`] and reads its report.
//! Nothing is written — the dry run goes through the capturing overlay — and
//! the check cannot drift from the act, because there is only one act.
//!
//! A second implementation comparing hashes without rendering would be faster,
//! and would risk a status view that says `current` while a publish then
//! writes.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::guard::resolve_write_path;
use crate::manifest::{ManifestState, read_manifest};
use crate::namespace::Namespace;
use crate::publish::{
    PublishMode, PublishOutcome, PublishRequest, PublishStatus, PublishedFile, publish_skill,
};
use crate::vault::read_vault_skill;
use crate::vfs::Vfs;

/// One question: this unit, at this destination, for this target.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusRequest {
    /// Path of the skill's note.
    pub skill_path: PathBuf,
    /// Root of the destination to compare against.
    pub destination_root: PathBuf,
    /// The runtime target to project for.
    pub target: String,
    #[serde(default)]
    /// Root of the vault, when the caller knows it.
    pub skills_root: Option<PathBuf>,
}

/// What a unit's publish state is at one destination.
///
/// The closed set the status spec specify, and the same five words on every
/// surface. Two things that also need a cell in a grid are deliberately not
/// members: a destination whose target has no renderer, and a destination this
/// note's `sw-targets` excludes. Neither is a *manifest* state — one is
/// incapability and the other is deliberate exclusion — and folding them in
/// here would make them look like conditions a publish could fix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PublishState {
    /// The manifest records nothing for this unit here.
    NeverPublished,
    /// The destination matches. Publishing would write nothing.
    Current,
    /// The closure changed since the last publish. Publishing fixes it.
    Stale,
    /// A published file was edited at the destination, or a file we never
    /// wrote sits at one of our paths. Publishing refuses; a person decides.
    Conflict,
    /// The destination's manifest is unreadable — corrupt, or written by a
    /// later build. Not an error, and not the same as a destination with no
    /// manifest at all, which is `never-published`.
    Unknown,
}

impl PublishState {
    /// The wire token, which prose never varies from.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NeverPublished => "never-published",
            Self::Current => "current",
            Self::Stale => "stale",
            Self::Conflict => "conflict",
            Self::Unknown => "unknown",
        }
    }
}

/// The answer, and enough of the working to act on it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitStatus {
    /// Whether the destination is current.
    pub state: PublishState,
    /// A sentence naming what makes the state what it is, when there is one to
    /// name. `stale` alone is not actionable.
    pub reason: Option<String>,
    /// When we last wrote anything here, from the manifest.
    pub published_at: Option<String>,
    /// Every projected file, classified. This is the drift: what would be
    /// written, what is already right, and what is refused and why.
    pub files: Vec<PublishedFile>,
    /// The notes that fed this unit's output, as the manifest recorded them.
    /// A reverse lookup over these answers *what did editing this make stale*.
    pub contributing_notes: Vec<String>,
    /// Recorded contributors that are no longer in the vault.
    pub missing_notes: Vec<String>,
    /// Set when `sw-targets` excludes this destination — the `n/a` cell, which
    /// is not a state.
    pub not_published: Option<String>,
    /// A plugin whose members drifted since it was last published here, with
    /// its own `sw-version` unmoved since. `None` for every non-plugin unit,
    /// and for a plugin that does not meet the rule — see
    /// [`VersionBumpSuggestion`].
    pub version_bump_suggestion: Option<VersionBumpSuggestion>,
}

/// A plugin whose members changed since it was last published here, with its
/// own `sw-version` unmoved since — the callout
/// [`UnitStatus::version_bump_suggestion`] carries so a publish screen can
/// offer a one-click bump.
///
/// Not a sixth [`PublishState`]: the state stays `stale`, exactly as it would
/// without this. This is a suggestion about what to do next, not a verdict
/// about the destination.
///
/// # Where "the version at the last publish" comes from
///
/// The manifest records no version of its own — adding one would be a schema
/// bump for a fact the destination already carries. A plugin's pack manifest
/// (`plugin.json`) is written with whatever `sw-version` was current at
/// publish time, so the installed file's own `"version"` field IS that
/// record, read back rather than tracked twice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionBumpSuggestion {
    /// The note's current `sw-version`.
    pub current_version: String,
    /// The `version` the installed pack manifest carries. Equal to
    /// `current_version` by construction — a suggestion exists exactly
    /// because nothing moved to answer the members having changed.
    pub published_version: String,
}

/// Compute one unit's state at one destination.
///
/// Writes nothing.
pub fn status_of(
    vfs: &dyn Vfs,
    request: &StatusRequest,
    ns: &Namespace,
) -> Result<UnitStatus, CoreError> {
    let report = publish_skill(
        vfs,
        &PublishRequest {
            skill_path: request.skill_path.clone(),
            destination_root: request.destination_root.clone(),
            target: request.target.clone(),
            mode: PublishMode::DryRun,
            skills_root: request.skills_root.clone(),
            // A status takes no clock: it never writes, so no entry it
            // produces can reach a manifest, and stamping one would be
            // recording a moment nothing happened at.
            published_at: None,
            // A status acknowledges nothing. Overwriting is a decision taken
            // at a publish, by a person who has seen this.
            overwrite: Vec::new(),
        },
        ns,
    )?;

    if let Some(reason) = report.not_published {
        return Ok(UnitStatus {
            state: PublishState::NeverPublished,
            reason: Some(reason.clone()),
            published_at: None,
            files: Vec::new(),
            contributing_notes: Vec::new(),
            missing_notes: Vec::new(),
            not_published: Some(reason),
            version_bump_suggestion: None,
        });
    }

    let manifest = read_manifest(vfs, &request.destination_root);

    // The unit's own files: every row the classification produced, minus the
    // manifest's own, whose outcome tracks the record rather than the unit.
    let ours: Vec<_> = report
        .files
        .iter()
        .filter(|f| f.outcome != PublishOutcome::Manifest)
        .collect();

    // The manifest is read for what the report does not carry — when we last
    // wrote here, and which notes fed the output. The *state* is decided from
    // the report's own outcomes, below.
    let recorded: Vec<_> = match &manifest {
        ManifestState::Ok { manifest, .. } => report
            .files
            .iter()
            .filter_map(|f| manifest.get(&f.path))
            .collect(),
        _ => Vec::new(),
    };

    let mut contributing_notes: Vec<String> = recorded
        .iter()
        .flat_map(|e| e.contributing_notes.iter().cloned())
        .collect();
    contributing_notes.sort();
    contributing_notes.dedup();

    let vault_root = request.skills_root.clone();
    let missing_notes: Vec<String> = contributing_notes
        .iter()
        .filter(|note| match &vault_root {
            Some(root) => !vfs.exists(&root.join(note)),
            None => false,
        })
        .cloned()
        .collect();

    let published_at = recorded.iter().map(|e| e.published_at.clone()).max();

    // Order matters: an unusable manifest is the reason nothing else can be
    // said, and a conflict outranks staleness because publishing fixes the one
    // and refuses the other.
    //
    // `never-published` is *every* file being one this destination has no
    // record of, which the per-file outcomes say; anything short of that with
    // a write in it is drift.
    let unrecorded = |f: &&PublishedFile| {
        matches!(
            f.outcome,
            PublishOutcome::FirstWrite | PublishOutcome::Claimed | PublishOutcome::Overwritten
        )
    };
    let (state, reason) = if !manifest.is_usable() {
        (
            PublishState::Unknown,
            report
                .files
                .iter()
                .find_map(|f| f.reason.as_ref().map(ToString::to_string))
                .or_else(|| Some("the destination's manifest cannot be read".to_owned())),
        )
    } else if let Some(refused) = ours.iter().find(|f| f.status == PublishStatus::Refused) {
        (
            PublishState::Conflict,
            refused.reason.as_ref().map(ToString::to_string),
        )
    } else if ours.iter().all(unrecorded) {
        (PublishState::NeverPublished, None)
    } else if ours.iter().any(|f| f.status == PublishStatus::Written) {
        (PublishState::Stale, Some(stale_reason(&missing_notes)))
    } else {
        (PublishState::Current, None)
    };

    // Only ever attached beside `stale`: a plugin that is current or
    // conflicted has nothing here to suggest fixing.
    let version_bump_suggestion = if state == PublishState::Stale {
        plugin_version_bump_suggestion(vfs, request, &ours, ns)?
    } else {
        None
    };

    Ok(UnitStatus {
        state,
        reason,
        published_at,
        files: report.files,
        contributing_notes,
        missing_notes,
        not_published: None,
        version_bump_suggestion,
    })
}

/// The version-bump signal for one plugin's status, computed from data
/// [`status_of`] already has: the dry run's own files, and the vault note's
/// current identity.
///
/// `None` whenever the rule does not hold:
/// * this unit is not a plugin — no projected file ends `/plugin.json`;
/// * nothing about its MEMBERS changed. The pack manifest can drift on its
///   own (a description, an author, a keyword) without any member having
///   moved, and that is not this rule — only a member file among `ours`
///   reading [`PublishStatus::Written`] counts;
/// * `sw-version` is absent, or has already moved since the installed pack
///   manifest was written.
fn plugin_version_bump_suggestion(
    vfs: &dyn Vfs,
    request: &StatusRequest,
    ours: &[&PublishedFile],
    ns: &Namespace,
) -> Result<Option<VersionBumpSuggestion>, CoreError> {
    let Some(manifest_file) = ours.iter().find(|f| f.path.ends_with("/plugin.json")) else {
        return Ok(None);
    };
    let members_changed = ours
        .iter()
        .any(|f| f.path != manifest_file.path && f.status == PublishStatus::Written);
    if !members_changed {
        return Ok(None);
    }

    let note = read_vault_skill(vfs, &request.skill_path, ns)?;
    let Some(current_version) = note.frontmatter.identity.version else {
        return Ok(None);
    };

    // A resolve failure here is not this function's news to deliver — it is
    // advisory, and `status_of`'s own report already carries whatever the
    // rail has to say about this destination.
    let Ok(installed_path) =
        resolve_write_path(vfs, &request.destination_root, &manifest_file.path)
    else {
        return Ok(None);
    };

    Ok(version_bump_if_unmoved(
        vfs.read_file(&installed_path).ok().as_deref(),
        current_version,
    ))
}

/// The version-bump rule's tail: given that a plugin's members moved, does
/// the installed pack manifest still carry the version the vault currently
/// declares?
///
/// Shared by [`status_of`] and the marketplace export's own diff. The two
/// reach this point differently — one from a publish's per-file outcomes and
/// a note's frontmatter, the other from a byte comparison and the build's
/// configuration — but the question they arrive at is one question, and two
/// spellings of it could answer differently.
///
/// `None` for an unreadable or unparseable manifest, and for one whose
/// version has already moved: a bump that has happened is not a bump to
/// suggest.
pub(crate) fn version_bump_if_unmoved(
    installed_manifest: Option<&[u8]>,
    current_version: String,
) -> Option<VersionBumpSuggestion> {
    let published_version = serde_json::from_slice::<serde_json::Value>(installed_manifest?)
        .ok()?
        .get("version")
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)?;
    (published_version == current_version).then_some(VersionBumpSuggestion {
        current_version,
        published_version,
    })
}

/// Which units at this destination a change to `note` would make stale.
///
/// The reverse lookup the manifest's `contributing_notes` exists for: an
/// answer by scan rather than by re-expanding every skill in the vault. `note`
/// is vault-relative, spelled as the manifest spells it.
pub fn units_depending_on(
    vfs: &dyn Vfs,
    destination_root: &std::path::Path,
    note: &str,
) -> Vec<String> {
    let ManifestState::Ok { manifest, .. } = read_manifest(vfs, destination_root) else {
        return Vec::new();
    };
    let mut notes: Vec<String> = manifest
        .entries()
        .filter(|entry| entry.contributing_notes.iter().any(|n| n == note))
        .map(|entry| entry.source_note.clone())
        .collect();
    notes.sort();
    notes.dedup();
    notes
}

/// Staleness has to name its cause, and this is as far as the recorded shape
/// allows.
///
/// A vanished contributor is nameable — the manifest holds the paths and the
/// vault either has them or does not. *Which surviving member changed* is not:
/// the entry records one hash over the whole closure, so the comparison that
/// detects the change cannot attribute it. Naming that would need a hash per
/// member, which the schema the publish spec specifies does not
/// carry.
fn stale_reason(missing: &[String]) -> String {
    if missing.is_empty() {
        "the notes that produced this output have changed since it was published".to_owned()
    } else {
        format!(
            "a note this output was built from is gone from the vault: {}",
            missing.join(", ")
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vfs::MemVfs;
    use std::path::Path;

    const NOTE: &str = "---\nname: code-review\ndescription: Reviews a diff.\n---\n\n\
                        ![[reviewer]]\n";

    /// A vault whose skill embeds a shared snippet — the shape staleness is
    /// defined against — and an empty destination beside it.
    fn vault() -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills/snippets"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/snippets/reviewer.md"),
            b"---\ntag: fragment\n---\n\nBe a senior reviewer.\n",
        )
        .unwrap();
        vfs.write_file(Path::new("/vault/skills/code-review.md"), NOTE.as_bytes())
            .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    fn ask() -> StatusRequest {
        StatusRequest {
            skill_path: PathBuf::from("/vault/skills/code-review.md"),
            destination_root: PathBuf::from("/dest"),
            target: "claude".to_owned(),
            skills_root: Some(PathBuf::from("/vault")),
        }
    }

    fn publish(vfs: &MemVfs) {
        publish_skill(
            vfs,
            &PublishRequest {
                skill_path: PathBuf::from("/vault/skills/code-review.md"),
                destination_root: PathBuf::from("/dest"),
                target: "claude".to_owned(),
                mode: PublishMode::Write,
                skills_root: Some(PathBuf::from("/vault")),
                published_at: Some("2026-08-29T10:00:00Z".to_owned()),
                overwrite: Vec::new(),
            },
            &Namespace::default(),
        )
        .unwrap();
    }

    fn state_of(vfs: &MemVfs) -> UnitStatus {
        status_of(vfs, &ask(), &Namespace::default()).unwrap()
    }

    #[test]
    fn a_destination_we_have_never_written_to_is_never_published() {
        let vfs = vault();
        let status = state_of(&vfs);
        assert_eq!(status.state, PublishState::NeverPublished);
        assert_eq!(status.published_at, None);
    }

    #[test]
    fn a_destination_that_matches_is_current() {
        let vfs = vault();
        publish(&vfs);

        let status = state_of(&vfs);
        assert_eq!(status.state, PublishState::Current);
        assert_eq!(status.reason, None);
        assert_eq!(status.published_at.as_deref(), Some("2026-08-29T10:00:00Z"));
        assert!(
            status
                .files
                .iter()
                .all(|f| f.status != PublishStatus::Written),
            "{:?}",
            status.files
        );
    }

    #[test]
    fn an_edited_note_is_stale() {
        let vfs = vault();
        publish(&vfs);
        vfs.write_file(
            Path::new("/vault/skills/code-review.md"),
            b"---\nname: code-review\ndescription: Reviews a diff, carefully.\n---\n\nNew.\n",
        )
        .unwrap();

        assert_eq!(state_of(&vfs).state, PublishState::Stale);
    }

    // The case the whole closure design exists for. The skill note is not
    // touched; the bytes that belong at the destination change anyway.
    #[test]
    fn editing_an_embedded_note_makes_a_skill_stale_that_did_not_change() {
        let vfs = vault();
        publish(&vfs);
        assert_eq!(state_of(&vfs).state, PublishState::Current);

        vfs.write_file(
            Path::new("/vault/skills/snippets/reviewer.md"),
            b"---\ntag: fragment\n---\n\nBe a *staff* reviewer.\n",
        )
        .unwrap();

        let status = state_of(&vfs);
        assert_eq!(status.state, PublishState::Stale);
        assert!(
            status
                .contributing_notes
                .contains(&"skills/snippets/reviewer.md".to_owned()),
            "{:?}",
            status.contributing_notes
        );
    }

    // Publishing fixes staleness and will not fix this, so it is its own
    // state rather than a kind of stale.
    #[test]
    fn a_file_edited_at_the_destination_is_a_conflict_not_stale() {
        let vfs = vault();
        publish(&vfs);
        vfs.write_file(
            Path::new("/dest/.claude/skills/code-review/SKILL.md"),
            b"# Edited by hand at the destination\n",
        )
        .unwrap();

        let status = state_of(&vfs);
        assert_eq!(status.state, PublishState::Conflict);
        let reason = status.reason.as_deref().expect("a conflict names itself");
        assert!(reason.starts_with("conflict: "), "{reason}");
    }

    // "A manifest we cannot read makes status unknown — never never-published,
    // and never an error."
    #[test]
    fn an_unreadable_manifest_is_unknown_and_not_an_error() {
        let vfs = vault();
        publish(&vfs);
        vfs.write_file(
            &crate::manifest::manifest_path(Path::new("/dest")),
            b"{ truncated",
        )
        .unwrap();

        let status = state_of(&vfs);
        assert_eq!(status.state, PublishState::Unknown);
        assert!(
            status
                .reason
                .as_deref()
                .is_some_and(|r| r.starts_with("bad-manifest: ")),
            "{:?}",
            status.reason
        );
    }

    #[test]
    fn a_destination_with_only_the_old_folder_is_unknown_with_the_rename_hint() {
        let vfs = vault();
        vfs.create_dir_all(Path::new("/dest/.tradecraft")).unwrap();
        vfs.write_file(Path::new("/dest/.tradecraft/manifest.json"), b"{}")
            .unwrap();

        let status = state_of(&vfs);
        assert_eq!(status.state, PublishState::Unknown);
        let reason = status.reason.unwrap();
        assert!(reason.starts_with("bad-manifest: "), "{reason}");
        assert!(
            reason.contains("rename .tradecraft/ to .skillwright/"),
            "{reason}"
        );
    }

    // A contributor that is simply gone is nameable, and naming it is the
    // difference between a status somebody can act on and one they cannot.
    #[test]
    fn a_contributor_that_vanished_from_the_vault_is_named() {
        let vfs = vault();
        publish(&vfs);
        vfs.remove(Path::new("/vault/skills/snippets/reviewer.md"))
            .unwrap();

        let status = state_of(&vfs);
        assert_eq!(
            status.missing_notes,
            vec!["skills/snippets/reviewer.md".to_owned()]
        );
        assert!(
            status
                .reason
                .as_deref()
                .is_some_and(|r| r.contains("skills/snippets/reviewer.md")),
            "{:?}",
            status.reason
        );
    }

    // The reverse direction: given a note somebody is about to edit, which
    // units does it feed. A scan of what is recorded, not a re-expansion.
    #[test]
    fn the_reverse_lookup_finds_the_units_a_shared_note_feeds() {
        let vfs = vault();
        publish(&vfs);

        assert_eq!(
            units_depending_on(&vfs, Path::new("/dest"), "skills/snippets/reviewer.md"),
            vec!["skills/code-review.md".to_owned()]
        );
        assert!(units_depending_on(&vfs, Path::new("/dest"), "skills/nobody.md").is_empty());
    }

    #[test]
    fn asking_for_a_status_writes_nothing() {
        let vfs = vault();
        publish(&vfs);
        let before = vfs.read_file(Path::new("/dest/.claude/skills/code-review/SKILL.md"));

        // Against a destination we have never touched, too — the one where a
        // careless implementation would create directories.
        let mut fresh = ask();
        fresh.destination_root = PathBuf::from("/untouched");
        status_of(&vfs, &fresh, &Namespace::default()).unwrap();
        state_of(&vfs);

        assert!(!vfs.exists(Path::new("/untouched/.claude")));
        assert!(!vfs.exists(&crate::manifest::manifest_path(Path::new("/untouched"))));
        assert_eq!(
            vfs.read_file(Path::new("/dest/.claude/skills/code-review/SKILL.md"))
                .ok(),
            before.ok()
        );
    }

    // `sw-targets` excluding a destination is not a publish state — nothing is
    // wrong and nothing would be fixed by publishing.
    #[test]
    fn a_destination_the_note_excludes_reports_itself_separately() {
        let vfs = vault();
        vfs.write_file(
            Path::new("/vault/skills/code-review.md"),
            b"---\nname: code-review\ndescription: d\nsw-targets:\n  - codex\n---\n\nBody.\n",
        )
        .unwrap();

        let status = state_of(&vfs);
        assert!(status.not_published.is_some(), "{status:?}");
        assert!(status.files.is_empty());
    }

    // --- Version bump suggestions -----------------------------------------

    /// A plugin note with one member — the shape the suggestion is computed
    /// over.
    fn vault_with_plugin() -> MemVfs {
        let vfs = MemVfs::new();
        let base = "/vault/marketplaces/house/plugins/git-tools";
        vfs.create_dir_all(Path::new(&format!("{base}/skills")))
            .unwrap();
        vfs.write_file(
            Path::new(&format!("{base}/git-tools.md")),
            b"---\nname: git-tools\ndescription: Git helpers.\nsw-kind: plugin\nsw-version: 2.1.0\n---\n\nThe pack.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new(&format!("{base}/skills/commit-helper.md")),
            b"---\nname: commit-helper\ndescription: Writes commits.\n---\n\nCommit well.\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    const PLUGIN_NOTE: &str = "/vault/marketplaces/house/plugins/git-tools/git-tools.md";

    fn plugin_ask() -> StatusRequest {
        StatusRequest {
            skill_path: PathBuf::from(PLUGIN_NOTE),
            destination_root: PathBuf::from("/dest"),
            target: "claude".to_owned(),
            skills_root: Some(PathBuf::from("/vault")),
        }
    }

    fn publish_plugin(vfs: &MemVfs) {
        publish_skill(
            vfs,
            &PublishRequest {
                skill_path: PathBuf::from(PLUGIN_NOTE),
                destination_root: PathBuf::from("/dest"),
                target: "claude".to_owned(),
                mode: PublishMode::Write,
                skills_root: Some(PathBuf::from("/vault")),
                published_at: Some("2026-08-29T10:00:00Z".to_owned()),
                overwrite: Vec::new(),
            },
            &Namespace::default(),
        )
        .unwrap();
    }

    fn plugin_state_of(vfs: &MemVfs) -> UnitStatus {
        status_of(vfs, &plugin_ask(), &Namespace::default()).unwrap()
    }

    // The case the callout exists for: a member changed and nothing moved
    // `sw-version` to say so.
    #[test]
    fn a_changed_member_with_an_unmoved_version_suggests_a_bump() {
        let vfs = vault_with_plugin();
        publish_plugin(&vfs);

        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md"),
            b"---\nname: commit-helper\ndescription: Writes better commits.\n---\n\nCommit well.\n",
        )
        .unwrap();

        let status = plugin_state_of(&vfs);
        assert_eq!(status.state, PublishState::Stale);
        assert_eq!(
            status.version_bump_suggestion,
            Some(VersionBumpSuggestion {
                current_version: "2.1.0".to_owned(),
                published_version: "2.1.0".to_owned(),
            })
        );
    }

    // The author already answered the drift, so there is nothing left to
    // suggest.
    #[test]
    fn a_changed_member_with_a_moved_version_suggests_nothing() {
        let vfs = vault_with_plugin();
        publish_plugin(&vfs);

        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md"),
            b"---\nname: commit-helper\ndescription: Writes better commits.\n---\n\nCommit well.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new(PLUGIN_NOTE),
            b"---\nname: git-tools\ndescription: Git helpers.\nsw-kind: plugin\nsw-version: 2.2.0\n---\n\nThe pack.\n",
        )
        .unwrap();

        let status = plugin_state_of(&vfs);
        assert_eq!(status.state, PublishState::Stale);
        assert_eq!(status.version_bump_suggestion, None);
    }

    // Nothing changed, so the state is `current` and there is nothing to
    // suggest either.
    #[test]
    fn an_unchanged_plugin_suggests_nothing() {
        let vfs = vault_with_plugin();
        publish_plugin(&vfs);

        let status = plugin_state_of(&vfs);
        assert_eq!(status.state, PublishState::Current);
        assert_eq!(status.version_bump_suggestion, None);
    }

    // A skill note is never a plugin, so it never carries a suggestion even
    // while stale.
    #[test]
    fn a_plain_skill_never_suggests_a_bump() {
        let vfs = vault();
        publish(&vfs);
        vfs.write_file(
            Path::new("/vault/skills/code-review.md"),
            b"---\nname: code-review\ndescription: Reviews a diff, carefully.\n---\n\nNew.\n",
        )
        .unwrap();

        let status = state_of(&vfs);
        assert_eq!(status.state, PublishState::Stale);
        assert_eq!(status.version_bump_suggestion, None);
    }
}

//! The destination manifest — what we wrote there, from which note, and when.
//!
//! One manifest per destination root, at a fixed relative path, keyed by
//! root-relative forward-slashed path. It is bookkeeping placed beside the
//! output it describes, not inside it: no emitted file carries a marker,
//! because the Agent Skills standard allows six frontmatter fields and none of
//! ours is among them.
//!
//! # Why a file at the destination rather than a database
//!
//! It travels with the directory: a destination copied to another machine,
//! restored from a backup, or read by another tool carries its own record of
//! what is in it. The vault model has no database to put a central table in.
//!
//! # The two hashes
//!
//! `source_hash` covers the transitive closure of notes that fed the emitted
//! file, and answers *did the source move*. `emitted_hash` covers the bytes
//! actually written, and answers *was the copy edited* — the question the
//! collision rules turn on. One hash cannot answer both.
//!
//! `contributing_notes` and `unresolved` are recorded beside them so staleness
//! can name its cause and so a link that did not resolve is not silently
//! absent from the closure — a note appearing at that name later changes the
//! output while leaving the hash identical.
//!
//! # What this module does not do
//!
//! It reads, writes and holds. It does not classify: deciding what a file's
//! state is from (what we would write, what is on disk, what this recorded) is
//! [`crate::publish`]'s, and it takes this as one of its three inputs.
//!
//! # One specified rule this cannot enforce
//!
//! The publish spec's rule that two destinations resolving to one
//! manifest are a blocker for both is not detectable here. It would need the
//! manifest to record the root it belongs to, and the schema that document
//! specifies has no such field. Adding one unilaterally would put this build's
//! output out of step with the written format, so the rule is left unenforced
//! and named rather than quietly satisfied. Two roots reaching one file (via a
//! link, or two spellings of one directory) currently share it, and their
//! sweeps would disagree about what is orphaned.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::vfs::Vfs;

/// The manifest folder's earlier names, newest first. Only named to refuse
/// them with a rename hint.
const OLD_FOLDERS: [&str; 2] = [".tradecraft", ".agent-pants"];

/// Where the manifest sits under a destination root.
///
/// Namespaced under a dot-directory of our own rather than dropped at the
/// root, because a destination root is a project root: it belongs to the user,
/// and a bare `manifest.json` beside their source tree is a collision waiting
/// to happen.
pub const MANIFEST_RELATIVE_PATH: &str = ".skillwright/manifest.json";

/// The folder [`MANIFEST_RELATIVE_PATH`] sits in.
const MANIFEST_FOLDER: &str = ".skillwright";

/// The schema this build writes, and the highest it can read.
pub const SCHEMA_VERSION: u32 = 1;

/// One emitted file, as we last wrote it.
///
/// Field order here is the serialised key order — the file is compared byte
/// for byte by anything checking whether a run changed it, so the order is
/// part of the format rather than a detail of the struct.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestEntry {
    /// Destination-root-relative, forward-slashed. The key.
    pub path: String,
    /// The canonical target this file was rendered for.
    pub target: String,
    /// The vault-relative note that owns the emitted file.
    pub source_note: String,
    /// Hash over the closure — every note whose bytes the compiler consumed.
    pub source_hash: String,
    /// The closure's members, vault-relative and sorted. Recorded as well as
    /// hashed so "what did editing this make stale" is a reverse lookup.
    #[serde(default)]
    pub contributing_notes: Vec<String>,
    /// Link names the compile could not resolve, sorted. A note appearing at
    /// one of these later is a change the closure hash alone cannot see.
    #[serde(default)]
    pub unresolved: Vec<String>,
    /// Skills this file calls, as `plugin:name`, sorted. Omitted when empty,
    /// so a manifest with no calls reads as it always did.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub calls: Vec<String>,
    /// Hash over the bytes actually written.
    pub emitted_hash: String,
    /// The execute bit as published, so a comparison has something to compare
    /// against on a filesystem that cannot hold a mode.
    pub executable: bool,
    /// When this entry's `emitted_hash` last changed. Not when the run
    /// happened — a run that writes nothing moves no timestamp.
    pub published_at: String,
}

/// Everything one destination root records, keyed by path.
///
/// A `BTreeMap` rather than a `Vec` because the serialised form must be
/// sorted, and sorting on the way out invites a caller that forgets to.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DestinationManifest {
    entries: BTreeMap<String, ManifestEntry>,
}

impl DestinationManifest {
    /// An empty manifest — what a destination we have never written to has.
    pub fn new() -> Self {
        Self::default()
    }

    /// What we recorded for one path, if anything.
    pub fn get(&self, path: &str) -> Option<&ManifestEntry> {
        self.entries.get(path)
    }

    /// Record an entry, replacing any entry at the same path.
    pub fn insert(&mut self, entry: ManifestEntry) {
        self.entries.insert(entry.path.clone(), entry);
    }

    /// Forget one path.
    pub fn remove(&mut self, path: &str) -> Option<ManifestEntry> {
        self.entries.remove(path)
    }

    /// Every entry, in path order.
    pub fn entries(&self) -> impl Iterator<Item = &ManifestEntry> {
        self.entries.values()
    }

    /// Every path this manifest claims, in order.
    pub fn paths(&self) -> impl Iterator<Item = &str> {
        self.entries.keys().map(String::as_str)
    }

    /// The number of paths the manifest claims.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the manifest claims no paths.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// The serialised bytes, deterministically.
    ///
    /// Sorted entries, fixed key order, two-space indent, one trailing
    /// newline. Two runs producing the same state produce the same bytes,
    /// which is what lets a run in which every file is `unchanged` leave the
    /// manifest byte-identical and report itself `unchanged` too.
    pub fn to_json(&self) -> String {
        let wire = Wire {
            schema_version: SCHEMA_VERSION,
            entries: self.entries.values().cloned().collect(),
        };
        let mut buffer = Vec::new();
        let formatter = serde_json::ser::PrettyFormatter::with_indent(b"  ");
        let mut serializer = serde_json::Serializer::with_formatter(&mut buffer, formatter);
        wire.serialize(&mut serializer)
            .expect("manifest types serialize infallibly");
        let mut out = String::from_utf8(buffer).expect("serde_json emits UTF-8");
        out.push('\n');
        out
    }
}

/// The on-disk shape. Separate from [`DestinationManifest`] so the in-memory
/// type can be a map while the file stays a sorted list.
#[derive(Debug, Serialize, Deserialize)]
struct Wire {
    schema_version: u32,
    entries: Vec<ManifestEntry>,
}

/// Why a destination's manifest cannot be used.
///
/// Every reading blocks writing at that destination and degrades status to
/// `unknown`; they are separate because the recovery differs and a report has
/// to say which happened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Unusable {
    /// The bytes are not a manifest: truncated, not JSON, or JSON of the wrong
    /// shape. Carries the parser's complaint.
    Corrupt(String),
    /// Written by a later build than this one. Reading it would silently drop
    /// fields we do not model, and writing it back would delete them.
    NewerSchema {
        /// The schema version found in the file.
        found: u32,
    },
    /// The destination has a manifest under an old folder, which this
    /// carries (for example `.tradecraft`), and none under `.skillwright/`.
    /// The old one is not read; the owner renames the folder.
    OldFolder(&'static str),
}

impl Unusable {
    /// The sentence a report shows, after the `bad-manifest` token.
    pub fn message(&self, path: &Path) -> String {
        match self {
            Self::Corrupt(why) => format!(
                "{} cannot be read: {why}. Re-initialising is explicit — it reclassifies \
                 everything at this destination as foreign",
                path.display()
            ),
            Self::NewerSchema { found } => format!(
                "{} was written by a newer build (schema {found}, this build reads \
                 {SCHEMA_VERSION}). Update rather than overwrite — writing it back would \
                 drop what this build cannot read",
                path.display()
            ),
            Self::OldFolder(folder) => format!(
                "{} is under the old {folder}/ folder: rename {folder}/ to {}/",
                old_manifest_path_beside(path, folder).display(),
                MANIFEST_FOLDER,
            ),
        }
    }
}

/// The old manifest's path, from the new manifest's path
/// (`<root>/.skillwright/manifest.json`): the same file name one folder over.
fn old_manifest_path_beside(manifest: &Path, folder: &str) -> PathBuf {
    let root = manifest
        .parent()
        .and_then(Path::parent)
        .unwrap_or_else(|| Path::new(""));
    root.join(folder).join("manifest.json")
}

/// The old manifest's path under a destination root, for the old-folder
/// error's one report row.
pub(crate) fn old_manifest_relative_path(folder: &str) -> String {
    format!("{folder}/manifest.json")
}

/// What reading a destination's manifest found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManifestState {
    /// A manifest we can use.
    Ok {
        /// The manifest that was read.
        manifest: DestinationManifest,
        /// Entries whose path does not stay inside the root. Dropped rather
        /// than acted on, and reported rather than dropped silently — a path
        /// we would refuse to write is a path we must refuse to sweep.
        dropped: Vec<String>,
    },
    /// No manifest here. A complete fact, not an error: we have no record, so
    /// everything at this destination is foreign and nothing is at risk.
    Missing,
    /// A manifest that exists and cannot be used. A partial fact, which is why
    /// it blocks where [`ManifestState::Missing`] does not.
    Unusable(Unusable),
}

impl ManifestState {
    /// The manifest to classify against — empty when there is none.
    ///
    /// Callers that must not proceed on an unusable manifest check for
    /// [`ManifestState::Unusable`] first; this is for the ones that only need
    /// "what do you have", where missing and unusable both mean nothing.
    pub fn manifest(&self) -> DestinationManifest {
        match self {
            Self::Ok { manifest, .. } => manifest.clone(),
            Self::Missing | Self::Unusable(_) => DestinationManifest::new(),
        }
    }

    /// Is this a manifest a publish may write beside?
    pub fn is_usable(&self) -> bool {
        !matches!(self, Self::Unusable(_))
    }
}

/// Where the manifest for this destination root lives.
pub fn manifest_path(destination_root: &Path) -> PathBuf {
    let mut path = destination_root.to_path_buf();
    for segment in MANIFEST_RELATIVE_PATH.split('/') {
        path.push(segment);
    }
    path
}

/// Read one destination's manifest.
///
/// Never returns `Err` for a manifest problem — a manifest we cannot read is a
/// state, not a failure, and every caller has to keep going and report it.
/// An unreadable *filesystem* is the one exception: a directory we cannot
/// stat is not the same claim as a manifest that is not there.
pub fn read_manifest(vfs: &dyn Vfs, destination_root: &Path) -> ManifestState {
    let path = manifest_path(destination_root);
    if !vfs.exists(&path) {
        if let Some(folder) = OLD_FOLDERS
            .into_iter()
            .find(|folder| vfs.exists(&destination_root.join(folder).join("manifest.json")))
        {
            return ManifestState::Unusable(Unusable::OldFolder(folder));
        }
        return ManifestState::Missing;
    }
    let bytes = match vfs.read_file(&path) {
        Ok(bytes) => bytes,
        Err(err) => return ManifestState::Unusable(Unusable::Corrupt(err.to_string())),
    };

    // Version before shape. A newer build may have changed the entry shape
    // too, and "did not parse" would be a misleading thing to say about a file
    // we simply do not understand yet.
    let probe: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(value) => value,
        Err(err) => return ManifestState::Unusable(Unusable::Corrupt(err.to_string())),
    };
    let found = match probe
        .get("schema_version")
        .and_then(serde_json::Value::as_u64)
    {
        Some(found) => found,
        None => {
            return ManifestState::Unusable(Unusable::Corrupt(
                "no schema_version — this is not a destination manifest".to_owned(),
            ));
        }
    };
    if found > u64::from(SCHEMA_VERSION) {
        return ManifestState::Unusable(Unusable::NewerSchema {
            found: found.min(u64::from(u32::MAX)) as u32,
        });
    }

    let wire: Wire = match serde_json::from_slice(&bytes) {
        Ok(wire) => wire,
        Err(err) => return ManifestState::Unusable(Unusable::Corrupt(err.to_string())),
    };

    let mut manifest = DestinationManifest::new();
    let mut dropped = Vec::new();
    for entry in wire.entries {
        if stays_inside(destination_root, &entry.path) {
            manifest.insert(entry);
        } else {
            dropped.push(entry.path);
        }
    }
    dropped.sort();
    ManifestState::Ok { manifest, dropped }
}

/// Write a destination's manifest, creating its directory.
///
/// Returns whether the bytes changed, so a caller can report the manifest like
/// any other file and so a run that changed nothing does not claim to have
/// written one.
pub fn write_manifest(
    vfs: &dyn Vfs,
    destination_root: &Path,
    manifest: &DestinationManifest,
) -> Result<bool, CoreError> {
    let path = manifest_path(destination_root);
    let next = manifest.to_json();
    if vfs.exists(&path) && vfs.read_file(&path)? == next.as_bytes() {
        return Ok(false);
    }
    if let Some(parent) = path.parent() {
        vfs.create_dir_all(parent)?;
    }
    vfs.write_file(&path, next.as_bytes())?;
    Ok(true)
}

/// Does this recorded path still land inside the root it was recorded for?
///
/// The same lexical rule the write path applies, so a path we would refuse to
/// write is a path we refuse to act on when we read it back. Absolute paths,
/// `..` escapes and empty strings all fail here.
fn stays_inside(destination_root: &Path, relative: &str) -> bool {
    agent_adapt::paths::join_within(destination_root, relative).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vfs::MemVfs;

    fn entry(path: &str) -> ManifestEntry {
        ManifestEntry {
            path: path.to_owned(),
            target: "claude".to_owned(),
            source_note: "skills/code-review.md".to_owned(),
            source_hash: "sha256:aaa".to_owned(),
            contributing_notes: vec![
                "skills/code-review.md".to_owned(),
                "skills/snippets/reviewer.md".to_owned(),
            ],
            unresolved: vec!["house-style".to_owned()],
            calls: Vec::new(),
            emitted_hash: "sha256:bbb".to_owned(),
            executable: false,
            published_at: "2026-08-29T10:00:00Z".to_owned(),
        }
    }

    fn root() -> &'static Path {
        Path::new("/dest")
    }

    #[test]
    fn the_manifest_sits_under_the_destination_root() {
        assert_eq!(
            manifest_path(root()),
            Path::new("/dest/.skillwright/manifest.json")
        );
    }

    // Missing is a complete fact — there is no record, so nothing is at
    // risk — and it must not read as an error.
    #[test]
    fn a_destination_with_no_manifest_reads_missing() {
        let vfs = MemVfs::new();
        assert_eq!(read_manifest(&vfs, root()), ManifestState::Missing);
        assert!(read_manifest(&vfs, root()).is_usable());
    }

    // An old folder is refused with a rename hint, not read.
    #[test]
    fn a_manifest_under_an_old_folder_is_unusable_with_a_rename_hint() {
        for folder in [".tradecraft", ".agent-pants"] {
            let vfs = MemVfs::new();
            let old = Path::new("/dest").join(folder);
            vfs.create_dir_all(&old).unwrap();
            vfs.write_file(&old.join("manifest.json"), b"{}").unwrap();
            let state = read_manifest(&vfs, root());
            assert_eq!(state, ManifestState::Unusable(Unusable::OldFolder(folder)));
            let ManifestState::Unusable(why) = state else {
                unreachable!()
            };
            assert_eq!(
                why.message(&manifest_path(root())),
                format!(
                    "/dest/{folder}/manifest.json is under the old {folder}/ folder: \
                     rename {folder}/ to .skillwright/"
                )
            );
        }
    }

    // The new folder wins: the old one is not looked at, and nothing errors.
    #[test]
    fn both_manifest_folders_present_reads_the_new_one() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/dest/.agent-pants")).unwrap();
        vfs.write_file(Path::new("/dest/.agent-pants/manifest.json"), b"{ junk")
            .unwrap();
        write_manifest(&vfs, root(), &DestinationManifest::new()).unwrap();
        let state = read_manifest(&vfs, root());
        assert!(matches!(state, ManifestState::Ok { .. }), "{state:?}");
    }

    // Corrupt is a partial fact — possibly a truncated file we wrote —
    // so it blocks where missing does not.
    #[test]
    fn a_manifest_that_is_not_json_is_unusable_and_says_why() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/dest/.skillwright")).unwrap();
        vfs.write_file(&manifest_path(root()), b"{ truncated")
            .unwrap();

        let state = read_manifest(&vfs, root());
        assert!(!state.is_usable());
        let ManifestState::Unusable(reason) = &state else {
            panic!("expected unusable, got {state:?}");
        };
        assert!(matches!(reason, Unusable::Corrupt(_)), "{reason:?}");
        let message = reason.message(&manifest_path(root()));
        assert!(
            message.contains("/dest/.skillwright/manifest.json"),
            "{message}"
        );
        assert!(message.contains("Re-initialising is explicit"), "{message}");
    }

    // Reading a newer file would drop fields we do not model, and writing
    // it back would delete them.
    #[test]
    fn a_newer_schema_version_is_unusable_and_names_both_versions() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/dest/.skillwright")).unwrap();
        vfs.write_file(
            &manifest_path(root()),
            br#"{"schema_version": 99, "entries": []}"#,
        )
        .unwrap();

        let state = read_manifest(&vfs, root());
        let ManifestState::Unusable(reason) = &state else {
            panic!("expected unusable, got {state:?}");
        };
        assert_eq!(*reason, Unusable::NewerSchema { found: 99 });
        let message = reason.message(&manifest_path(root()));
        assert!(message.contains("schema 99"), "{message}");
        assert!(message.contains("reads 1"), "{message}");
    }

    // Well-formed JSON that is not ours reads as corrupt rather than as an
    // empty manifest — an empty manifest would re-arm the sweep against a
    // false baseline.
    #[test]
    fn json_without_a_schema_version_is_not_a_manifest() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/dest/.skillwright")).unwrap();
        vfs.write_file(&manifest_path(root()), br#"{"hello": "world"}"#)
            .unwrap();

        let ManifestState::Unusable(Unusable::Corrupt(why)) = read_manifest(&vfs, root()) else {
            panic!("expected corrupt");
        };
        assert!(why.contains("not a destination manifest"), "{why}");
    }

    // A path we would refuse to write is a path we refuse to act on when
    // we read it back — otherwise a sweep could remove something outside the
    // root we were given.
    #[test]
    fn an_entry_whose_path_escapes_the_root_is_dropped_and_reported() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/dest/.skillwright")).unwrap();
        let mut manifest = DestinationManifest::new();
        manifest.insert(entry(".claude/skills/ok/SKILL.md"));
        let mut escaping = entry("../elsewhere/SKILL.md");
        escaping.path = "../elsewhere/SKILL.md".to_owned();
        manifest.insert(escaping);
        let mut absolute = entry("/etc/passwd");
        absolute.path = "/etc/passwd".to_owned();
        manifest.insert(absolute);
        vfs.write_file(&manifest_path(root()), manifest.to_json().as_bytes())
            .unwrap();

        let ManifestState::Ok { manifest, dropped } = read_manifest(&vfs, root()) else {
            panic!("expected a usable manifest");
        };
        assert_eq!(manifest.len(), 1);
        assert!(manifest.get(".claude/skills/ok/SKILL.md").is_some());
        assert_eq!(
            dropped,
            vec!["../elsewhere/SKILL.md".to_owned(), "/etc/passwd".to_owned()]
        );
    }

    // "Two runs producing the same state produce the same bytes" is the
    // criterion the whole comparison rests on.
    #[test]
    fn the_same_state_serialises_to_the_same_bytes_whatever_order_it_arrived_in() {
        let mut forwards = DestinationManifest::new();
        forwards.insert(entry("a/SKILL.md"));
        forwards.insert(entry("b/SKILL.md"));
        forwards.insert(entry("c/SKILL.md"));

        let mut backwards = DestinationManifest::new();
        backwards.insert(entry("c/SKILL.md"));
        backwards.insert(entry("b/SKILL.md"));
        backwards.insert(entry("a/SKILL.md"));

        assert_eq!(forwards.to_json(), backwards.to_json());
        let json = forwards.to_json();
        let a = json.find("a/SKILL.md").expect("a present");
        let b = json.find("b/SKILL.md").expect("b present");
        let c = json.find("c/SKILL.md").expect("c present");
        assert!(a < b && b < c, "entries are not in path order");
    }

    // The key order is part of the format, not a detail of the struct. This
    // pins the whole file so a field reordering is a visible change.
    #[test]
    fn the_serialised_form_is_pinned() {
        let mut manifest = DestinationManifest::new();
        manifest.insert(entry(".claude/skills/code-review/SKILL.md"));
        assert_eq!(
            manifest.to_json(),
            r#"{
  "schema_version": 1,
  "entries": [
    {
      "path": ".claude/skills/code-review/SKILL.md",
      "target": "claude",
      "source_note": "skills/code-review.md",
      "source_hash": "sha256:aaa",
      "contributing_notes": [
        "skills/code-review.md",
        "skills/snippets/reviewer.md"
      ],
      "unresolved": [
        "house-style"
      ],
      "emitted_hash": "sha256:bbb",
      "executable": false,
      "published_at": "2026-08-29T10:00:00Z"
    }
  ]
}
"#
        );
    }

    #[test]
    fn a_round_trip_through_the_filesystem_preserves_every_field() {
        let vfs = MemVfs::new();
        let mut manifest = DestinationManifest::new();
        manifest.insert(entry(".claude/skills/code-review/SKILL.md"));
        let mut script = entry(".claude/skills/code-review/scripts/check.py");
        script.executable = true;
        script.unresolved = Vec::new();
        manifest.insert(script);

        assert!(write_manifest(&vfs, root(), &manifest).unwrap());
        let ManifestState::Ok {
            manifest: read,
            dropped,
        } = read_manifest(&vfs, root())
        else {
            panic!("expected a usable manifest");
        };
        assert!(dropped.is_empty());
        assert_eq!(read, manifest);
        assert!(
            read.get(".claude/skills/code-review/scripts/check.py")
                .unwrap()
                .executable
        );
    }

    // "A run in which every file is unchanged leaves the manifest
    // byte-identical, and the manifest itself then reports unchanged."
    #[test]
    fn writing_the_same_manifest_twice_reports_no_second_change() {
        let vfs = MemVfs::new();
        let mut manifest = DestinationManifest::new();
        manifest.insert(entry(".claude/skills/code-review/SKILL.md"));

        assert!(write_manifest(&vfs, root(), &manifest).unwrap());
        let first = vfs.read_file(&manifest_path(root())).unwrap();
        assert!(!write_manifest(&vfs, root(), &manifest).unwrap());
        assert_eq!(vfs.read_file(&manifest_path(root())).unwrap(), first);
    }

    // An unusable manifest must not read as "nothing is recorded" to a caller
    // that only asks what it holds — it holds nothing usable, and the caller
    // that must refuse checks `is_usable` for that reason.
    #[test]
    fn an_unusable_manifest_answers_empty_but_is_not_usable() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/dest/.skillwright")).unwrap();
        vfs.write_file(&manifest_path(root()), b"nonsense").unwrap();

        let state = read_manifest(&vfs, root());
        assert!(state.manifest().is_empty());
        assert!(!state.is_usable());
    }

    #[test]
    fn removing_an_entry_forgets_only_that_path() {
        let mut manifest = DestinationManifest::new();
        manifest.insert(entry("a/SKILL.md"));
        manifest.insert(entry("b/SKILL.md"));

        assert!(manifest.remove("a/SKILL.md").is_some());
        assert!(manifest.remove("a/SKILL.md").is_none());
        assert_eq!(manifest.paths().collect::<Vec<_>>(), vec!["b/SKILL.md"]);
    }

    #[test]
    fn an_empty_manifest_still_carries_its_schema_version() {
        let json = DestinationManifest::new().to_json();
        assert!(json.contains("\"schema_version\": 1"), "{json}");
        assert!(json.ends_with("}\n"), "{json}");
    }
}

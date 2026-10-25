//! Publishing — one vault note onto one destination, and the rail that keeps
//! it from eating the vault.
//!
//! The vault spec describes publishing as five steps. **This
//! module is steps 4 and 5**: copy the peer resources, and emit `SKILL.md` in
//! the target's dialect and directory layout. Steps 1–3 — `![[embed]]`
//! expansion, `[[link]]` collection, reference-file emission — are a later
//! phase, and [`crate::vault`] passes the body through verbatim until then.
//! Nothing here fakes their output: a published `SKILL.md` today contains the
//! author's wikilinks exactly as typed.
//!
//! # Idempotence is a comparison, not a manifest
//!
//! The publish spec requires that publishing twice with no edits changes no
//! bytes. Publishing reads what is already at the destination and compares —
//! no state to invalidate, and correct on the first publish into a directory
//! some other tool wrote. The manifest the vault spec
//! describes answers a different question ("is this destination *stale*").
//!
//! Byte equality alone is not the test: [`crate::projection::content_hash`]
//! makes the execute bit part of what is published, so a peer whose bytes
//! match but whose bit is wrong is [`PublishStatus::Written`].
//!
//! # A refusal is every file, not some of them
//!
//! The rail decides the destination as a whole — even when what convicts it
//! is one projected path — so it is taken before a single byte is written and
//! it poisons the whole publish: every projected file comes back
//! [`PublishStatus::Refused`] carrying the same reason. An I/O failure
//! part-way through a permitted write is different: it surfaces as an error,
//! and there is no rollback, because [`crate::vfs::Vfs`] has no rename to
//! stage through.
//!
//! # What the rail can see, and the two shapes it takes
//!
//! With [`PublishRequest::skills_root`] on the request the protected tree is
//! the vault itself, and the comparison is the one the write-guard spec
//! asks for: the vault and anything inside it are refused as destinations,
//! and an *ancestor* of the vault — `~`, a project directory the vault lives
//! under — is refused only when a write path would land inside the vault.
//! That is what lets a vault at `~/notes` publish to `~`: the writes land
//! under `~/.claude/skills/`, disjoint from the vault. The comparison is
//! **physical**: both roots and every projected write path are resolved
//! through `path-guard`, so a destination that is a
//! link onto the vault is the vault, and a `~/.claude` that is a link into
//! the vault convicts the writes it would route there. The narrowed rail is
//! taken only where [`crate::vfs::Vfs::sees_links`] answers `true`; a host
//! whose canonicalize is the lexical default keeps the wider ancestor
//! refusal over the vault root, because a link it cannot see is exactly
//! what the per-write comparison would miss there.
//!
//! Without a vault root the note's own directory stands in —
//! `skills/code-review/` for `skills/code-review/code-review.md` — and
//! [`crate::guard::assert_destination_allowed`] refuses a destination equal
//! to it, inside it, or containing it. The ancestor refusal is wider than the
//! rule the publish spec states.
//!
//! What is protected is that tree and nothing else. A scan location is not a
//! protected path (the publish spec), so a destination that
//! overlaps one publishes normally — `protected_trees` is the fallback's
//! whole list, and it has one entry.
//!
//! # The other rail: where a projected file is allowed to land
//!
//! The rail above is a decision about `destination_root`; it says nothing
//! about the path *inside* it that a projected file claims. Two layers vet
//! that: `agent-adapt` refuses a resource path that would not stay inside the
//! skill directory at render time, and [`crate::guard::resolve_write_path`]
//! refuses it again here — this time resolving both the root and the target on
//! disk, which is the half a pure renderer cannot do because it has no
//! destination to resolve against.
//!
//! Both refuse under one token, `unsafe-path`, and both raise
//! [`CoreError::Refused`]. Every path is checked before the first byte of the
//! first file, so a skill whose third resource escapes leaves the first two
//! unwritten.
//!
//! # `ap-targets` narrows publication, and it is not a per-file outcome
//!
//! The publish spec gives the key three readings, and
//! two of them stop a publish:
//!
//! | `ap-targets` | This destination |
//! |---|---|
//! | absent | published — every destination, the ordinary vault |
//! | present, naming it | published |
//! | present, not naming it | **not published** — no files, no outcome |
//! | present and empty | **not published** — empty is nowhere |
//! | naming something unknown | **blocker** · `unknown-target` |
//!
//! An excluded destination reports **no files at all**, rather than a fourth
//! per-file status: the note was never a candidate here, so there is nothing
//! to call written, unchanged, or refused, and the closed outcome set stays
//! the four names. The report carries
//! [`PublishReport::not_published`] so a caller can tell "excluded" from
//! "published nothing".
//!
//! The predicate is [`publishes_to`]. [`publish_skill`] applies it itself
//! rather than leaving it to the caller — a narrowing key every caller has to
//! remember to ask about publishes to destinations the author excluded. It is
//! public too, so a preflight plan shows the same answer this function acts on.
//!
//! An unrecognised name is a blocker over *every* projected file rather than a
//! name that matches nothing: read as "matches nothing" a typo would silently
//! unpublish a destination, and read as "all" it would publish to destinations
//! the author excluded. The whole list is validated at every destination,
//! including the ones it does name, so the typo surfaces on the first publish
//! rather than the first time somebody notices files missing somewhere else.
//!
//! The rail runs first; both decisions refuse before a byte moves.
//!
//! # This module publishes by kind, and refuses a kind it cannot render
//!
//! The kind is resolved **before the projection**, not after. A skill, a
//! command and an agent each render into the target's own layout for that
//! kind; a plugin takes the pack projection — its manifest and its members.
//! Any other kind is refused `no-renderer`, naming the kind and the target,
//! and the wrong file is never built, let alone written.
//!
//! A target with no layout for the kind refuses under the same token, from
//! [`crate::projection`] rather than from the gate.
//!
//! `no-renderer` is deliberately not a new word. See `no_renderer_for`.
//!
//! # A dry run is the same publish, over a different filesystem
//!
//! The CLI spec defines `--dry-run` as "the plan alone": it writes nothing and
//! returns the exit code the real run would have returned. So
//! [`PublishMode::DryRun`] adds no second comparison, no second loop and no
//! branch inside the writer: it runs `publish_onto`, the ordinary path,
//! against a [`crate::vfs::PreviewVfs`] wrapped around the caller's own
//! filesystem. Reads fall through to the real tree; writes land in memory. The
//! rail, the kind check, `ap-targets`, [`PublishReport::not_published`], the
//! projection and the byte-and-execute-bit comparison are the same
//! instructions in both modes, over different bytes.
//!
//! The overlay captures writes rather than discarding them, because a wrapper
//! whose writes are no-ops breaks on multi-step consistency: a path written
//! and then looked at again inside one run would show the stale on-disk state
//! and classify the second look wrong.
//!
//! The overlay is constructed *here*, by the mode, and no host can hand one
//! in. A host that forgot to wrap would perform a real publish believing it
//! previewed one, and nothing on either side of the seam could tell.
//!
//! ## What a preview still cannot see
//!
//! A write into memory cannot fail the way a write onto a disk can:
//! permissions, a read-only mount, a full disk. A preview can therefore report
//! `written` where the real run fails with `io` — a limit of previewing
//! anything without doing it, and the one thing `--dry-run` must not be read
//! as promising.
//!
//! ## The captured bytes
//!
//! The overlay ends a preview holding exactly the bytes that would have
//! landed, reachable through [`crate::vfs::PreviewVfs::into_writes`].
//! [`PublishReport`] does not carry them — a status list is what the CLI spec
//! specifies today.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use std::cell::RefCell;
use std::collections::BTreeMap;

use crate::compile::{
    CallContext, Closure, CompileSource, IndexedSkill, SkillIndex, SkillSource, compile_projection,
};
use crate::content::SkillProjection;
use crate::discover::{DiscoveredComponent, KIND_DIRS, discover_components};
use crate::error::CoreError;
use crate::export::{
    DEFAULT_SHIM_TARGET, MarketplaceConfig, PluginDialect, PluginOverrides, render_plugin_manifest,
};
use crate::frontmatter::{
    ContainerIdentity, EntityKind, KindHints, KindSource, VaultFrontmatter, resolve_kind,
};
use crate::guard::{
    assert_destination_allowed, assert_destination_allowed_for_vault, resolve_write_path,
};
use crate::manifest::{
    DestinationManifest, MANIFEST_RELATIVE_PATH, ManifestEntry, ManifestState, manifest_path,
    read_manifest, write_manifest,
};
use crate::namespace::Namespace;
use crate::projection::{
    ProjectedFile, file_hash, project_agent, project_command, project_skill,
    project_skill_reporting,
};
use crate::vault::read_vault_skill;
use crate::vfs::{PreviewVfs, Vfs};

/// One publish: this note, to this destination, for this target.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishRequest {
    /// Absolute path to the vault note. Not a directory — a skill is a note.
    pub skill_path: PathBuf,
    /// Absolute path to the destination root. Target-specific directories
    /// (`.claude/skills/…`, `.agents/skills/…`) are computed under it.
    pub destination_root: PathBuf,
    /// A name from [`KNOWN_TARGETS`]. See `runtime_target_for`.
    pub target: String,
    /// Write, or classify only. Absent on the wire means
    /// [`PublishMode::Write`].
    #[serde(default)]
    pub mode: PublishMode,
    /// The VAULT root this note lives under — the whole vault, never a
    /// subfolder of it. Two duties ride on it.
    ///
    /// The kind gate asks the folders under this root what the note is — the
    /// same root [`crate::discover`] scans. And the rail protects exactly
    /// this tree: passing `/vault/skills` here would shrink protection to
    /// that subtree and make the real vault root a publishable ancestor.
    ///
    /// Absent means "no structural layer" — the note's own `ap-kind`, or the
    /// default, decides, and the rail falls back to the note's own directory
    /// with the wider ancestor refusal. A caller that has the vault root
    /// should pass it: a command sitting in `commands/` and
    /// declaring no `ap-kind` is a skill to a gate that only reads
    /// frontmatter, and publishing it writes a `SKILL.md` for something that
    /// is not a skill.
    #[serde(default)]
    pub skills_root: Option<PathBuf>,
    /// When this run happened, RFC 3339, from the caller's clock.
    ///
    /// This crate reads no clock — the same rule [`crate::adopt::AdoptRequest`]
    /// follows, and the reason both are deterministic under test. Absent, the
    /// manifest records no time and a conflict report says so rather than
    /// inventing one.
    #[serde(default)]
    pub published_at: Option<String>,
    /// Destination-root-relative paths whose refusal the caller has explicitly
    /// acknowledged, and which this run may therefore overwrite.
    ///
    /// Per file and named, never a run-wide force. A conflicted file holds the
    /// only copy of an edit somebody made at the destination, so discarding it
    /// is a decision about *that file* — a switch that resolved every conflict
    /// at once would make the decision invisible at the moment it is taken.
    #[serde(default)]
    pub overwrite: Vec<String>,
}

/// Whether a publish writes, or only reports what it would write.
///
/// A field on the request rather than a second entry point, so there is one
/// publish path and no `dry_run_skill` copy of [`publish_skill`]'s order to
/// keep in step. It is also how previewing crosses the wasm boundary: that
/// boundary serializes a [`PublishRequest`], so `#[serde(default)]` lets a
/// host opt in with one extra key while every existing caller keeps meaning
/// `write`. A third argument would not ride the wire: the boundary would need
/// a wrapper type for it, the second wire shape [[core-translation-engine]]
/// exists to prevent.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PublishMode {
    /// Classify and write. The default: the failure mode of defaulting to
    /// preview is a publish that silently did nothing.
    #[default]
    Write,
    /// Classify and stop. Nothing is written, nothing is created, and the
    /// report is the one the write would have produced.
    DryRun,
}

/// What happened to one file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PublishStatus {
    /// Bytes or the execute bit changed on disk — or would have, under
    /// [`PublishMode::DryRun`].
    Written,
    /// Already exactly what we would have written. Not rewritten.
    Unchanged,
    /// A rail said no. Nothing was written, here or anywhere in this publish.
    Refused,
}

/// The closed set of reasons a report line can carry — the publish spec's
/// outbound vocabulary, plus the one non-refusal note a line has to say about
/// itself.
///
/// Closed: a report, a `--json` document, `tradecraft status` and a later UI
/// all read the same token, so it may not be free text that drifts from the
/// table it reproduces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReasonToken {
    /// The destination's copy moved since we published it.
    Conflict,
    /// It exists at one of our paths, and no manifest entry says it is ours.
    Foreign,
    /// A path leaves the tree it must stay inside.
    UnsafePath,
    /// We cannot read it, so we must not act on it.
    Io,
    /// No renderer for this target, or none for this note's kind at it.
    NoRenderer,
    /// A plugin manager owns the tree and rotates it.
    PluginManaged,
    /// The run stopped before reaching this file.
    Stopped,
    /// The note's embeds form a cycle, so its projection cannot be computed.
    Cycle,
    /// The destination's resolved write paths overlap the vault.
    UnsafeRoot,
    /// The destination's manifest cannot be used: corrupt, unreadable, newer,
    /// or shared.
    BadManifest,
    /// Two notes, targets, or destinations resolve onto one path.
    PathCollision,
    /// A targets key, or a request, names a target this build does not know.
    UnknownTarget,
    /// An `ap-overrides` block names a key the receiving harness does not
    /// read. Its own token rather than `unknown-target`: the destination is
    /// fine and the key is not, and a reader has to be told which.
    UnknownOverrideKey,
    /// A kind key names a value this build does not know.
    UnknownKind,
    /// A plugin's body names a member that resolves to no note.
    MemberUnresolved,
    /// A plugin note with no resolvable members.
    EmptyPlugin,
    /// The note carries both our nested block and our flat keys.
    MixedFrontmatterShape,
    /// Not a refusal, and the one token here that names a success: the file
    /// was already byte-identical to our own output, so this run claimed it
    /// into the destination's manifest. The table's refusal set is
    /// [`ReasonToken::REFUSALS`]; a `written` or `unchanged` line needs a way
    /// to say this, and it is a reason like any other.
    Claimed,
    /// Not a refusal either: an `ap-overrides` key said what the projection
    /// already writes, so the file published unchanged and the author has a
    /// key they can delete.
    RedundantOverride,
    /// Not a refusal either: a file this destination's manifest did not
    /// record held different bytes, and the request named it for overwrite,
    /// so its content was replaced rather than adopted.
    Overwritten,
}

impl ReasonToken {
    /// Every refusal token, in the order the publish spec's table
    /// lists them. [`ReasonToken::Claimed`] is deliberately absent: it names
    /// an outcome that wrote.
    pub const REFUSALS: &'static [ReasonToken] = &[
        Self::Conflict,
        Self::Foreign,
        Self::UnsafePath,
        Self::Io,
        Self::NoRenderer,
        Self::PluginManaged,
        Self::Stopped,
        Self::Cycle,
        Self::UnsafeRoot,
        Self::BadManifest,
        Self::PathCollision,
        Self::UnknownTarget,
        Self::UnknownOverrideKey,
        Self::UnknownKind,
        Self::MemberUnresolved,
        Self::EmptyPlugin,
        Self::MixedFrontmatterShape,
    ];

    /// The wire spelling, which prose never varies from.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Conflict => "conflict",
            Self::Foreign => "foreign",
            Self::UnsafePath => "unsafe-path",
            Self::Io => "io",
            Self::NoRenderer => "no-renderer",
            Self::PluginManaged => "plugin-managed",
            Self::Stopped => "stopped",
            Self::Cycle => "cycle",
            Self::UnsafeRoot => "unsafe-root",
            Self::BadManifest => "bad-manifest",
            Self::PathCollision => "path-collision",
            Self::UnknownTarget => "unknown-target",
            Self::UnknownOverrideKey => "unknown-override-key",
            Self::UnknownKind => "unknown-kind",
            Self::MemberUnresolved => "member-unresolved",
            Self::EmptyPlugin => "empty-plugin",
            Self::MixedFrontmatterShape => "mixed-frontmatter-shape",
            Self::Claimed => "claimed",
            Self::RedundantOverride => "redundant-override",
            Self::Overwritten => "overwritten",
        }
    }

    /// The token this spelling names, or `None` for a word outside the set.
    pub fn parse(token: &str) -> Option<Self> {
        Self::REFUSALS
            .iter()
            .copied()
            .chain([Self::Claimed, Self::RedundantOverride])
            .find(|candidate| candidate.as_str() == token)
    }

    /// Whether this token names a refusal. False for the two that name an
    /// outcome which wrote — [`ReasonToken::Claimed`] and
    /// [`ReasonToken::RedundantOverride`].
    pub fn is_refusal(self) -> bool {
        !matches!(self, Self::Claimed | Self::RedundantOverride)
    }
}

impl std::fmt::Display for ReasonToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Why a report line reads the way it does: the closed-set token, and the
/// prose that varies with the occurrence.
///
/// Both halves are needed. The token is what a script matches on; the detail
/// carries the path, the timestamp or the member name that tells a person what
/// to do about it, and no closed set can hold those.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublishReason {
    /// The closed-set token a script matches on.
    pub token: ReasonToken,
    /// Prose for a human. Omitted from the wire when there is none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl PublishReason {
    /// A token with its prose.
    pub fn new(token: ReasonToken, detail: impl Into<String>) -> Self {
        Self {
            token,
            detail: Some(detail.into()),
        }
    }

    /// A token whose situation the token itself already says in full.
    pub fn bare(token: ReasonToken) -> Self {
        Self {
            token,
            detail: None,
        }
    }

    /// A [`CoreError::Refused`] message, split back into the token it leads
    /// with and the prose after it.
    ///
    /// `fallback` is the token of the rail that raised the error, used when
    /// the message leads with no token this build knows. A rail always knows
    /// what kind of refusal it just made, so no refusal reaches a report as
    /// bare prose.
    pub fn from_refusal(message: &str, fallback: ReasonToken) -> Self {
        match message.split_once(": ") {
            Some((token, detail)) => match ReasonToken::parse(token) {
                Some(token) => Self::new(token, detail),
                None => Self::new(fallback, message),
            },
            None => Self::new(fallback, message),
        }
    }
}

impl std::fmt::Display for PublishReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.detail {
            Some(detail) => write!(f, "{}: {detail}", self.token),
            None => write!(f, "{}", self.token),
        }
    }
}

/// Which of `classify`'s rules produced a file's [`PublishStatus`].
///
/// A status alone collapses cases a reader has to tell apart. `written` is
/// both a first write into an empty destination and a rewrite of our own
/// output that the source note has moved past, and those two are the
/// difference between installing a unit and repairing a stale one. `refused`
/// is both a destination edit and a file we never wrote. The status says what
/// happened to the bytes; this says which state of the world it happened in.
///
/// A closed set, and the same tokens on every surface — the wire spelling is
/// the kebab-case rename below, and no consumer re-words it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PublishOutcome {
    /// Nothing was at this path and the manifest records nothing here. The
    /// first write of this file to this destination.
    FirstWrite,
    /// The manifest records this path as ours, and what is there is not what
    /// we would write now. Publishing repairs it — this is drift.
    Rewrite,
    /// The bytes were already ours but the manifest had no record of them, so
    /// this run adopts them. See `P5`.
    Claimed,
    /// A file the manifest does not record, whose bytes differed from ours,
    /// was replaced because the caller named it in
    /// [`PublishRequest::overwrite`]. Not [`PublishOutcome::Claimed`]: nothing
    /// was adopted, foreign content was overwritten, and a reader has to be
    /// told which of the two happened.
    Overwritten,
    /// Already exactly what we would write, and recorded. Nothing to do.
    Unchanged,
    /// A file we published was edited at the destination. Refused.
    Conflict,
    /// A file sits at one of our paths that the manifest does not record.
    /// Refused.
    Foreign,
    /// A rail refused the destination as a whole, before any file was
    /// classified.
    Blocked,
    /// The destination's own manifest. Its outcome tracks the record rather
    /// than the unit, so a consumer deciding a unit's state skips this row.
    Manifest,
}

/// One line of a [`PublishReport`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishedFile {
    /// Destination-root-relative, forward-slashed.
    pub path: String,
    /// What happened to the file.
    pub status: PublishStatus,
    /// Which rule decided [`PublishedFile::status`]. The distinction a status
    /// cannot carry — a first write against a rewrite of stale output, a
    /// destination edit against a foreign file.
    pub outcome: PublishOutcome,
    /// Why, when there is a why: every refusal carries one, and so does a file
    /// claimed into the manifest because its bytes were already ours.
    pub reason: Option<PublishReason>,
}

/// Every file the publish considered, in path order. A refused publish still
/// reports all of them — a silent skip is how a destination rots unnoticed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishReport {
    /// Every file considered, in path order.
    pub files: Vec<PublishedFile>,
    /// Why there are no files: set exactly when `ap-targets` excluded this
    /// destination, and `None` on every other report.
    ///
    /// Prose, not one of the publish spec's reason tokens. Those
    /// name outcomes, and exclusion is the absence of one — nothing here was a
    /// candidate, so nothing here has a status. Omitted from the wire when
    /// unset, so the ordinary report is the shape it always was.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub not_published: Option<String>,
    /// Vault-relative paths of members this projection could not carry.
    ///
    /// A pack declares only `skills/`, so an agent or a command belonging to
    /// one has no place inside it. Reporting beats refusing the pack — a
    /// plugin holding four skills and an agent is an ordinary vault and the
    /// four should travel — and it beats dropping them, which is the failure
    /// this crate is built around. Both kinds publish to a destination on
    /// their own, which is what a reader does about it.
    ///
    /// Empty on every report but a pack's, and omitted from the wire when
    /// empty, so the ordinary report is the shape it always was.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub not_carried: Vec<String>,
    /// `ap-overrides` keys this destination's render already wrote, each as
    /// its own reason line.
    ///
    /// A diagnostic that travels with the report and never blocks a write:
    /// the files below published exactly as they would have without the key.
    /// Empty on every ordinary report, and omitted from the wire when empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub redundant_overrides: Vec<PublishReason>,
}

/// Reads the note, projects it, and writes the result under
/// `destination_root` — or, under [`PublishMode::DryRun`], reports what that
/// would have done and writes nothing.
///
/// Idempotent: a second call with no edits between them reports every file
/// [`PublishStatus::Unchanged`] and touches nothing.
///
/// # The two modes are one function
///
/// The mode picks a filesystem and nothing else. A dry run wraps `vfs` in a
/// [`PreviewVfs`] — reads through, writes into memory — and hands it to the
/// same `publish_onto` a real run calls, so there is no classification, rail,
/// or refusal that exists in one mode and not the other.
///
/// # One namespace, both halves of the strip
///
/// `ns` is this vault's frontmatter namespace ([`Namespace::default`] is the
/// documented `ap`), and it is handed to *both* the read and the emit below —
/// one parameter, not two: the read decides which keys never become
/// `annotations`, the emit decides which `annotations` never reach disk, and
/// the two answering differently is how a configured vault publishes its own
/// configuration. This function is the seam where that cannot happen.
///
/// # Errors
///
/// * `refused: no-renderer` when the note's resolved kind is none of
///   [`EntityKind::Skill`], [`EntityKind::Command`], [`EntityKind::Agent`]
///   and [`EntityKind::Plugin`]. Nothing is read past, projected, or written.
/// * `refused: unknown-target` never reaches here — it is a blocker, so it
///   comes back *inside* the report, stamped on every projected file.
/// * A destination the note's `ap-targets` excludes is `Ok` with an empty
///   report and [`PublishReport::not_published`] set. See the module doc.
pub fn publish_skill(
    vfs: &dyn Vfs,
    request: &PublishRequest,
    ns: &Namespace,
) -> Result<PublishReport, CoreError> {
    match request.mode {
        PublishMode::Write => publish_onto(vfs, request, ns),
        // The overlay is the only difference between the two modes, and it is
        // constructed here so no caller can be previewing without having asked.
        PublishMode::DryRun => publish_onto(&PreviewVfs::over(vfs), request, ns),
    }
}

/// The publish itself, blind to the mode.
///
/// It cannot tell whether it is writing onto a real destination or into a
/// [`PreviewVfs`], so every status, refusal and
/// [`PublishReport::not_published`] a dry run reports came out of these
/// instructions.
fn publish_onto(
    vfs: &dyn Vfs,
    request: &PublishRequest,
    ns: &Namespace,
) -> Result<PublishReport, CoreError> {
    let runtime_target = runtime_target_for(&request.target);
    let note = read_vault_skill(vfs, &request.skill_path, ns)?;

    // Before the renderer, not after: a kind this path cannot publish must not
    // reach the one renderer it has.
    //
    // RESOLVED, not declared. The folders are a deciding layer, so a note that
    // says nothing about its kind is not thereby a skill — it is whatever the
    // folder holding it named. Routed through `resolve_kind` rather than
    // compared here so precedence stays in the one place that owns it.
    let resolved = resolve_kind(
        note.frontmatter.declared_kind,
        KindHints {
            requested: None,
            configured: request
                .skills_root
                .as_deref()
                .and_then(|root| crate::discover::folder_kind(root, &request.skill_path)),
        },
    );
    // Everything a renderer cannot take is refused here, before the renderer
    // builds the wrong file.
    if !kind_has_renderer(resolved.kind) {
        return Err(no_renderer_for(
            &request.skill_path,
            resolved.kind,
            resolved.source,
            &request.target,
            ns,
        ));
    }

    let canonical = canonical_target(&request.target).unwrap_or(request.target.as_str());

    // The tree everything resolves against: the vault root when the caller
    // supplied one, and otherwise the tree the note sits in. Shared by every
    // kind — links resolve against it, and a pack's members are scanned from
    // it — so a caller that omits `skills_root` gets a narrower scope rather
    // than a different rule. A link outside that scope is recorded unresolved
    // rather than emitted raw: degrading to "we could not find it" beats
    // degrading to bytes no harness can read.
    let bundle_root = crate::vault::bundle_root(&request.skill_path);
    let compile_root: &Path = match request.skills_root.as_deref() {
        Some(vault_root) => vault_root,
        None => bundle_root
            .and_then(Path::parent)
            .or_else(|| request.skill_path.parent())
            .ok_or_else(|| {
                CoreError::malformed(&request.skill_path, "a note path has no parent directory")
            })?,
    };

    // A pack is projected from its members, not from its own body, so it
    // takes the whole projection branch rather than a step inside one. The
    // note's prose is not published: a plugin's file at a destination is its
    // pack manifest, and its members are their own files.
    if resolved.kind == EntityKind::Plugin {
        let pack = project_plugin(
            vfs,
            request,
            &note.projection.content.name,
            &note.frontmatter.identity,
            compile_root,
            canonical,
            ns,
        )?;
        // The pack manifest is the one file with no closure of its own — it is
        // rendered from frontmatter rather than compiled from a body — so the
        // plugin note stands as its source.
        let source_note = vault_relative(compile_root, &request.skill_path);
        return finish(
            vfs,
            request,
            ns,
            &note.frontmatter,
            pack.files,
            pack.closures,
            canonical,
            &source_note,
            None,
            &pack.not_carried,
            // A pack's manifest is rendered from frontmatter, not through a
            // dialect, so there is nothing for an override to be redundant
            // against.
            &[],
        );
    }

    // The compile pass, between the read and the render, exactly where the
    // marketplace build runs it. Without it a published `SKILL.md` carries the
    // author's `![[embeds]]` and `[[links]]` verbatim: the embedded prose is
    // absent from the destination, no reference file is written beside the
    // skill, and no harness resolves either sigil. The build compiled and this
    // path did not, so one note produced two different sets of bytes and only
    // one of them was readable.
    let mut projection = note.projection;
    // Only the two kinds an invocation actually takes arguments at. Carrying
    // it for an agent or a plugin would set a field nothing downstream reads
    // — `to_adapt_agent` has no `arguments` field, and a plugin takes the
    // pack branch above and never reaches this line.
    if matches!(resolved.kind, EntityKind::Skill | EntityKind::Command) {
        projection
            .content
            .apply_arguments(&note.frontmatter.arguments);
    }
    // Folded and checked before anything renders: an unknown destination name
    // or a key this harness does not read refuses here, with no file built.
    // Carried for every kind that reaches a dialect — a plugin took the pack
    // branch above and never gets here.
    projection.content.apply_overrides(overrides_for(
        &note.frontmatter,
        &request.skill_path,
        &request.target,
        ns,
    )?);
    let skill_name = projection.content.name.clone();
    // A skill published on its own has no plugin, so a call to another
    // skill is the runtime's form without a namespace. The index needs a
    // whole-vault scan, so it is built only when the body has a call or a
    // link to check, and a scan that fails blocks only a call: a plain link
    // then stays a link.
    let build_index = || -> Result<SkillIndex, CoreError> {
        let scan = discover_components(vfs, compile_root, None, ns)?;
        Ok(publish_skill_index(&scan.components, false, canonical))
    };
    let runtime = runtime_id_for_canonical(canonical);
    let render = |skill: &IndexedSkill| match runtime {
        Some(runtime) => crate::export::checked_skill_call(runtime, None, &skill.name),
        None => Ok(skill.name.clone()),
    };
    let calls = CallContext {
        skills: SkillSource::lazy(&build_index),
        render: &render,
        target: canonical,
        implicit: matches!(resolved.kind, EntityKind::Skill | EntityKind::Command),
        warnings: RefCell::new(Vec::new()),
    };
    let closures = compile_projection(
        vfs,
        &CompileSource {
            vault_root: compile_root,
            entry_path: &request.skill_path,
            bundle_root,
            skill_name: &skill_name,
            calls: Some(&calls),
        },
        &mut projection,
    )?;

    // Only the projectable half is handed on. `note.frontmatter` — the kind,
    // the targets, the provenance — stays on this side of the seam by
    // construction, because `project_skill` has no parameter that could carry
    // it to a destination. The `ns` it does take is the same one the read used
    // a few lines up, which is the whole point of taking one here.
    let mut redundant: Vec<PublishReason> = Vec::new();
    let files = match resolved.kind {
        // Both single-file kinds refuse a note that carries peers, for the
        // same reason: one emitted file leaves those files nowhere to go, and
        // a copy set that silently loses what the model cannot represent is
        // this crate's recorded failure rather than a hypothetical one.
        EntityKind::Command => {
            refuse_carried_peers(&projection, "command")?;
            project_command(&projection, &[runtime_target], ns, Some(canonical))?
        }
        EntityKind::Agent => {
            refuse_carried_peers(&projection, "agent")?;
            project_agent(&projection, &[runtime_target], ns)?
        }
        _ => {
            let (files, diagnostics) =
                project_skill_reporting(&projection, &[runtime_target], ns, Some(canonical))?;
            redundant.extend(
                diagnostics
                    .iter()
                    .map(|d| PublishReason::new(ReasonToken::RedundantOverride, d.to_string())),
            );
            files
        }
    };

    let source_note = vault_relative(compile_root, &request.skill_path);
    let hashed = hash_closures(vfs, compile_root, &closures, &source_note)?;
    // An agent's body lands at a path no suffix rule connects to the entry
    // closure's key, and it is the only file the projection emits.
    let entry_output = match resolved.kind {
        EntityKind::Agent | EntityKind::Command => files.first().map(|f| f.relative_path.clone()),
        _ => None,
    };
    finish(
        vfs,
        request,
        ns,
        &note.frontmatter,
        files,
        hashed,
        canonical,
        &source_note,
        entry_output.as_deref(),
        &[],
        &redundant,
    )
}

/// The half every kind shares: the rail, the `ap-targets` narrowing, the
/// manifest, and the write.
///
/// One function rather than a step repeated per kind, because these are the
/// rules that must not differ between them. A pack that skipped the vault rail
/// or wrote no manifest would be a second, weaker publish wearing the same
/// name.
#[allow(clippy::too_many_arguments)]
fn finish(
    vfs: &dyn Vfs,
    request: &PublishRequest,
    ns: &Namespace,
    frontmatter: &VaultFrontmatter,
    files: Vec<ProjectedFile>,
    hashed: BTreeMap<String, HashedClosure>,
    canonical: &str,
    source_note: &str,
    entry_output: Option<&str>,
    not_carried: &[String],
    redundant_overrides: &[PublishReason],
) -> Result<PublishReport, CoreError> {
    // The rail, before any byte is written.
    let rail = match request.skills_root.as_deref() {
        // The vault root is known and this host can see links, so the rail
        // can answer the question the ancestor refusal only guesses at: does
        // any of THESE writes physically land inside the vault?
        Some(vault_root) if vfs.sees_links() => assert_destination_allowed_for_vault(
            vfs,
            &request.destination_root,
            vault_root,
            files.iter().map(|f| f.relative_path.as_str()),
        ),
        // A vault root on a host that cannot see links: the wider ancestor
        // refusal stays, protecting the vault root itself — a link this host
        // cannot resolve is exactly what the narrowed check would miss.
        Some(vault_root) => {
            assert_destination_allowed(vfs, &request.destination_root, &[vault_root.to_path_buf()])
        }
        None => assert_destination_allowed(
            vfs,
            &request.destination_root,
            &protected_trees(&request.skill_path),
        ),
    };
    match rail {
        Ok(()) => {}
        // The rail knows what kind of refusal it just made, so a message that
        // leads with no token still lands on `unsafe-root` rather than as prose.
        Err(CoreError::Refused(message)) => {
            return Ok(refuse_all(
                &files,
                &PublishReason::from_refusal(&message, ReasonToken::UnsafeRoot),
            ));
        }
        Err(other) => return Err(other),
    }

    // `ap-targets`, applied here so no caller can forget to.
    match publishes_to(frontmatter, &request.skill_path, &request.target, ns) {
        Ok(true) => {}
        Ok(false) => {
            return Ok(PublishReport {
                files: Vec::new(),
                not_published: Some(exclusion_reason(frontmatter, &request.target, ns)),
                not_carried: Vec::new(),
                redundant_overrides: Vec::new(),
            });
        }
        // A name we do not know is a blocker: every projected file, one reason.
        Err(CoreError::Refused(message)) => {
            return Ok(refuse_all(
                &files,
                &PublishReason::from_refusal(&message, ReasonToken::UnknownTarget),
            ));
        }
        Err(other) => return Err(other),
    }

    // The manifest, read before any byte is written. An unusable one is a
    // destination-level blocker rather than something to replace: rewriting it
    // silently re-arms the orphan sweep against a false empty baseline, so
    // files we published become invisible rather than managed.
    let state = read_manifest(vfs, &request.destination_root);
    if let ManifestState::Unusable(why) = &state {
        return Ok(refuse_all(
            &files,
            &PublishReason::new(
                ReasonToken::BadManifest,
                why.message(&manifest_path(&request.destination_root)),
            ),
        ));
    }

    let plan = WritePlan {
        destination_root: &request.destination_root,
        manifest: state.manifest(),
        closures: &hashed,
        source_note,
        target: canonical,
        published_at: request.published_at.as_deref().unwrap_or_default(),
        overwrite: &request.overwrite,
        entry_output,
    };
    let mut reported = write_projection(vfs, &plan, &files)?;
    // `project_skill` already sorts; re-sorting keeps that a property of this
    // report rather than an inherited accident.
    reported.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(PublishReport {
        files: reported,
        not_published: None,
        not_carried: not_carried.to_vec(),
        redundant_overrides: redundant_overrides.to_vec(),
    })
}

/// Whether a publish to a destination has any projection for this kind.
///
/// Skill, command and agent each render into the target's layout for that
/// kind; a plugin takes the pack projection instead of a renderer. Everything
/// else — a marketplace, a hook — is discoverable and describable, and
/// `no_renderer_for` refuses it at every target.
///
/// Public so a host asking "is this note publishable at all" reads the gate
/// rather than keeping its own copy of the list: `tradecraft status` has to
/// tell a note it never asks about from a note whose state it could not
/// determine.
pub fn kind_has_renderer(kind: EntityKind) -> bool {
    matches!(
        kind,
        EntityKind::Skill | EntityKind::Agent | EntityKind::Command | EntityKind::Plugin
    )
}

/// A recognised kind with no renderer on this path, refused by the name
/// the publish spec already gives that condition.
///
/// `no-renderer` rather than a new token. The closed set glosses it "no
/// renderer for this target", and the case of *the target has no plugin layout*:
/// **blocker**, `no-renderer`, naming the target — is the same condition one
/// kind over. A marketplace is what reaches here: no runtime installs one
/// directly, so no target has a layout for it.
///
/// The closed set is a vocabulary of what a *user* has to fix, so it carries
/// no token for the API fact that the wrong entry point was called.
fn no_renderer_for(
    note_path: &Path,
    kind: EntityKind,
    source: KindSource,
    target: &str,
    ns: &Namespace,
) -> CoreError {
    // Name the layer that actually decided, not the key. Quoting
    // `ap-kind: command` at a note whose frontmatter never mentions `ap-kind`
    // sends its author to look for a line that is not there.
    let because = match source {
        KindSource::Frontmatter => format!("`{}: {}`", ns.key("kind"), kind.as_str()),
        KindSource::Directory => format!("the folder holding it names it a {}", kind.as_str()),
        KindSource::Override => format!("it was published as a {}", kind.as_str()),
        KindSource::Default => format!("it is a {}", kind.as_str()),
    };
    CoreError::refused(
        "no-renderer",
        format!(
            "{}: {because} — `{target}` has no {} layout to render, and publishing it as a \
             skill would write a `SKILL.md` for something that is not one. Nothing was written",
            note_path.display(),
            kind.as_str(),
        ),
    )
}

/// Writes the whole projection, or none of it.
///
/// # Every path is vetted before the first byte of the first file
///
/// The containment check ([`resolve_write_path`]) runs over all of them up
/// front rather than one file at a time. Checking inside the write loop would
/// refuse a skill's third resource after the first two had already landed,
/// which is a half-written tree at a destination — the exact outcome a refusal
/// exists to prevent. This ordering is also what makes the two
/// [`PublishMode`]s agree: at the moment of the check nothing has been written
/// in either mode, so both are asking about the same filesystem.
///
/// # Errors
///
/// `refused: unsafe-path` when any projected file would land outside
/// `destination_root`. It is an error rather than a per-file
/// [`PublishStatus::Refused`] on purpose: the rail and `unknown-target` are
/// decisions about the destination and the note, which a report can carry, but
/// this one says the files themselves are not writable anywhere, and it has to
/// reach a host as a [`CoreError::Refused`] to be classified as denied rather
/// than as a generic failure.
fn write_projection(
    vfs: &dyn Vfs,
    plan: &WritePlan<'_>,
    files: &[ProjectedFile],
) -> Result<Vec<PublishedFile>, CoreError> {
    let mut targets = Vec::with_capacity(files.len());
    for file in files {
        targets.push(resolve_write_path(
            vfs,
            plan.destination_root,
            &file.relative_path,
        )?);
    }

    let mut manifest = plan.manifest.clone();
    let mut reported = Vec::with_capacity(files.len() + 1);
    for (file, target) in files.iter().zip(&targets) {
        let recorded = manifest.get(&file.relative_path).cloned();
        let acknowledged = plan.overwrite.iter().any(|p| p == &file.relative_path);
        let verdict = classify(vfs, target, file, recorded.as_ref(), acknowledged)?;

        let (status, outcome, reason) = match verdict {
            Verdict::Refuse { outcome, reason } => (PublishStatus::Refused, outcome, Some(reason)),
            Verdict::Unchanged { outcome } => {
                (PublishStatus::Unchanged, outcome, outcome_reason(outcome))
            }
            Verdict::Write { outcome } => {
                if let Some(parent) = target.parent() {
                    vfs.create_dir_all(parent)?;
                }
                if vfs.read_file(target).ok().as_deref() != Some(file.content.as_slice()) {
                    vfs.write_file(target, &file.content)?;
                }
                // A rewrite preserves the old mode on both implementations, so
                // the bit is corrected after the write rather than assumed
                // from it.
                if vfs.is_executable(target) != file.executable {
                    vfs.set_executable(target, file.executable)?;
                }
                (PublishStatus::Written, outcome, outcome_reason(outcome))
            }
        };

        // Only a file that actually landed is claimed. A refusal leaves the
        // manifest exactly as it was, so a later run classifies it the same
        // way rather than inheriting a claim nothing wrote.
        if status != PublishStatus::Refused {
            manifest.insert(entry_for(plan, file, recorded.as_ref()));
        }
        reported.push(PublishedFile {
            path: file.relative_path.clone(),
            status,
            outcome,
            reason,
        });
    }

    // The manifest is reported like any other file and gets an outcome. It is
    // written last so a run killed part-way leaves a record of less than it
    // wrote rather than more — under-claiming refuses a file we could have
    // rewritten, and over-claiming overwrites one we never owned.
    let changed = write_manifest(vfs, plan.destination_root, &manifest)?;
    reported.push(PublishedFile {
        path: MANIFEST_RELATIVE_PATH.to_owned(),
        status: if changed {
            PublishStatus::Written
        } else {
            PublishStatus::Unchanged
        },
        // Not one of the classification outcomes: the manifest is the record,
        // not a projected file, and a unit whose own files are all unchanged
        // is current however the record moved.
        outcome: PublishOutcome::Manifest,
        reason: None,
    });
    Ok(reported)
}

/// What one landed file records.
///
/// `published_at` moves **only** when the emitted bytes change, so a run in
/// which everything is `unchanged` leaves the manifest byte-identical and a
/// closure edit that does not alter the output moves no timestamp.
fn entry_for(
    plan: &WritePlan<'_>,
    file: &ProjectedFile,
    recorded: Option<&ManifestEntry>,
) -> ManifestEntry {
    let emitted_hash = file_hash(&file.content);
    let closure = closure_for(plan.closures, &file.relative_path, plan.entry_output);
    let published_at = match recorded {
        Some(entry) if entry.emitted_hash == emitted_hash => entry.published_at.clone(),
        _ => plan.published_at.to_owned(),
    };
    ManifestEntry {
        path: file.relative_path.clone(),
        target: plan.target.to_owned(),
        source_note: closure
            .map(|c| c.source_note.clone())
            .unwrap_or_else(|| plan.source_note.to_owned()),
        source_hash: closure.map(|c| c.hash.clone()).unwrap_or_default(),
        contributing_notes: closure.map(|c| c.notes.clone()).unwrap_or_default(),
        unresolved: closure.map(|c| c.unresolved.clone()).unwrap_or_default(),
        calls: closure.map(|c| c.calls.clone()).unwrap_or_default(),
        emitted_hash,
        executable: file.executable,
        published_at,
    }
}

/// The closure for one projected file.
///
/// A projected path is the target's own prefix plus the unit's directory plus
/// the compile's output path, and only the last part is what closures are
/// keyed by. Matching on the longest suffix keeps this independent of every
/// target's layout, which the alternative — reconstructing that directory per
/// target — would not be.
///
/// `entry_output` names the file the note's own body became, for a projection
/// that does not call it `SKILL.md`. The compiler keys the entry's closure by
/// that name because a skill is what it was written for; an agent's body lands
/// at `<agents dir>/<slug>.md`, which no suffix rule can connect to the key.
/// Without this an agent's entry would carry no closure at all, and its
/// manifest row would record an empty source hash — a unit that could never be
/// stale.
fn closure_for<'a>(
    closures: &'a BTreeMap<String, HashedClosure>,
    relative_path: &str,
    entry_output: Option<&str>,
) -> Option<&'a HashedClosure> {
    if entry_output == Some(relative_path)
        && let Some(entry) = closures.get(ENTRY_CLOSURE_KEY)
    {
        return Some(entry);
    }
    closures
        .iter()
        .filter(|(key, _)| {
            relative_path == key.as_str() || relative_path.ends_with(&format!("/{key}"))
        })
        .max_by_key(|(key, _)| key.len())
        .map(|(_, closure)| closure)
}

/// What [`crate::compile`] keys the entry note's own closure by.
const ENTRY_CLOSURE_KEY: &str = "SKILL.md";

/// The reason an outcome carries on a file that was not refused.
///
/// Only a claim and an acknowledged overwrite have one. `first-write`,
/// `rewrite` and `unchanged` are already said by the token itself, and a
/// sentence restating them would be a second vocabulary for the same fact.
fn outcome_reason(outcome: PublishOutcome) -> Option<PublishReason> {
    match outcome {
        PublishOutcome::Claimed => Some(PublishReason::new(
            ReasonToken::Claimed,
            "already byte-identical to our own output, so this destination's manifest now \
             records it",
        )),
        PublishOutcome::Overwritten => Some(PublishReason::new(
            ReasonToken::Overwritten,
            "this destination's manifest did not record it and its content differed from our \
             output, and the request named it for overwrite, so that content was replaced",
        )),
        _ => None,
    }
}

/// A closure with its hash already taken, so the write loop reads no notes.
#[derive(Debug, Clone)]
struct HashedClosure {
    hash: String,
    notes: Vec<String>,
    unresolved: Vec<String>,
    calls: Vec<String>,
    /// The note this file came from. Per closure rather than per run, because
    /// a pack's files come from as many notes as it has members, and a
    /// manifest entry records the note that produced *that* file.
    source_note: String,
}

/// Everything the write loop needs that is not the files themselves.
struct WritePlan<'a> {
    destination_root: &'a Path,
    manifest: DestinationManifest,
    closures: &'a BTreeMap<String, HashedClosure>,
    source_note: &'a str,
    target: &'a str,
    published_at: &'a str,
    overwrite: &'a [String],
    /// The projected file the note's own body became, when it is not named
    /// `SKILL.md`. See [`closure_for`].
    entry_output: Option<&'a str>,
}

/// The `(P, D, M)` classification: what we would write, what is on disk, and
/// what the manifest recorded when we last wrote that path.
///
/// Pure, and writes nothing. Evaluated in the order
/// the publish spec gives, and **the order is load-bearing**: the
/// bytes-equal test sits above the manifest tests so a run interrupted between
/// writing a file and writing the manifest self-heals. Next run the file
/// already equals what we would write, so it reports `unchanged` and the
/// manifest catches up. Put the manifest first and every crash manufactures a
/// false conflict.
fn classify(
    vfs: &dyn Vfs,
    path: &Path,
    file: &ProjectedFile,
    recorded: Option<&ManifestEntry>,
    acknowledged: bool,
) -> Result<Verdict, CoreError> {
    // Rule 3. Nothing to lose. A path the manifest records anyway is a file
    // of ours that left the destination, which is drift, not a first write.
    if !vfs.exists(path) {
        return Ok(Verdict::Write {
            outcome: if recorded.is_some() {
                PublishOutcome::Rewrite
            } else {
                PublishOutcome::FirstWrite
            },
        });
    }
    let disk = vfs.read_file(path)?;
    let disk_executable = vfs.is_executable(path);

    // Rule 2, and `P5`'s claim. Bytes identical to what we would write are
    // ours whatever the manifest says — that is what "identical to our own
    // output" means, and claiming them is what lets a destination published to
    // by an earlier build heal instead of reading as a wall of foreign files.
    // A mode that differs is still a write, but a `chmod` rather than a
    // rewrite, and it is claimed on the same grounds.
    if disk == file.content {
        let outcome = if recorded.is_none() {
            PublishOutcome::Claimed
        } else if disk_executable == file.executable {
            PublishOutcome::Unchanged
        } else {
            // Recorded, ours, and only the bit is wrong: a rewrite of our own
            // output, not a first write of it.
            PublishOutcome::Rewrite
        };
        return Ok(if disk_executable == file.executable {
            Verdict::Unchanged { outcome }
        } else {
            Verdict::Write { outcome }
        });
    }

    match recorded {
        // Rule 4. Ours, untouched since we wrote it; the note moved on.
        Some(entry)
            if file_hash(&disk) == entry.emitted_hash && disk_executable == entry.executable =>
        {
            Ok(Verdict::Write {
                outcome: PublishOutcome::Rewrite,
            })
        }
        // Rule 5. The copy was edited at the destination, and those bytes are
        // the only copy of that edit.
        Some(entry) => Ok(if acknowledged {
            Verdict::Write {
                outcome: PublishOutcome::Rewrite,
            }
        } else {
            Verdict::Refuse {
                outcome: PublishOutcome::Conflict,
                reason: PublishReason::new(ReasonToken::Conflict, conflict_reason(entry)),
            }
        }),
        // Rule 6. Not ours. We cannot tell a hand-written file from another
        // tool's export, so the manifest is a record of authorship and its
        // absence removes permission rather than granting it.
        None => Ok(if acknowledged {
            // Not `Claimed`: the byte-identical case was already taken above,
            // so what is here differs from our output and is being replaced,
            // not adopted.
            Verdict::Write {
                outcome: PublishOutcome::Overwritten,
            }
        } else {
            Verdict::Refuse {
                outcome: PublishOutcome::Foreign,
                reason: PublishReason::new(
                    ReasonToken::Foreign,
                    format!(
                        "{} is not a file this destination's manifest records, so it may be \
                         hand-authored or another tool's output. Nothing was written",
                        file.relative_path
                    ),
                ),
            }
        }),
    }
}

/// What a refused conflict says. Names the file, states what overwriting would
/// cost, and gives the last publish time when the manifest recorded one.
fn conflict_reason(entry: &ManifestEntry) -> String {
    let when = if entry.published_at.trim().is_empty() {
        "at an unrecorded time".to_owned()
    } else {
        format!("on {}", entry.published_at)
    };
    format!(
        "{} changed at the destination since we published it {when}. Overwriting would lose \
         that change, and the destination holds the only copy of it",
        entry.path
    )
}

/// One file's outcome, decided but not yet acted on.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Verdict {
    Unchanged {
        outcome: PublishOutcome,
    },
    Write {
        outcome: PublishOutcome,
    },
    Refuse {
        outcome: PublishOutcome,
        reason: PublishReason,
    },
}

/// Where a pack lands at a destination, for the targets that have a plugin
/// layout.
///
/// A plugin claims a slugged directory inside the target's own skills root —
/// never the destination root itself, which would let exactly one plugin exist
/// per destination — holding its pack manifest and its members' skills. The
/// build renders the same shape under its own `plugins/` tree; this is that
/// shape rooted where a runtime actually reads from.
struct PluginLayout {
    /// The target's skills root, which is also its plugins root.
    plugins_root: &'static str,
    /// The pack manifest's directory, in this target's dialect.
    manifest_dir: &'static str,
    dialect: PluginDialect,
    /// The runtime members are rendered through.
    runtime: &'static str,
    /// The prefix that runtime puts on a member's files, stripped on the way
    /// into the pack.
    projection_prefix: &'static str,
}

/// The plugin layout for a canonical target, or `None` where the target
/// defines none.
///
/// Two targets have one. The portable Agent Skills layout has no plugin
/// concept at all, and the remaining runtimes define no pack shape this build
/// can render into — a pack published there is refused rather than written to
/// a path invented for the occasion.
fn plugin_layout_for(canonical: &str) -> Option<PluginLayout> {
    Some(match canonical {
        "claude" => PluginLayout {
            plugins_root: ".claude/skills",
            manifest_dir: ".claude-plugin",
            dialect: PluginDialect::Claude,
            runtime: "claude-code",
            projection_prefix: ".claude/skills",
        },
        "codex" => PluginLayout {
            plugins_root: ".agents/skills",
            manifest_dir: ".codex-plugin",
            dialect: PluginDialect::Codex,
            runtime: "codex-cli",
            projection_prefix: ".agents/skills",
        },
        _ => return None,
    })
}

/// Whether a canonical target's plugin format has a place for a command.
/// The one function both `PluginLayout` and `export::RootSpec` read, so the
/// per-target fact exists once.
pub fn plugin_format_carries_commands(canonical: &str) -> bool {
    canonical == "claude"
}

/// Whether a canonical target's plugin format has a place for a hook.
///
/// Claude Code, Codex CLI and Cursor plugins all carry a hooks file at
/// [`PLUGIN_HOOKS_PATH`]. Claude and Codex load it from the plugin root by
/// default (<https://code.claude.com/docs/en/plugins-reference>,
/// <https://developers.openai.com/codex/hooks>,
/// <https://developers.openai.com/codex/plugins/build>); Cursor reads the file
/// its manifest's `hooks` entry names
/// (<https://cursor.com/docs/reference/plugins>), all read 2026-10-05. Pi takes
/// lifecycle events as TypeScript extensions and has no hooks file.
pub fn plugin_format_carries_hooks(canonical: &str) -> bool {
    matches!(canonical, "claude" | "codex" | "cursor")
}

/// Where a plugin's hooks land inside its own root, for the formats that
/// carry them.
pub const PLUGIN_HOOKS_PATH: &str = "hooks/hooks.json";

/// Renders one plugin note as a pack: its skills and, where the target's
/// plugin format has a slot, its commands — plus the pack manifest — under
/// a slugged directory at the destination.
///
/// The members come from the vault scan rather than from the note's body,
/// which is the same rule the build follows: a component's plugin is decided
/// by the folder holding it and overruled by `ap-plugin`, so the pack's roster
/// is a fact about the vault rather than a list the author maintains twice.
///
/// A member narrowed away by its own `ap-targets` is absent from the pack
/// here, exactly as it is absent from a build's root — the narrowing is the
/// member's, and a pack does not override it.
fn project_plugin(
    vfs: &dyn Vfs,
    request: &PublishRequest,
    plugin_name: &str,
    identity: &ContainerIdentity,
    vault_root: &Path,
    canonical: &str,
    ns: &Namespace,
) -> Result<PluginProjection, CoreError> {
    let layout = plugin_layout_for(canonical).ok_or_else(|| {
        CoreError::refused(
            "no-renderer",
            format!(
                "{} defines no plugin layout, so a pack cannot be published there",
                request.target
            ),
        )
    })?;

    let scan = discover_components(vfs, vault_root, None, ns)?;
    // A note elsewhere in the vault that does not parse is not this pack's
    // problem, and a shared vault always holds one. A note this pack holds
    // is: the publish spec forbids installing a subset silently, so a member the scan
    // could not read stops the pack rather than shrinking it. Membership is
    // the note's own `ap-plugin` first and its folder second, the ranking a
    // readable member follows.
    let blocked: Vec<&str> = scan
        .skipped
        .iter()
        .filter(|note| note.plugin.as_deref() == Some(plugin_name))
        .map(|note| note.path.as_str())
        .collect();
    if !blocked.is_empty() {
        return Err(CoreError::refused(
            "unreadable-note",
            format!(
                "`{plugin_name}` holds {} note(s) this scan could not read: {} — a pack must \
                 not install a subset silently",
                blocked.len(),
                blocked.join(", ")
            ),
        ));
    }
    let admitted: Vec<&DiscoveredComponent> = scan
        .components
        .iter()
        .filter(|c| c.plugin.as_deref() == Some(plugin_name) && admits_target(c, canonical))
        .collect();

    // A member this pack layout cannot hold is named, never dropped.
    let carries_commands = plugin_format_carries_commands(canonical);
    let uncarried: Vec<&str> = admitted
        .iter()
        .filter(|c| {
            !(matches!(c.kind, EntityKind::Skill)
                || (c.kind == EntityKind::Command && carries_commands))
        })
        .map(|c| c.vault_relative_path.as_str())
        .collect();
    let not_carried: Vec<String> = uncarried.iter().map(|p| (*p).to_owned()).collect();

    let members: Vec<&DiscoveredComponent> = admitted
        .iter()
        .copied()
        .filter(|c| matches!(c.kind, EntityKind::Skill))
        .collect();
    let commands: Vec<&DiscoveredComponent> = if carries_commands {
        admitted
            .into_iter()
            .filter(|c| c.kind == EntityKind::Command)
            .collect()
    } else {
        Vec::new()
    };
    if members.is_empty() && commands.is_empty() {
        return Err(CoreError::refused(
            "empty-plugin",
            format!(
                "`{plugin_name}` has no member this destination admits — every member is either \
                 absent or narrowed away by its own `ap-targets`"
            ),
        ));
    }

    let base = format!("{}/{plugin_name}", layout.plugins_root);
    let mut files = Vec::new();
    let mut closures = BTreeMap::new();

    // A pack's calls name each skill under its own plugin, the way the
    // harness names a plugin's skills, where the harness has a namespace.
    let skills = publish_skill_index(&scan.components, true, canonical);
    let runtime = crate::projection::parse_runtime_target(layout.runtime)?;
    let namespaced = runtime.skill_call_syntax().namespaced;
    let render = |skill: &IndexedSkill| {
        let plugin = skill.plugin.as_deref().filter(|_| namespaced);
        crate::export::checked_skill_call(runtime, plugin, &skill.name)
    };
    let calls = CallContext {
        skills: SkillSource::ready(&skills),
        render: &render,
        target: canonical,
        implicit: true,
        warnings: RefCell::new(Vec::new()),
    };

    for member in &members {
        let note = read_vault_skill(vfs, &member.entry_path, ns)?;
        let mut projection = note.projection;
        let member_closures = compile_projection(
            vfs,
            &CompileSource {
                vault_root,
                entry_path: &member.entry_path,
                bundle_root: member.bundle_root.as_deref(),
                skill_name: &member.name,
                calls: Some(&calls),
            },
            &mut projection,
        )?;
        let rendered = project_skill(&projection, &[layout.runtime.to_owned()], ns)?;
        let strip = format!("{}/{}/", layout.projection_prefix, member.name);
        for file in rendered {
            let relative = file.relative_path.strip_prefix(&strip).ok_or_else(|| {
                CoreError::Projection(format!(
                    "{}: `{}` did not land under `{strip}` — the {} projection moved its layout",
                    member.name, file.relative_path, layout.runtime
                ))
            })?;
            let path = format!("{base}/skills/{}/{relative}", member.name);
            if let Some(closure) = member_closures.get(relative).or_else(|| {
                // The entry's closure is keyed by the name a skill's own
                // output has, which is what `relative` is for a member's
                // `SKILL.md` — the lookup only misses for a target that
                // renames it, and a missing closure is recorded as such rather
                // than guessed at.
                member_closures.get(ENTRY_CLOSURE_KEY)
            }) {
                closures.insert(
                    path.clone(),
                    hash_one(vfs, vault_root, closure, &member.vault_relative_path)?,
                );
            }
            files.push(ProjectedFile {
                relative_path: path,
                content: file.content,
                executable: file.executable,
            });
        }
    }

    // One command's file, at `{base}/commands/<slug>.<ext>`.
    for command in &commands {
        let note = read_vault_skill(vfs, &command.entry_path, ns)?;
        let mut projection = note.projection;
        projection
            .content
            .apply_arguments(&note.frontmatter.arguments);
        let command_closures = compile_projection(
            vfs,
            &CompileSource {
                vault_root,
                entry_path: &command.entry_path,
                bundle_root: command.bundle_root.as_deref(),
                skill_name: &command.name,
                calls: Some(&calls),
            },
            &mut projection,
        )?;
        // After the compile, like the single-command path above: compiling
        // adds what the body's links and embeds reach to
        // `projection.resources`, and those peers have nowhere to go either.
        refuse_carried_peers(&projection, "command")?;
        let rendered = project_command(&projection, &[layout.runtime.to_owned()], ns, None)?;
        for file in rendered {
            let filename = Path::new(&file.relative_path).file_name().ok_or_else(|| {
                CoreError::Projection(format!(
                    "{}: `{}` names no file — the {} projection moved its layout",
                    command.name, file.relative_path, layout.runtime
                ))
            })?;
            let path = format!("{base}/commands/{}", filename.to_string_lossy());
            if let Some(closure) = command_closures.get(ENTRY_CLOSURE_KEY) {
                closures.insert(
                    path.clone(),
                    hash_one(vfs, vault_root, closure, &command.vault_relative_path)?,
                );
            }
            files.push(ProjectedFile {
                relative_path: path,
                content: file.content,
                executable: file.executable,
            });
        }
    }

    // The container's own files, at the pack root beside its manifest.
    //
    // A plugin folder holds more than its members: a licence, a readme, an
    // icon. `owned_resources` already separates those from the members' own
    // files — a path belongs to the innermost component directory containing
    // it — so what reaches here is exactly the container's, and dropping it
    // would lose the part of a pack that is not a skill.
    if let Some(note) = scan
        .components
        .iter()
        .find(|c| c.kind == EntityKind::Plugin && c.name == plugin_name)
    {
        let source_note = note.vault_relative_path.clone();
        for relative in note.resources.iter().filter(|r| is_container_own(r)) {
            let from = vault_root
                .join(&source_note)
                .parent()
                .map(|dir| dir.join(relative));
            let Some(from) = from else { continue };
            files.push(ProjectedFile {
                relative_path: format!("{base}/{relative}"),
                content: vfs.read_file(&from)?,
                executable: vfs.is_executable(&from),
            });
        }
    }

    // The pack manifest, owned by the plugin note and by nothing else:
    // publishing a member standalone never writes one.
    let config = MarketplaceConfig {
        // A per-destination publish has no marketplace above it, so the
        // marketplace-level fallbacks are absent and the plugin note's own
        // frontmatter is the only source of identity there is.
        name: None,
        display_name: None,
        owner: None,
        description: None,
        author: identity.author.clone(),
        license: None,
        default_plugin: plugin_name.to_owned(),
        plugins: [(plugin_name.to_owned(), overrides_from(identity))]
            .into_iter()
            .collect(),
        require_descriptions: false,
        // Unread on this path: a per-destination publish never renders the
        // `scripts/sdlc` shim (that's `render_root`'s job, called only from
        // `export_skills`), so this config exists solely to satisfy the
        // manifest renderer's shape.
        shim_target: DEFAULT_SHIM_TARGET.to_owned(),
    };
    files.push(ProjectedFile {
        relative_path: format!("{base}/{}/plugin.json", layout.manifest_dir),
        content: render_plugin_manifest(layout.dialect, plugin_name, &members, &config, None)
            .into_bytes(),
        executable: false,
    });

    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(PluginProjection {
        files,
        closures,
        not_carried,
    })
}

/// What a pack projects, and what it had to leave behind.
struct PluginProjection {
    files: Vec<ProjectedFile>,
    closures: BTreeMap<String, HashedClosure>,
    not_carried: Vec<String>,
}

/// Is this path the container's own content, rather than something living in
/// the structure it holds?
///
/// `owned_resources` gives a path to the innermost *component* directory
/// containing it, and a kind folder is not a component — so a snippet at
/// `skills/snippets/reviewer.md`, which no component claims, arrives as the
/// plugin's resource. It is not the plugin's content: it is vault-internal
/// writing that an embed inlines, and shipping it raw would put a copy of it
/// in the pack beside the skill that already contains it.
///
/// The container's own files are the ones outside every kind folder — a
/// licence, a readme, an icon, sitting beside the note that names the pack.
fn is_container_own(relative: &str) -> bool {
    let first = relative.split('/').next().unwrap_or("");
    !KIND_DIRS.iter().any(|(dir, _)| *dir == first)
}

/// The plugin note's own frontmatter as the build's override shape, so the two
/// paths read identity from one place.
fn overrides_from(identity: &ContainerIdentity) -> PluginOverrides {
    PluginOverrides {
        version: identity.version.clone(),
        description: None,
        author: identity.author.clone(),
        license: identity.license.clone(),
        keywords: identity.keywords.clone(),
        category: identity.category.clone(),
        display_name: identity.display_name.clone(),
    }
}

/// Does this member's `ap-targets` admit the destination being published to?
///
/// The same three readings [`publishes_to`] applies to a standalone publish —
/// absent is every destination, empty is none — spelled over a discovered
/// component because a pack's members are scanned rather than read one at a
/// time.
fn admits_target(member: &DiscoveredComponent, canonical: &str) -> bool {
    match &member.targets {
        None => true,
        Some(names) => names
            .iter()
            .any(|name| canonical_target(name) == Some(canonical)),
    }
}

/// Every skill the scan found, for a publish's calls. `namespaced` keeps each
/// skill's plugin, as a pack's calls need; without it every call is bare. A
/// skill counts as shipped when its `ap-targets` admit `canonical`; whether
/// its plugin is ever published there is beyond what one publish can see.
fn publish_skill_index(
    components: &[DiscoveredComponent],
    namespaced: bool,
    canonical: &str,
) -> SkillIndex {
    SkillIndex::new(
        components
            .iter()
            .filter(|c| c.kind == EntityKind::Skill)
            .map(|c| IndexedSkill {
                entry_path: c.entry_path.clone(),
                plugin: c.plugin.clone().filter(|_| namespaced),
                name: c.name.clone(),
                shipped: admits_target(c, canonical),
            }),
    )
}

/// One closure, hashed.
fn hash_one(
    vfs: &dyn Vfs,
    vault_root: &Path,
    closure: &Closure,
    source_note: &str,
) -> Result<HashedClosure, CoreError> {
    Ok(HashedClosure {
        hash: closure.hash(vfs, vault_root, source_note)?,
        notes: closure.contributing_notes.clone(),
        unresolved: closure.unresolved.clone(),
        calls: closure.calls.clone(),
        source_note: source_note.to_owned(),
    })
}

/// Refuses a single-file kind that carries peer resources.
///
/// A skill's projection has a directory to put them in; an agent's and a
/// command's are one file each, so peers would be dropped. Naming them is what
/// makes the refusal actionable — the author moves them, or publishes the note
/// as a skill.
///
/// `pub(crate)` so [`crate::export`] can apply the same check when a command
/// note is a marketplace pack member — the same hazard, one layer up.
pub(crate) fn refuse_carried_peers(
    projection: &SkillProjection,
    kind: &str,
) -> Result<(), CoreError> {
    if projection.resources.is_empty() {
        return Ok(());
    }
    let carried: Vec<&str> = projection
        .resources
        .iter()
        .map(|(path, _, _)| path.as_str())
        .collect();
    Err(CoreError::refused(
        "no-renderer",
        format!(
            "a {kind} publishes as a single file and carries no peers, but {} travels with \
             this note: {}. Move them, or publish this as a skill",
            carried.len(),
            carried.join(", ")
        ),
    ))
}

/// Every closure hashed once, before the write loop, so writing reads no
/// notes and a destination with fifty files does not re-read a shared snippet
/// fifty times.
fn hash_closures(
    vfs: &dyn Vfs,
    vault_root: &Path,
    closures: &BTreeMap<String, Closure>,
    source_note: &str,
) -> Result<BTreeMap<String, HashedClosure>, CoreError> {
    let mut hashed = BTreeMap::new();
    for (path, closure) in closures {
        // The owner of `SKILL.md` is the entry note; every other emitted file
        // owns itself, and its own first member says which file that is.
        let owner = if path == "SKILL.md" {
            source_note
        } else {
            closure
                .contributing_notes
                .first()
                .map(String::as_str)
                .unwrap_or(source_note)
        };
        hashed.insert(
            path.clone(),
            HashedClosure {
                hash: closure.hash(vfs, vault_root, owner)?,
                notes: closure.contributing_notes.clone(),
                unresolved: closure.unresolved.clone(),
                calls: closure.calls.clone(),
                source_note: source_note.to_owned(),
            },
        );
    }
    Ok(hashed)
}

/// A vault path as the manifest spells it: relative to the root, forward
/// slashed. Falls back to the file name when the note is not under the root,
/// which only happens where no vault root was supplied.
fn vault_relative(vault_root: &Path, path: &Path) -> String {
    path.strip_prefix(vault_root)
        .ok()
        .map(|rest| rest.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| {
            path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default()
        })
}

/// The whole projection, refused for one reason.
fn refuse_all(files: &[ProjectedFile], reason: &PublishReason) -> PublishReport {
    let mut reported: Vec<PublishedFile> = files
        .iter()
        .map(|file| PublishedFile {
            path: file.relative_path.clone(),
            status: PublishStatus::Refused,
            outcome: PublishOutcome::Blocked,
            reason: Some(reason.clone()),
        })
        .collect();
    reported.sort_by(|a, b| a.path.cmp(&b.path));
    PublishReport {
        files: reported,
        not_published: None,
        not_carried: Vec::new(),
        redundant_overrides: Vec::new(),
    }
}

/// Does this note publish to `target`?
///
/// `ap-targets`' three readings as one predicate — absent is every
/// destination, an empty list is none of them, a populated list is exactly the
/// ones it names. [`publish_skill`]
/// asks this itself; it is public so a preflight plan can show the same answer
/// rather than approximate it.
///
/// `note_path` is only ever used to name the note in a refusal, and `ns` only
/// to spell the key that refusal is about — the answer itself is already typed
/// onto [`VaultFrontmatter::targets`] by the read.
///
/// # Both vocabularies, one answer
///
/// A name is matched on the destination it resolves to, not on its letters, so
/// `ap-targets: [claude-code]` narrows a publish requested as `claude` — the
/// same equivalence `runtime_target_for` already grants a caller holding a
/// runtime name. `portable` stays its own destination even though it renders
/// through `codex-cli` today: they are two destinations that currently agree,
/// and `portable`'s `AGENTS.md` half is unwritten rather than absent by design.
///
/// # Errors
///
/// `refused: unknown-target` when any name in the list is not one this build
/// knows. The whole list is checked, whether or not `target` itself is in it:
/// an unknown name is a blocker at every destination, because the
/// destination a typo hurts is never the one being published to.
pub fn publishes_to(
    note: &VaultFrontmatter,
    note_path: &Path,
    target: &str,
    ns: &Namespace,
) -> Result<bool, CoreError> {
    // Absent is everywhere, and it is the ordinary vault: no key, no narrowing.
    let Some(declared) = note.targets.as_deref() else {
        return Ok(true);
    };

    let unknown: Vec<&str> = declared
        .iter()
        .map(String::as_str)
        .filter(|name| canonical_target(name).is_none())
        .collect();
    if !unknown.is_empty() {
        return Err(CoreError::refused(
            "unknown-target",
            format!(
                "{}: `{}` names {}, which this build does not know (known: {}). \
                 An unrecognised name is never read as \"every destination\"",
                note_path.display(),
                ns.key("targets"),
                quoted(&unknown),
                KNOWN_TARGETS.join(", ")
            ),
        ));
    }

    // Empty falls out of this honestly: a list that names nothing matches
    // nothing, which is the "published nowhere".
    let wanted = canonical_target(target).unwrap_or(target);
    Ok(declared
        .iter()
        .any(|name| canonical_target(name).is_some_and(|known| known == wanted)))
}

/// `ap-overrides`, folded onto canonical destination names and checked
/// against the harness that will receive each block.
///
/// The seam [`publishes_to`] is: a frontmatter reader types the key and this
/// function decides what it means, because deciding needs the destination
/// roster and the capability matrix and a reader should hold neither.
///
/// # Two checks, at two scopes
///
/// **Every target name is folded, whichever destination is being published**
/// — the same rule `ap-targets` follows, and for the same reason: the
/// destination a typo hurts is never the one in front of you.
///
/// **Only the named target's keys are checked.** A key legal for `claude` and
/// unknown to `codex` is the ordinary case and the whole point of the key, so
/// checking every block at every destination would refuse every well-formed
/// note. The consequence is honest and worth stating: a bad `codex` key
/// surfaces the first time something publishes to `codex`.
///
/// A target the matrix has no declaration for at all refuses every one of its
/// keys rather than passing them through. An unmapped harness receiving
/// unchecked keys is the one outcome this validation exists to prevent.
///
/// # Errors
///
/// * `refused: unknown-target` — a block is keyed by a name outside
///   [`canonical_target`].
/// * `refused: unknown-override-key` — the named target's block carries a key
///   its harness does not read. The message names both.
pub fn overrides_for(
    note: &VaultFrontmatter,
    note_path: &Path,
    target: &str,
    ns: &Namespace,
) -> Result<BTreeMap<String, serde_json::Map<String, serde_json::Value>>, CoreError> {
    let key = ns.key("overrides");
    let mut folded: BTreeMap<String, serde_json::Map<String, serde_json::Value>> = BTreeMap::new();
    for (declared, block) in &note.overrides {
        let Some(canonical) = canonical_target(declared) else {
            return Err(CoreError::refused(
                "unknown-target",
                format!(
                    "{}: `{key}` names `{declared}`, which this build does not know \
                     (known: {}). An unrecognised name is never read as \"every destination\"",
                    note_path.display(),
                    KNOWN_TARGETS.join(", ")
                ),
            ));
        };
        // `take_override_blocks` refused anything else, so this cannot lose a
        // block the author wrote.
        let block = block.as_object().cloned().unwrap_or_default();
        // Two spellings of one destination merge rather than one winning
        // silently, which is the same equivalence `publishes_to` grants.
        folded
            .entry(canonical.to_owned())
            .or_default()
            .extend(block);
    }

    let wanted = canonical_target(target).unwrap_or(target);
    if let Some(block) = folded.get(wanted) {
        let accepted = accepted_override_keys(wanted);
        let unknown: Vec<&str> = block
            .keys()
            .map(String::as_str)
            .filter(|k| !accepted.contains(*k))
            .collect();
        if !unknown.is_empty() {
            return Err(CoreError::refused(
                "unknown-override-key",
                format!(
                    "{}: `{key}.{wanted}` names {}, which `{wanted}` does not read. \
                     An override is written in that harness's own key names, and this \
                     build's capability matrix lists none of these for it",
                    note_path.display(),
                    quoted(&unknown)
                ),
            ));
        }
    }
    Ok(folded)
}

/// What one `ap-overrides` key is, at the destination it was written for.
///
/// The read-side vocabulary for the same three answers [`overrides_for`] and
/// the renderer produce between them: a surface showing a note's blocks needs
/// to draw a refusal rather than raise one, so the states are a value here
/// and an error there.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OverrideKeyState {
    /// The harness reads this key, and the value is not what the projection
    /// already writes.
    Set,
    /// The harness reads it, and the value is exactly what the projection
    /// writes anyway. A diagnostic; the note publishes unchanged.
    Redundant,
    /// The harness does not read this key at all. `overrides_for` refuses it
    /// at publish time, naming the target and the key.
    Refused,
}

impl OverrideKeyState {
    /// The wire spelling, which prose never varies from.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Set => "set",
            Self::Redundant => "redundant",
            Self::Refused => "refused",
        }
    }
}

/// One key of one block, with its verdict.
#[derive(Debug, Clone, PartialEq)]
pub struct OverrideKeyVerdict {
    /// Spelled as the harness spells it, which is how the note spells it.
    pub key: String,
    /// The value, as the note wrote it.
    pub value: serde_json::Value,
    /// How the harness treats the key.
    pub state: OverrideKeyState,
}

/// One destination's block, resolved.
#[derive(Debug, Clone, PartialEq)]
pub struct OverrideBlockState {
    /// The destination, canonically named.
    pub target: String,
    /// How many keys this harness reads in an override block at all — what a
    /// surface says about the dialect without reproducing the whole roster.
    pub accepted_keys: usize,
    /// The block's own keys, sorted.
    pub keys: Vec<OverrideKeyVerdict>,
}

/// Every block a note declares, with every key's verdict — the read-side peer
/// of [`overrides_for`].
///
/// Refuses nothing. A block keyed by a name outside [`canonical_target`] is
/// carried under that name with every key `refused`, because a view whose job
/// is to show the author what is wrong cannot be the one that stops.
///
/// `projection` is the note's own projectable half, needed because
/// *redundant* is a fact about rendered bytes rather than about the key.
pub fn override_states(
    note: &VaultFrontmatter,
    projection: &SkillProjection,
    ns: &Namespace,
) -> Vec<OverrideBlockState> {
    let _ = ns;
    let mut out = Vec::new();
    for (declared, block) in &note.overrides {
        let canonical = canonical_target(declared).unwrap_or(declared.as_str());
        let accepted = accepted_override_keys(canonical);
        let block = block.as_object().cloned().unwrap_or_default();

        // One render, per block. A destination with no renderer of its own
        // reports nothing redundant rather than failing the whole listing.
        let redundant: std::collections::BTreeSet<String> = {
            let mut snapshot = projection.clone();
            snapshot
                .content
                .apply_overrides(BTreeMap::from([(canonical.to_owned(), block.clone())]));
            crate::projection::redundant_override_keys(
                &snapshot,
                &runtime_target_for(canonical),
                ns,
                Some(canonical),
            )
            .unwrap_or_default()
            .into_iter()
            .collect()
        };

        out.push(OverrideBlockState {
            target: canonical.to_owned(),
            accepted_keys: accepted.len(),
            keys: block
                .into_iter()
                .map(|(key, value)| {
                    let state = if !accepted.contains(&key) {
                        OverrideKeyState::Refused
                    } else if redundant.contains(&key) {
                        OverrideKeyState::Redundant
                    } else {
                        OverrideKeyState::Set
                    };
                    OverrideKeyVerdict { key, value, state }
                })
                .collect(),
        });
    }
    out
}

/// Every key one destination reads in an override block, from that runtime's
/// own capability declaration.
///
/// Empty for a destination this build maps to no runtime — `cursor` today —
/// which is what makes every key under such a target a refusal rather than an
/// unchecked write.
pub fn accepted_override_keys(canonical: &str) -> std::collections::BTreeSet<String> {
    let Some(runtime) = runtime_id_for_canonical(canonical) else {
        return std::collections::BTreeSet::new();
    };
    agent_adapt::runtimes::declaration_for(runtime)
        .overrides
        .into_keys()
        .collect()
}

/// The runtime whose declaration answers for one canonical destination.
///
/// `portable` renders through the standards-only adapter. Every canonical
/// destination has one, so the `None` arm is for a name outside
/// [`canonical_target`] entirely.
fn runtime_id_for_canonical(canonical: &str) -> Option<agent_adapt::RuntimeId> {
    Some(match canonical {
        "claude" => agent_adapt::RuntimeId::ClaudeCode,
        "codex" => agent_adapt::RuntimeId::CodexCli,
        "cursor" => agent_adapt::RuntimeId::Cursor,
        "pi" => agent_adapt::RuntimeId::Pi,
        "antigravity" => agent_adapt::RuntimeId::Antigravity,
        "opencode" => agent_adapt::RuntimeId::OpenCode,
        "amp" => agent_adapt::RuntimeId::Amp,
        "copilot" => agent_adapt::RuntimeId::GithubCopilot,
        "portable" => agent_adapt::RuntimeId::Portable,
        _ => return None,
    })
}

/// Every name `ap-targets` and [`PublishRequest::target`] accept, sorted — the
/// list a refusal prints so the fix is on screen.
///
/// the publish spec's four destinations plus the runtime spellings
/// `runtime_target_for` passes through. `npm-package` renders in
/// `agent-adapt` and is deliberately absent: it is not part of the product
/// surface, and a name this list admits is a name a note may publish to.
pub const KNOWN_TARGETS: &[&str] = &[
    "amp",
    "antigravity",
    "claude",
    "claude-code",
    "codex",
    "codex-cli",
    "copilot",
    "cursor",
    "github-copilot",
    "opencode",
    "pi",
    "portable",
];

/// One name per destination, folding the destination and runtime spellings of
/// the same destination together. `None` is the publish spec's
/// `unknown-target`.
///
/// Public so the marketplace ([`crate::export`]) and other hosts fold a
/// spelling the same way a publish does.
pub fn canonical_target(name: &str) -> Option<&'static str> {
    Some(match name {
        "claude" | "claude-code" => "claude",
        "codex" | "codex-cli" => "codex",
        "portable" => "portable",
        "cursor" => "cursor",
        "pi" => "pi",
        "antigravity" => "antigravity",
        "opencode" => "opencode",
        "amp" => "amp",
        "copilot" | "github-copilot" => "copilot",
        _ => return None,
    })
}

/// [`KNOWN_TARGETS`] folded through [`canonical_target`], deduplicated and
/// sorted: one entry per destination, not per accepted spelling. The single
/// source for every list of publish destinations.
pub fn canonical_targets() -> Vec<&'static str> {
    let mut targets: Vec<&'static str> = KNOWN_TARGETS
        .iter()
        .map(|name| canonical_target(name).expect("every KNOWN_TARGETS entry canonicalizes"))
        .collect();
    targets.sort_unstable();
    targets.dedup();
    targets
}

/// Why an excluded destination got no files. Prose for a human, naming both
/// what was asked for and what the note actually says.
fn exclusion_reason(note: &VaultFrontmatter, target: &str, ns: &Namespace) -> String {
    let key = ns.key("targets");
    match note.targets.as_deref() {
        Some([]) => {
            format!("`{key}` is empty, so this note publishes nowhere — including `{target}`")
        }
        Some(declared) => {
            let names: Vec<&str> = declared.iter().map(String::as_str).collect();
            format!(
                "`{key}` does not name `{target}`; this note publishes to {}",
                quoted(&names)
            )
        }
        // Unreachable: an absent key publishes everywhere.
        None => format!("`{key}` does not name `{target}`"),
    }
}

fn quoted(names: &[&str]) -> String {
    names
        .iter()
        .map(|name| format!("`{name}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

/// What a publish may not touch when the request names no vault root.
///
/// The note's directory stands in for the vault, and the guard's ancestor rule
/// then covers the vault root and everything above it. A note that carries
/// files needs no second entry for them: that folder *is* its directory. A
/// request that does carry [`PublishRequest::skills_root`] takes the narrowed
/// rail instead — see the module doc.
fn protected_trees(skill_path: &Path) -> Vec<PathBuf> {
    skill_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| vec![p.to_path_buf()])
        .unwrap_or_default()
}

/// Resolves the publish spec's destination vocabulary onto the runtime names
/// [`crate::projection`] renders through.
///
/// The two vocabularies exist because they answer different questions: a user
/// picks a *destination* ("publish to Codex"), while `agent-adapt` renders for
/// a *runtime*. Notes:
///
/// * `codex` and `portable` are the same layout, and that is the finding, not
///   a shortcut — Codex reads the neutral `.agents/skills/` convention, which
///   *is* the portable target. The portable target's `AGENTS.md` half is not
///   emitted yet; it is an instructions file, not a skill.
/// * `cursor` is both spellings at once — the destination name and the
///   runtime name are the same word — so it passes straight through.
/// * `copilot` maps onto `github-copilot`, the runtime name
///   [`crate::projection`] validates — the same short-name/runtime-name
///   pairing `claude`/`claude-code` and `codex`/`codex-cli` already have.
/// * A runtime name (`claude-code`, `antigravity`, `github-copilot`, …) passes
///   straight through and is validated by `project_skill`/`project_command`,
///   so a caller already holding one does not have to learn a second
///   vocabulary.
fn runtime_target_for(target: &str) -> String {
    let runtime = match target {
        "claude" => "claude-code",
        "codex" | "portable" => "codex-cli",
        "copilot" => "github-copilot",
        other => other,
    };
    runtime.to_owned()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;
    use crate::corpus::RootKind;
    use crate::vfs::{MemVfs, NativeVfs};

    const NOTE: &str = "---\ndescription: reviews code\nlicense: MIT\n---\nReview the diff.\n";

    /// The default namespace. Everything below runs under `ap` — the vault
    /// that configures nothing — except the two tests at the end that are
    /// about configuring it.
    fn ap() -> Namespace {
        Namespace::default()
    }

    /// A vault holding `skills/code-review/code-review.md` plus two peers, one
    /// executable.
    fn vault_with_peers() -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills/code-review/scripts"))
            .unwrap();
        vfs.create_dir_all(Path::new("/vault/skills/code-review/references"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            NOTE.as_bytes(),
        )
        .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/code-review/scripts/check.py"),
            b"print()\n",
        )
        .unwrap();
        vfs.set_executable(
            Path::new("/vault/skills/code-review/scripts/check.py"),
            true,
        )
        .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/code-review/references/style.md"),
            b"# Style\n",
        )
        .unwrap();
        vfs
    }

    fn request(destination_root: &str, target: &str) -> PublishRequest {
        PublishRequest {
            skill_path: PathBuf::from("/vault/skills/code-review/code-review.md"),
            destination_root: PathBuf::from(destination_root),
            target: target.to_owned(),
            mode: PublishMode::Write,
            // These fixtures sit at `<root>/skills/<name>.md`, a shape the
            // structural rule says nothing about, so supplying a root would
            // not change an answer. The folder-decided case has its own test.
            skills_root: None,
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        }
    }

    /// The same request, classified rather than written.
    fn dry(destination_root: &str, target: &str) -> PublishRequest {
        PublishRequest {
            mode: PublishMode::DryRun,
            ..request(destination_root, target)
        }
    }

    /// Every file under `root`, with bytes and execute bit — the thing an
    /// "and mutates nothing" assertion has to compare.
    fn snapshot(vfs: &dyn Vfs, root: &Path) -> Vec<(String, Vec<u8>, bool)> {
        fn walk(vfs: &dyn Vfs, dir: &Path, out: &mut Vec<(String, Vec<u8>, bool)>) {
            let Ok(entries) = vfs.read_dir(dir) else {
                return;
            };
            for entry in entries {
                let path = dir.join(&entry.name);
                if entry.is_dir {
                    walk(vfs, &path, out);
                } else {
                    out.push((
                        path.display().to_string(),
                        vfs.read_file(&path).unwrap(),
                        vfs.is_executable(&path),
                    ));
                }
            }
        }
        let mut out = Vec::new();
        walk(vfs, root, &mut out);
        out.sort();
        out
    }

    /// Every path in the whole filesystem — directories as well as files, with
    /// bytes and the execute bit.
    ///
    /// [`snapshot`] answers "did this destination change". This answers "did
    /// anything, anywhere", which is the question a dry run has to survive: a
    /// run that left the target file absent but created its parent directory,
    /// or staged a temporary beside it, passes the first and fails this.
    fn everything(vfs: &dyn Vfs) -> Vec<(String, Option<Vec<u8>>, bool)> {
        fn walk(vfs: &dyn Vfs, dir: &Path, out: &mut Vec<(String, Option<Vec<u8>>, bool)>) {
            let Ok(entries) = vfs.read_dir(dir) else {
                return;
            };
            for entry in entries {
                let path = dir.join(&entry.name);
                if entry.is_dir {
                    out.push((path.display().to_string(), None, false));
                    walk(vfs, &path, out);
                } else {
                    out.push((
                        path.display().to_string(),
                        Some(vfs.read_file(&path).unwrap()),
                        vfs.is_executable(&path),
                    ));
                }
            }
        }
        let mut out = Vec::new();
        walk(vfs, Path::new("/"), &mut out);
        out.sort();
        out
    }

    /// The projected files' outcomes, without the manifest's own.
    ///
    /// The manifest is reported like any other file, and every one of these
    /// tests is about what the *projection* did. Its own row has its own
    /// tests; leaving it in here would put a line about bookkeeping in the
    /// middle of every expectation about content.
    fn statuses(report: &PublishReport) -> Vec<(&str, PublishStatus)> {
        report
            .files
            .iter()
            .filter(|f| f.path != MANIFEST_RELATIVE_PATH)
            .map(|f| (f.path.as_str(), f.status))
            .collect()
    }

    /// A report as the JSON the hosts read. Comparing two publishes at the wire
    /// is comparing the whole of what a caller sees, which is what "the two
    /// modes agree" has to mean.
    fn wire(report: &PublishReport) -> String {
        serde_json::to_string(report).unwrap()
    }

    /// One publish's whole answer: the report as JSON, or the error as the
    /// string a host would be handed.
    fn outcome(result: Result<PublishReport, CoreError>) -> Result<String, String> {
        result.map(|r| wire(&r)).map_err(|e| e.to_string())
    }

    /// How many `written`, `unchanged`, and `refused`, in that order.
    type Tally = (usize, usize, usize);

    /// The projected files' tally, without the manifest's own row — same
    /// reason as [`statuses`].
    fn tally(report: &PublishReport) -> Tally {
        let count = |status| {
            report
                .files
                .iter()
                .filter(|f| f.path != MANIFEST_RELATIVE_PATH && f.status == status)
                .count()
        };
        (
            count(PublishStatus::Written),
            count(PublishStatus::Unchanged),
            count(PublishStatus::Refused),
        )
    }

    /// The CLI spec's exit code, as far as one report decides it: `1` when anything
    /// was refused, `0` otherwise.
    ///
    /// Test-local, because the exit code belongs to the surface and not to this
    /// crate. It is here because the CLI spec says a dry run returns the code
    /// the real run would have, and this report is the input that claim is
    /// about.
    fn exit_code(report: &PublishReport) -> i32 {
        if report
            .files
            .iter()
            .any(|f| f.status == PublishStatus::Refused)
        {
            1
        } else {
            0
        }
    }

    #[test]
    fn a_note_with_peers_publishes() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        assert_eq!(
            statuses(&report),
            vec![
                (
                    ".claude/skills/code-review/SKILL.md",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/code-review/references/style.md",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/code-review/scripts/check.py",
                    PublishStatus::Written
                ),
            ]
        );
        assert!(report.files.iter().all(|f| f.reason.is_none()));

        let skill_md = vfs
            .read_file(Path::new("/dest/.claude/skills/code-review/SKILL.md"))
            .unwrap();
        let text = String::from_utf8(skill_md).unwrap();
        assert!(text.contains("name: code-review"), "{text}");
        assert!(text.contains("description: reviews code"), "{text}");
        // Unknown frontmatter survives the whole path, note to destination.
        assert!(text.contains("license: MIT"), "{text}");
        assert!(text.trim_end().ends_with("Review the diff."), "{text}");

        // Peers land beside it, execute bit intact.
        assert_eq!(
            vfs.read_file(Path::new(
                "/dest/.claude/skills/code-review/scripts/check.py"
            ))
            .unwrap(),
            b"print()\n"
        );
        assert!(vfs.is_executable(Path::new(
            "/dest/.claude/skills/code-review/scripts/check.py"
        )));
        assert!(!vfs.is_executable(Path::new(
            "/dest/.claude/skills/code-review/references/style.md"
        )));
    }

    /// Every field the `ap-` namespace owns, on one note.
    const NOTE_WITH_OUR_KEYS: &str = "---\n\
         name: code-review\n\
         description: reviews code\n\
         license: MIT\n\
         ap-kind: skill\n\
         ap-targets:\n  - claude\n  - portable\n\
         ap-plugin: marketplace-group\n\
         ap-source: /src/code-review\n\
         ap-format: claude\n\
         ap-source-hash: \"3f9ab21c\"\n\
         ap-adopted-hash: \"b17ce004\"\n\
         ap-adopted-at: \"2026-08-11T09:00:00Z\"\n\
         ap-also-at:\n  - /elsewhere/code-review\n\
         ap-not-modeled-yet: whatever\n\
         ---\nReview the diff.\n";

    /// The same information in the shape the Obsidian plugin may write.
    const NOTE_WITH_OUR_BLOCK: &str = "---\n\
         name: code-review\n\
         description: reviews code\n\
         license: MIT\n\
         ap:\n\
        \x20 kind: skill\n\
        \x20 targets:\n    - claude\n\
        \x20 plugin: marketplace-group\n\
        \x20 source: /src/code-review\n\
        \x20 source-hash: \"3f9ab21c\"\n\
        \x20 not-modeled-yet: whatever\n\
         ---\nReview the diff.\n";

    /// The regression this whole contract exists for: a note that declares
    /// our fields publishes a `SKILL.md` carrying none of them.
    ///
    /// End to end rather than a unit test on the parser, because the failure
    /// was never in one function — the reader swept our keys into
    /// `annotations` and the renderer emitted `annotations` verbatim, and each
    /// half was doing what it said. Only the whole path shows the bytes that
    /// reach disk.
    #[test]
    fn nothing_of_ours_reaches_a_destination() {
        for (shape, note) in [
            ("flat keys", NOTE_WITH_OUR_KEYS),
            ("nested block", NOTE_WITH_OUR_BLOCK),
        ] {
            let vfs = vault_with_peers();
            vfs.write_file(
                Path::new("/vault/skills/code-review/code-review.md"),
                note.as_bytes(),
            )
            .unwrap();
            vfs.create_dir_all(Path::new("/dest")).unwrap();

            publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
            let text = String::from_utf8(
                vfs.read_file(Path::new("/dest/.claude/skills/code-review/SKILL.md"))
                    .unwrap(),
            )
            .unwrap();

            // The strip is the prefix, wholesale — including the key this
            // build does not model, and including the block itself.
            for ours in [
                "ap-kind",
                "ap-targets",
                "ap-plugin",
                "marketplace-group",
                "ap-source",
                "ap-format",
                "ap-source-hash",
                "ap-adopted-hash",
                "ap-adopted-at",
                "ap-also-at",
                "ap-not-modeled-yet",
                "not-modeled-yet",
                "3f9ab21c",
                "b17ce004",
                "/src/code-review",
                "/elsewhere/code-review",
            ] {
                assert!(
                    !text.contains(ours),
                    "{shape}: `{ours}` reached the destination:\n{text}"
                );
            }
            // Not as a bare `ap:` line either.
            assert!(
                !text.contains("\nap:"),
                "{shape}: the block survived:\n{text}"
            );

            // And the rest of the note is untouched: the Agent Skills spec fields, the
            // foreign key that is the user's own, and the body.
            assert!(text.contains("name: code-review"), "{shape}: {text}");
            assert!(
                text.contains("description: reviews code"),
                "{shape}: {text}"
            );
            assert!(text.contains("license: MIT"), "{shape}: {text}");
            assert!(
                text.trim_end().ends_with("Review the diff."),
                "{shape}: {text}"
            );
        }
    }

    /// The same regression, in a vault that configured its own stem — and the
    /// reason this function takes one namespace rather than two.
    ///
    /// End to end for the same reason as the test above: the read decides what
    /// never becomes an annotation and the emit decides what never reaches
    /// disk, and only the bytes on disk show that both used the same answer.
    /// A publish that read under `x` and stripped under `ap` would fail this
    /// twice over — every `x-` key of the author's published, and an `ap-kind`
    /// that was never ours deleted.
    #[test]
    fn a_configured_namespace_is_stripped_and_the_default_prefix_is_left_alone() {
        let vfs = vault_with_peers();
        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            "---\n\
             description: reviews code\n\
             license: MIT\n\
             x-kind: skill\n\
             x-targets:\n  - claude\n\
             x-source: /src/code-review\n\
             x-source-hash: \"3f9ab21c\"\n\
             x-not-modeled-yet: whatever\n\
             ap-kind: somebody-elses-key\n\
             ---\nReview the diff.\n"
                .as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let ns = Namespace::new("x").unwrap();
        publish_skill(&vfs, &request("/dest", "claude"), &ns).unwrap();
        let text = String::from_utf8(
            vfs.read_file(Path::new("/dest/.claude/skills/code-review/SKILL.md"))
                .unwrap(),
        )
        .unwrap();

        for ours in [
            "x-kind",
            "x-targets",
            "x-source",
            "x-source-hash",
            "x-not-modeled-yet",
            "3f9ab21c",
            "/src/code-review",
        ] {
            assert!(
                !text.contains(ours),
                "`{ours}` reached the destination:\n{text}"
            );
        }
        // `ap-` is nobody's namespace in this vault. It is an annotation, and
        // an annotation is carried verbatim.
        assert!(text.contains("ap-kind"), "{text}");
        assert!(text.contains("somebody-elses-key"), "{text}");
        assert!(text.contains("license: MIT"), "{text}");
        assert!(text.trim_end().ends_with("Review the diff."), "{text}");
    }

    /// `x-targets: [claude]` narrows a configured vault's publish the same way
    /// `ap-targets` narrows the default one — and the refusal names the key
    /// the note actually carries.
    #[test]
    fn a_configured_namespace_narrows_and_refuses_under_its_own_key() {
        let ns = Namespace::new("x").unwrap();
        let vfs = vault_with_peers();
        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            b"---\ndescription: reviews code\nx-targets:\n  - claude\n---\nReview the diff.\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let report = publish_skill(&vfs, &request("/dest", "codex"), &ns).unwrap();
        assert!(report.files.is_empty());
        let reason = report.not_published.unwrap();
        assert!(reason.contains("`x-targets`"), "{reason}");
        assert!(!reason.contains("ap-targets"), "{reason}");

        // And the same note read under the default namespace publishes
        // everywhere, because `x-targets` is not a key `ap` claims — which is
        // the mis-configuration this parameter makes visible rather than
        // silent.
        let report = publish_skill(&vfs, &request("/dest", "codex"), &ap()).unwrap();
        assert!(report.not_published.is_none());
        assert!(!report.files.is_empty());
    }

    #[test]
    fn a_second_publish_is_unchanged_and_mutates_nothing() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        let before = snapshot(&vfs, Path::new("/dest"));
        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        assert!(
            report
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Unchanged),
            "{report:?}"
        );
        assert_eq!(snapshot(&vfs, Path::new("/dest")), before);
    }

    #[test]
    fn a_stale_execute_bit_alone_is_a_write() {
        // Bytes match but the published state does not: `content_hash` counts
        // the bit, so this is not "unchanged".
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        let script = Path::new("/dest/.claude/skills/code-review/scripts/check.py");
        vfs.set_executable(script, false).unwrap();

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        let script_line = report
            .files
            .iter()
            .find(|f| f.path.ends_with("check.py"))
            .unwrap();
        assert_eq!(script_line.status, PublishStatus::Written);
        assert!(vfs.is_executable(script));
    }

    #[test]
    fn an_edited_note_rewrites_only_what_changed() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            b"---\ndescription: reviews code\nlicense: MIT\n---\nReview the diff twice.\n",
        )
        .unwrap();
        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        assert_eq!(
            statuses(&report),
            vec![
                (
                    ".claude/skills/code-review/SKILL.md",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/code-review/references/style.md",
                    PublishStatus::Unchanged
                ),
                (
                    ".claude/skills/code-review/scripts/check.py",
                    PublishStatus::Unchanged
                ),
            ]
        );
    }

    #[test]
    fn a_destination_inside_the_vault_is_refused_and_writes_nothing() {
        let vfs = vault_with_peers();
        let before = snapshot(&vfs, Path::new("/vault"));

        for destination in ["/vault", "/vault/skills", "/vault/skills/code-review"] {
            let report = publish_skill(&vfs, &request(destination, "claude"), &ap()).unwrap();

            assert_eq!(statuses(&report).len(), 3, "{destination}");
            for file in &report.files {
                assert_eq!(file.status, PublishStatus::Refused, "{destination}");
                assert!(file.reason.is_some(), "{destination}");
            }
            // Not one byte, in the vault or beside it.
            assert_eq!(snapshot(&vfs, Path::new("/vault")), before, "{destination}");
        }
    }

    #[test]
    fn the_alpha_destinations_resolve_to_their_layouts() {
        let vfs = vault_with_peers();
        for (target, expected) in [
            ("claude", ".claude/skills/code-review/SKILL.md"),
            ("codex", ".agents/skills/code-review/SKILL.md"),
            ("portable", ".agents/skills/code-review/SKILL.md"),
            ("cursor", ".cursor/skills/code-review/SKILL.md"),
            // A runtime name passes straight through.
            ("antigravity", ".agents/skills/code-review/SKILL.md"),
        ] {
            vfs.create_dir_all(Path::new("/dest")).unwrap();
            let report = publish_skill(&vfs, &request("/dest", target), &ap()).unwrap();
            assert!(
                report.files.iter().any(|f| f.path == expected),
                "{target}: {report:?}"
            );
        }
    }

    /// Cursor's tree is its own, not a neighbour's renamed: the peers land
    /// beside the skill and the frontmatter is Cursor's dialect.
    #[test]
    fn cursor_publishes_its_own_tree_rather_than_a_neighbours() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        let report = publish_skill(&vfs, &request("/dest", "cursor"), &ap()).unwrap();
        let paths: Vec<&str> = report.files.iter().map(|f| f.path.as_str()).collect();
        for expected in [
            ".cursor/skills/code-review/SKILL.md",
            ".cursor/skills/code-review/references/style.md",
            ".cursor/skills/code-review/scripts/check.py",
        ] {
            assert!(paths.contains(&expected), "{expected}: {paths:?}");
        }
        // Nothing in a neighbour's tree — only Cursor's, plus the publish
        // manifest every destination carries.
        assert!(
            paths
                .iter()
                .all(|p| p.starts_with(".cursor/skills/") || *p == ".agent-pants/manifest.json"),
            "{paths:?}"
        );
    }

    #[test]
    fn an_unknown_target_is_refused_not_skipped() {
        let vfs = vault_with_peers();
        let err = publish_skill(&vfs, &request("/dest", "emacs"), &ap()).unwrap_err();
        assert!(matches!(err, CoreError::Projection(_)), "{err}");
    }

    #[test]
    fn a_note_that_is_not_a_skill_fails_before_anything_is_written() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills/code-review"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            b"No frontmatter.\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let err = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap_err();
        assert!(err.to_string().contains("description"), "{err}");
        assert!(snapshot(&vfs, Path::new("/dest")).is_empty());
    }

    // --- the write path ----------------------------------------------------

    fn projected(relative_path: &str, content: &[u8]) -> ProjectedFile {
        ProjectedFile {
            relative_path: relative_path.to_owned(),
            content: content.to_vec(),
            executable: false,
        }
    }

    /// A plan for the two tests that drive the writer directly: an empty
    /// manifest, so every file is new and nothing has to be claimed.
    fn bare_plan<'a>(
        destination_root: &'a Path,
        closures: &'a BTreeMap<String, HashedClosure>,
    ) -> WritePlan<'a> {
        WritePlan {
            destination_root,
            manifest: DestinationManifest::new(),
            closures,
            source_note: "skills/x.md",
            target: "claude",
            published_at: "2026-08-29T10:00:00Z",
            overwrite: &[],
            entry_output: None,
        }
    }

    #[test]
    fn a_refusal_leaves_no_partial_tree_from_the_resources_before_it() {
        // The projection is built by hand because the renderer refuses these
        // paths too — this is the writer's own rail, tested on its own. Three
        // files, and the one that escapes is last: the two ahead of it must
        // not be on disk afterwards.
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        let before = everything(&vfs);

        let files = vec![
            projected(".claude/skills/x/SKILL.md", b"# x\n"),
            projected(".claude/skills/x/references/style.md", b"# style\n"),
            projected("../../../etc/evil.sh", b"pwned\n"),
        ];

        let closures = BTreeMap::new();
        let err =
            write_projection(&vfs, &bare_plan(Path::new("/dest"), &closures), &files).unwrap_err();
        let message = err.to_string();

        assert!(matches!(err, CoreError::Refused(_)), "{message}");
        assert!(message.starts_with("refused: unsafe-path: "), "{message}");
        assert!(message.contains("../../../etc/evil.sh"), "{message}");
        // Not the two innocent files, and not the directories they would have
        // needed either.
        assert_eq!(everything(&vfs), before);
        assert!(!vfs.exists(Path::new("/dest/.claude")));
    }

    #[test]
    fn a_projection_that_stays_inside_the_root_writes_every_file() {
        // The other half of the test above: the rail is not simply refusing.
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        let files = vec![
            projected(".claude/skills/x/SKILL.md", b"# x\n"),
            projected(".claude/skills/x/references/style.md", b"# style\n"),
        ];

        let closures = BTreeMap::new();
        let reported =
            write_projection(&vfs, &bare_plan(Path::new("/dest"), &closures), &files).unwrap();

        assert!(reported.iter().all(|f| f.status == PublishStatus::Written));
        assert!(vfs.exists(Path::new("/dest/.claude/skills/x/SKILL.md")));
        assert!(vfs.exists(Path::new("/dest/.claude/skills/x/references/style.md")));
    }

    /// A vault and a destination on a real filesystem, because a symlink is
    /// the one thing [`MemVfs`] cannot have.
    #[cfg(unix)]
    fn native_vault(tmp: &Path) -> PublishRequest {
        let vault = tmp.join("vault");
        std::fs::create_dir_all(vault.join("skills/code-review/scripts")).unwrap();
        std::fs::write(vault.join("skills/code-review/code-review.md"), NOTE).unwrap();
        std::fs::write(
            vault.join("skills/code-review/scripts/check.py"),
            b"print()\n",
        )
        .unwrap();
        PublishRequest {
            skill_path: vault.join("skills/code-review/code-review.md"),
            destination_root: tmp.join("dest"),
            target: "claude".to_owned(),
            mode: PublishMode::Write,
            skills_root: None,
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_destination_directory_that_is_a_link_out_of_the_root_is_refused_in_both_modes() {
        // The part no lexical check can reach: every path here is inside
        // `dest/` as a string, and outside it on disk.
        let tmp = tempfile::tempdir().unwrap();
        let request = native_vault(tmp.path());
        let dest = request.destination_root.clone();
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, dest.join(".claude")).unwrap();

        for mode in [PublishMode::Write, PublishMode::DryRun] {
            let asked = PublishRequest {
                mode,
                ..request.clone()
            };
            let err = publish_skill(&NativeVfs, &asked, &ap()).unwrap_err();
            let message = err.to_string();

            assert!(matches!(err, CoreError::Refused(_)), "{mode:?}: {message}");
            assert!(message.contains("unsafe-path"), "{mode:?}: {message}");
            assert!(
                message.contains(".claude/skills/code-review/"),
                "{mode:?}: {message}"
            );
            // A dry run refuses exactly what a real run refuses, and neither
            // wrote a byte through the link.
            assert_eq!(
                std::fs::read_dir(&outside).unwrap().count(),
                0,
                "{mode:?}: something was written outside the destination"
            );
        }

        // And with a real directory in place of the link, the same publish
        // lands — so what was refused was the escape, not the layout.
        std::fs::remove_file(dest.join(".claude")).unwrap();
        let report = publish_skill(&NativeVfs, &request, &ap()).unwrap();
        assert_eq!(statuses(&report).len(), 2, "{report:?}");
        assert!(dest.join(".claude/skills/code-review/SKILL.md").exists());
        assert_eq!(std::fs::read_dir(&outside).unwrap().count(), 0);
    }

    #[test]
    fn the_protected_tree_is_the_notes_own_and_nothing_else() {
        // The publish spec: the vault is the only protected path.
        // This pins the list at one entry, so a scan location cannot be added
        // to it without this test saying so.
        assert_eq!(
            protected_trees(Path::new("/vault/skills/code-review/code-review.md")),
            vec![PathBuf::from("/vault/skills/code-review")]
        );
    }

    #[test]
    fn a_destination_that_overlaps_a_scan_location_publishes_normally() {
        // A registered scan location is not a protected path. The destination
        // here is one, and it publishes.
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        let scanned = crate::CorpusRoot::new("dest", "Destination", "/dest", RootKind::Registered);
        crate::scan::scan_root(&vfs, &scanned, &crate::scan::ScanOptions::default());

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        assert_eq!(statuses(&report).len(), 3, "{report:?}");
        assert!(
            report
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Written),
            "{report:?}"
        );
        assert!(vfs.exists(Path::new("/dest/.claude/skills/code-review/SKILL.md")));
    }

    // --- the rail, narrowed by a vault root on the request ------------------

    /// The same request, with the vault root the fixtures sit under.
    fn vaulted(destination_root: &str, target: &str) -> PublishRequest {
        PublishRequest {
            skills_root: Some(PathBuf::from("/vault")),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
            ..request(destination_root, target)
        }
    }

    #[test]
    fn an_ancestor_of_the_vault_publishes_when_the_request_names_the_vault() {
        // The gap the write-guard spec name: `~` with the vault under
        // it. `/` contains `/vault`, and the writes land under `/.claude/`,
        // disjoint from it.
        let vfs = vault_with_peers();
        let report = publish_skill(&vfs, &vaulted("/", "claude"), &ap()).unwrap();
        assert!(
            report
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Written),
            "{report:?}"
        );
        assert!(vfs.exists(Path::new("/.claude/skills/code-review/SKILL.md")));
    }

    #[test]
    fn the_same_ancestor_stays_refused_without_a_vault_root() {
        // The fallback tree is the note's parent, and the wider ancestor rule
        // still errs toward refusal when the rail cannot see the writes.
        let vfs = vault_with_peers();
        let report = publish_skill(&vfs, &request("/", "claude"), &ap()).unwrap();
        assert!(
            report
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Refused),
            "{report:?}"
        );
    }

    #[test]
    fn the_vault_and_anything_inside_it_are_refused_as_destinations() {
        let vfs = vault_with_peers();
        for dest in ["/vault", "/vault/out"] {
            let report = publish_skill(&vfs, &vaulted(dest, "claude"), &ap()).unwrap();
            assert!(
                report
                    .files
                    .iter()
                    .all(|f| f.status == PublishStatus::Refused),
                "{dest}: {report:?}"
            );
            let reason = report.files[0].reason.clone().unwrap();
            assert_eq!(reason.token, ReasonToken::UnsafeRoot, "{dest}: {reason}");
            assert!(reason.to_string().contains("vault"), "{dest}: {reason}");
        }
    }

    #[test]
    fn an_ancestor_whose_write_would_land_inside_the_vault_is_refused() {
        // The vault IS a `.claude/skills/<name>` tree, so publishing to its
        // grandparent computes the vault's own note directory as the write
        // target. The destination is an ordinary ancestor; the writes are
        // what convict it.
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/home/.claude/skills/code-review"))
            .unwrap();
        vfs.write_file(
            Path::new("/home/.claude/skills/code-review/code-review.md"),
            NOTE.as_bytes(),
        )
        .unwrap();
        let asked = PublishRequest {
            skill_path: PathBuf::from("/home/.claude/skills/code-review/code-review.md"),
            destination_root: PathBuf::from("/home"),
            target: "claude".to_owned(),
            mode: PublishMode::Write,
            skills_root: Some(PathBuf::from("/home/.claude")),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        };
        let report = publish_skill(&vfs, &asked, &ap()).unwrap();
        assert!(
            report
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Refused),
            "{report:?}"
        );
        let reason = report.files[0].reason.clone().unwrap();
        assert_eq!(reason.token, ReasonToken::UnsafeRoot, "{reason}");
        assert!(reason.to_string().contains("inside the vault"), "{reason}");
        // The note the write aimed at is exactly as it was.
        assert_eq!(
            vfs.read_file(Path::new("/home/.claude/skills/code-review/code-review.md"))
                .unwrap(),
            NOTE.as_bytes()
        );
    }

    #[test]
    fn a_host_that_cannot_see_links_keeps_the_ancestor_refusal() {
        // A wasm host without link methods keeps the lexical canonicalize over
        // a real filesystem, so a link can hide from it. There the narrowing must
        // not happen: an ancestor of the vault stays refused even with the
        // vault root on the request.
        let vfs = crate::vfs::LinkBlindVfs(vault_with_peers());
        let report = publish_skill(&vfs, &vaulted("/", "claude"), &ap()).unwrap();
        assert!(
            report
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Refused),
            "{report:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_under_an_ancestor_destination_cannot_route_a_write_into_the_vault() {
        // The adopter demographic: agent config version-controlled in the
        // vault, `~/.claude` a symlink into it. Lexically every write path
        // is disjoint from the vault; physically each one lands inside it.
        // The rail must convict the writes, in both modes, before a byte.
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home");
        let vault = home.join("notes");
        std::fs::create_dir_all(vault.join("skills/code-review")).unwrap();
        std::fs::write(vault.join("skills/code-review/code-review.md"), NOTE).unwrap();
        std::fs::create_dir_all(vault.join("claude-config/skills/code-review")).unwrap();
        let guarded = vault.join("claude-config/skills/code-review/SKILL.md");
        std::fs::write(
            &guarded,
            b"MY VAULT NOTE
",
        )
        .unwrap();
        std::os::unix::fs::symlink(vault.join("claude-config"), home.join(".claude")).unwrap();

        for mode in [PublishMode::Write, PublishMode::DryRun] {
            let request = PublishRequest {
                skill_path: vault.join("skills/code-review/code-review.md"),
                destination_root: home.clone(),
                target: "claude".to_owned(),
                mode,
                skills_root: Some(vault.clone()),
                published_at: Some("2026-08-29T10:00:00Z".to_owned()),
                overwrite: Vec::new(),
            };
            let report = publish_skill(&NativeVfs, &request, &ap()).unwrap();
            assert!(
                report
                    .files
                    .iter()
                    .all(|f| f.status == PublishStatus::Refused),
                "{mode:?}: {report:?}"
            );
            let reason = report.files[0].reason.clone().unwrap();
            assert_eq!(reason.token, ReasonToken::UnsafeRoot, "{mode:?}: {reason}");
            assert!(
                reason.to_string().contains("inside the vault"),
                "{mode:?}: {reason}"
            );
            assert_eq!(
                std::fs::read(&guarded).unwrap(),
                b"MY VAULT NOTE
",
                "{mode:?}: the vault note was touched"
            );
        }

        // The same geometry with a real directory in place of the link
        // publishes — what was refused was the routing, not the layout.
        std::fs::remove_file(home.join(".claude")).unwrap();
        let request = PublishRequest {
            skill_path: vault.join("skills/code-review/code-review.md"),
            destination_root: home.clone(),
            target: "claude".to_owned(),
            mode: PublishMode::Write,
            skills_root: Some(vault.clone()),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        };
        let report = publish_skill(&NativeVfs, &request, &ap()).unwrap();
        assert!(
            report
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Written),
            "{report:?}"
        );
        assert!(home.join(".claude/skills/code-review/SKILL.md").is_file());
        assert_eq!(
            std::fs::read(&guarded).unwrap(),
            b"MY VAULT NOTE
"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_case_variant_vault_is_still_the_vault_on_a_case_insensitive_filesystem() {
        // On default APFS `.Claude` and `.claude` are one directory, so a
        // vault spelled `.Claude` sits exactly where the projection writes
        // `.claude/…`. String comparison misses that; resolution does not.
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home");
        let vault = home.join(".Claude");
        std::fs::create_dir_all(vault.join("library/code-review")).unwrap();
        std::fs::write(vault.join("library/code-review/code-review.md"), NOTE).unwrap();
        std::fs::create_dir_all(vault.join("skills/code-review")).unwrap();
        let guarded = vault.join("skills/code-review/SKILL.md");
        std::fs::write(
            &guarded,
            b"MY VAULT NOTE
",
        )
        .unwrap();

        // A case-sensitive volume (APFS's opt-in variant) makes the two
        // spellings genuinely different directories; nothing to defend.
        if std::fs::canonicalize(home.join(".claude")).is_err() {
            return;
        }

        let request = PublishRequest {
            skill_path: vault.join("library/code-review/code-review.md"),
            destination_root: home.clone(),
            target: "claude".to_owned(),
            mode: PublishMode::Write,
            skills_root: Some(vault.clone()),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        };
        let report = publish_skill(&NativeVfs, &request, &ap()).unwrap();
        assert!(
            report
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Refused),
            "{report:?}"
        );
        assert_eq!(
            std::fs::read(&guarded).unwrap(),
            b"MY VAULT NOTE
"
        );
    }

    // --- `ap-targets` ------------------------------------------------------

    /// A note declaring `ap-targets: <yaml>`, or none at all for `None`.
    fn note_targeting(yaml: Option<&str>) -> String {
        match yaml {
            Some(list) => format!(
                "---\ndescription: reviews code\nap-targets: {list}\n---\nReview the diff.\n"
            ),
            None => NOTE.to_owned(),
        }
    }

    /// A vault whose note carries the given `ap-targets`.
    fn vault_targeting(yaml: Option<&str>) -> MemVfs {
        let vfs = vault_with_peers();
        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            note_targeting(yaml).as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    #[test]
    fn no_targets_key_publishes_everywhere() {
        // The ordinary vault: no key, no narrowing, every destination.
        for target in ["claude", "codex", "portable", "antigravity"] {
            let vfs = vault_targeting(None);
            let report = publish_skill(&vfs, &request("/dest", target), &ap()).unwrap();

            assert_eq!(statuses(&report).len(), 3, "{target}: {report:?}");
            assert!(report.not_published.is_none(), "{target}");
            assert!(
                report
                    .files
                    .iter()
                    .all(|f| f.status == PublishStatus::Written),
                "{target}: {report:?}"
            );
        }
    }

    #[test]
    fn an_empty_targets_list_publishes_nowhere() {
        // Empty is nowhere, and it has to stay distinguishable from
        // absent — read as "all" it would publish where the author said not to.
        for target in ["claude", "codex", "portable", "antigravity"] {
            let vfs = vault_targeting(Some("[]"));
            let report = publish_skill(&vfs, &request("/dest", target), &ap()).unwrap();

            assert!(report.files.is_empty(), "{target}: {report:?}");
            let reason = report.not_published.expect("a reason, not a silent skip");
            assert!(reason.contains("ap-targets"), "{reason}");
            assert!(reason.contains("nowhere"), "{reason}");
            // Not one byte at the destination.
            assert!(snapshot(&vfs, Path::new("/dest")).is_empty(), "{target}");
        }
    }

    #[test]
    fn a_listed_destination_publishes_and_an_unlisted_one_does_not() {
        // Excluded is "not published", which is no files at all —
        // not a fourth per-file status, and not an orphan.
        let vfs = vault_targeting(Some("[claude]"));

        let published = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        assert_eq!(statuses(&published).len(), 3, "{published:?}");
        assert!(published.not_published.is_none());
        assert!(
            vfs.exists(Path::new("/dest/.claude/skills/code-review/SKILL.md")),
            "the destination it names must actually get files"
        );

        let before = snapshot(&vfs, Path::new("/dest"));
        for excluded in ["codex", "portable", "antigravity"] {
            let report = publish_skill(&vfs, &request("/dest", excluded), &ap()).unwrap();

            assert!(report.files.is_empty(), "{excluded}: {report:?}");
            let reason = report.not_published.expect("a reason");
            assert!(reason.contains(excluded), "{reason}");
            assert!(reason.contains("`claude`"), "{reason}");
            // And nothing moved, including what the listed target published.
            assert_eq!(snapshot(&vfs, Path::new("/dest")), before, "{excluded}");
        }
    }

    #[test]
    fn the_two_spellings_of_one_destination_are_one_destination() {
        // `ap-targets: [claude-code]` narrows a publish requested as `claude`.
        // The decision's own example writes runtime names, `runtime_target_for`
        // accepts both, and a note that had to guess which one the caller would
        // type would be a note that silently stops publishing.
        for (declared, requested) in [
            ("[claude-code]", "claude"),
            ("[claude]", "claude-code"),
            ("[codex-cli]", "codex"),
            ("[codex]", "codex-cli"),
        ] {
            let vfs = vault_targeting(Some(declared));
            let report = publish_skill(&vfs, &request("/dest", requested), &ap()).unwrap();
            assert_eq!(
                statuses(&report).len(),
                3,
                "{declared} -> {requested}: {report:?}"
            );
        }

        // `portable` is not `codex`, though they render alike today: two
        // destinations that agree by accident, not one destination.
        let vfs = vault_targeting(Some("[portable]"));
        let report = publish_skill(&vfs, &request("/dest", "codex"), &ap()).unwrap();
        assert!(report.files.is_empty(), "{report:?}");
    }

    #[test]
    fn an_unknown_target_name_blocks_every_file_and_writes_nothing() {
        // Not "matches nothing" (which would silently unpublish) and
        // not "all" (which would publish where the author said not to): a
        // blocker, stamped on every projected file, naming the value.
        let vfs = vault_targeting(Some("[claude, claud]"));
        let before = snapshot(&vfs, Path::new("/dest"));

        // Including at the destination the note *does* name — that is what
        // makes the typo visible on the first publish.
        for target in ["claude", "codex"] {
            let report = publish_skill(&vfs, &request("/dest", target), &ap()).unwrap();

            assert_eq!(statuses(&report).len(), 3, "{target}: {report:?}");
            for file in &report.files {
                assert_eq!(file.status, PublishStatus::Refused, "{target}");
                let reason = file.reason.as_ref().expect("a reason");
                assert_eq!(reason.token, ReasonToken::UnknownTarget, "{reason}");
                let detail = reason.detail.as_deref().expect("prose beside the token");
                assert!(detail.contains("`claud`"), "{detail}");
                assert!(
                    detail.contains("/vault/skills/code-review/code-review.md"),
                    "{detail}"
                );
                // The fix is on screen.
                assert!(detail.contains("portable"), "{detail}");
            }
            assert_eq!(snapshot(&vfs, Path::new("/dest")), before, "{target}");
        }
    }

    #[test]
    fn the_predicate_answers_the_three_readings_on_its_own() {
        // Public, because a preflight plan has to show the same answer
        // `publish_skill` will act on rather than approximate it.
        let path = Path::new("/vault/skills/code-review/code-review.md");
        let with = |targets: Option<Vec<&str>>| VaultFrontmatter {
            targets: targets.map(|t| t.iter().map(|s| (*s).to_owned()).collect()),
            ..VaultFrontmatter::default()
        };

        assert!(publishes_to(&with(None), path, "claude", &ap()).unwrap());
        assert!(!publishes_to(&with(Some(vec![])), path, "claude", &ap()).unwrap());
        assert!(publishes_to(&with(Some(vec!["claude"])), path, "claude", &ap()).unwrap());
        assert!(!publishes_to(&with(Some(vec!["claude"])), path, "codex", &ap()).unwrap());

        // Every name the request vocabulary accepts is a name the key accepts.
        for name in KNOWN_TARGETS {
            assert!(
                publishes_to(&with(Some(vec![name])), path, name, &ap()).unwrap(),
                "{name}"
            );
        }

        let err =
            publishes_to(&with(Some(vec!["npm-package"])), path, "claude", &ap()).unwrap_err();
        assert!(err.to_string().contains("unknown-target"), "{err}");
    }

    /// Pinned to the roster in `docs/vault/design/command-destinations.md`;
    /// adding a destination updates both.
    #[test]
    fn canonical_targets_matches_the_documented_destination_roster() {
        assert_eq!(
            canonical_targets(),
            vec![
                "amp",
                "antigravity",
                "claude",
                "codex",
                "copilot",
                "cursor",
                "opencode",
                "pi",
                "portable",
            ]
        );

        // Every `KNOWN_TARGETS` spelling — canonical or alias — folds onto a
        // member of the derived list. A spelling `canonical_target` cannot
        // fold panics inside `canonical_targets()` itself (its `.expect()`),
        // so this also re-asserts that `canonical_targets()` did not panic.
        for name in KNOWN_TARGETS {
            assert!(
                canonical_targets().contains(&canonical_target(name).unwrap()),
                "{name}"
            );
        }
    }

    // --- Agents ---------------------------------------------------------------

    // `concat!` rather than a wrapped literal: a `\`-continued string keeps the
    // indentation the formatter puts back, which silently indented this
    // fixture's body by nine spaces — enough for markdown to read it as a code
    // block, in a test asserting what reaches a destination.
    const AGENT_NOTE: &str = concat!(
        "---\nname: senior-reviewer\ndescription: Reviews like a staff engineer.\n",
        "allowed-tools:\n  - Read\n  - Grep\nmodel: opus\nap-kind: agent\n---\n\n",
        "You are a senior reviewer. Be specific.\n"
    );

    /// A vault holding one agent note and nothing that travels with it.
    fn vault_with_agent() -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(
            Path::new("/vault/skills/senior-reviewer.md"),
            AGENT_NOTE.as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    fn agent_request() -> PublishRequest {
        PublishRequest {
            skill_path: PathBuf::from("/vault/skills/senior-reviewer.md"),
            destination_root: PathBuf::from("/dest"),
            target: "claude".to_owned(),
            mode: PublishMode::Write,
            skills_root: Some(PathBuf::from("/vault")),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        }
    }

    // `agent` was in the vocabulary, discovered, listed, and refused at every
    // publish. The renderer existed the whole time; nothing routed to it.
    #[test]
    fn an_agent_note_publishes_into_the_agents_layout() {
        let vfs = vault_with_agent();

        let report = publish_skill(&vfs, &agent_request(), &ap()).unwrap();

        assert_eq!(
            statuses(&report),
            vec![(".claude/agents/senior-reviewer.md", PublishStatus::Written)]
        );
        assert!(vfs.exists(Path::new("/dest/.claude/agents/senior-reviewer.md")));
        // Not the skills layout: the two are different files at different
        // paths, which is the whole reason the kind decides the entry point.
        assert!(!vfs.exists(Path::new("/dest/.claude/skills/senior-reviewer")));
    }

    // An agent note's prose is what the harness loads as its instructions,
    // the same way a skill note's prose is what a SKILL.md carries.
    #[test]
    fn the_body_becomes_the_system_prompt_and_the_modelled_fields_travel() {
        let vfs = vault_with_agent();
        publish_skill(&vfs, &agent_request(), &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/agents/senior-reviewer.md");
        assert!(
            published.contains("You are a senior reviewer."),
            "{published}"
        );
        assert!(
            published.contains("opus"),
            "the model did not travel: {published}"
        );
        assert!(
            published.contains("Grep"),
            "the tools did not travel: {published}"
        );
        // Ours never travels, whatever the kind.
        assert!(!published.contains("ap-kind"), "{published}");
    }

    // The compile pass is the note's, not the skill's: an agent that embeds a
    // snippet publishes the snippet's prose, exactly as a skill does.
    #[test]
    fn an_agent_body_is_compiled_like_a_skills() {
        let vfs = vault_with_agent();
        vfs.create_dir_all(Path::new("/vault/skills/snippets"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/snippets/tone.md"),
            b"---\ntag: fragment\n---\n\nBe terse.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/senior-reviewer.md"),
            b"---\nname: senior-reviewer\ndescription: d\nap-kind: agent\n---\n\n![[tone]]\n",
        )
        .unwrap();

        publish_skill(&vfs, &agent_request(), &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/agents/senior-reviewer.md");
        assert!(published.contains("Be terse."), "{published}");
        assert!(!published.contains("![["), "{published}");
    }

    // An agent renders to one file, so a note carrying peers has files with
    // nowhere to go. Refusing beats dropping them.
    #[test]
    fn an_agent_note_carrying_peers_is_refused_rather_than_losing_them() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills/senior-reviewer/scripts"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/senior-reviewer/senior-reviewer.md"),
            AGENT_NOTE.as_bytes(),
        )
        .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/senior-reviewer/scripts/check.py"),
            b"print()\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let mut request = agent_request();
        request.skill_path = PathBuf::from("/vault/skills/senior-reviewer/senior-reviewer.md");
        let err = publish_skill(&vfs, &request, &ap()).unwrap_err();

        let message = err.to_string();
        assert!(message.contains("no-renderer"), "{message}");
        assert!(message.contains("scripts/check.py"), "{message}");
        assert!(!vfs.exists(Path::new("/dest/.claude")));
    }

    // Everything tracking does for a skill it does for an agent, because
    // tracking is per emitted file and knows nothing about kinds.
    #[test]
    fn an_agent_is_tracked_like_anything_else() {
        let vfs = vault_with_agent();
        publish_skill(&vfs, &agent_request(), &ap()).unwrap();

        let manifest = manifest_of(&vfs, "/dest");
        let entry = manifest
            .get(".claude/agents/senior-reviewer.md")
            .expect("the agent is recorded");
        assert_eq!(entry.source_note, "skills/senior-reviewer.md");
        assert!(!entry.source_hash.is_empty());

        // And a second publish is a no-op, as it is for a skill.
        let again = publish_skill(&vfs, &agent_request(), &ap()).unwrap();
        assert!(
            again
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Unchanged),
            "{again:?}"
        );
    }

    // A note that says nothing publishes as a skill; the folder is what makes
    // this one an agent, and the resolved kind is what routes it.
    #[test]
    fn a_note_in_an_agents_folder_publishes_as_an_agent_without_saying_so() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/plugins/core/agents"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/plugins/core/agents/triage.md"),
            b"---\nname: triage\ndescription: Triages an issue.\n---\n\nSort it.\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let mut request = agent_request();
        request.skill_path = PathBuf::from("/vault/plugins/core/agents/triage.md");
        publish_skill(&vfs, &request, &ap()).unwrap();

        assert!(vfs.exists(Path::new("/dest/.claude/agents/triage.md")));
    }

    // --- Commands -------------------------------------------------------------

    const COMMAND_NOTE: &str = concat!(
        "---\nname: ship\ndescription: Cuts a release.\n",
        "argument-hint: <version>\nallowed-tools:\n  - Read\nap-kind: command\n---\n\n",
        "Cut the release for $ARGUMENTS.\n"
    );

    fn vault_with_command() -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(Path::new("/vault/skills/ship.md"), COMMAND_NOTE.as_bytes())
            .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    fn command_request(target: &str) -> PublishRequest {
        PublishRequest {
            skill_path: PathBuf::from("/vault/skills/ship.md"),
            destination_root: PathBuf::from("/dest"),
            target: target.to_owned(),
            mode: PublishMode::Write,
            skills_root: Some(PathBuf::from("/vault")),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        }
    }

    #[test]
    fn a_command_publishes_into_the_commands_layout() {
        let vfs = vault_with_command();

        let report = publish_skill(&vfs, &command_request("claude"), &ap()).unwrap();

        assert_eq!(
            statuses(&report),
            vec![(".claude/commands/ship.md", PublishStatus::Written)]
        );
    }

    // The key a skill carries and no skill renderer emits, because a skill is
    // chosen by the model rather than typed by a person.
    #[test]
    fn the_argument_hint_finally_reaches_a_destination() {
        let vfs = vault_with_command();
        publish_skill(&vfs, &command_request("claude"), &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/commands/ship.md");
        assert!(published.contains("<version>"), "{published}");
        assert!(
            published.contains("Cut the release for $ARGUMENTS."),
            "{published}"
        );
        assert!(!published.contains("ap-kind"), "{published}");
    }

    const COMMAND_WITH_ARGUMENTS_NOTE: &str = concat!(
        "---\nname: ship\ndescription: Cuts a release.\nap-kind: command\n",
        "ap-arguments:\n  - name: version\n    description: The version to cut.\n    required: true\n",
        "  - name: channel\n    values: [stable, beta]\n    default: stable\n",
        "---\n\nCut the release.\n"
    );

    fn vault_with_command_arguments() -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(
            Path::new("/vault/skills/ship.md"),
            COMMAND_WITH_ARGUMENTS_NOTE.as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    // No hand-written `argument-hint`, so publish derives one from
    // `ap-arguments` — never written back into the note, only into what is
    // published — and renders the body section beside it.
    #[test]
    fn an_absent_hint_is_derived_from_arguments_and_the_section_is_rendered() {
        let vfs = vault_with_command_arguments();
        publish_skill(&vfs, &command_request("claude"), &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/commands/ship.md");
        assert!(
            published.contains("argument-hint: \"<version> [channel: stable|beta=stable]\""),
            "{published}"
        );
        // Claude Code's own named-substitution key, also derived: absent
        // means `$version`/`$channel` mean nothing to that dialect at all.
        assert!(
            published.contains("arguments:\n  - version\n  - channel"),
            "{published}"
        );
        assert!(published.contains("## Arguments"), "{published}");
        assert!(
            published.contains("- `version` (required): The version to cut."),
            "{published}"
        );
        assert!(
            published.contains("- `channel` (optional, one of `stable`, `beta`, default `stable`)"),
            "{published}"
        );
        assert!(!published.contains("ap-arguments"), "{published}");

        // The vault note itself is untouched — the hint and the section are
        // derived at publish time, never written back.
        let source = text_at(&vfs, "/vault/skills/ship.md");
        assert_eq!(source, COMMAND_WITH_ARGUMENTS_NOTE);
    }

    // A hand-written hint always wins over the derived one.
    #[test]
    fn a_hand_written_hint_is_never_overridden_by_a_derived_one() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(
            Path::new("/vault/skills/ship.md"),
            concat!(
                "---\nname: ship\ndescription: Cuts a release.\nap-kind: command\n",
                "argument-hint: <handwritten>\n",
                "ap-arguments:\n  - name: version\n",
                "---\n\nCut the release.\n"
            )
            .as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        publish_skill(&vfs, &command_request("claude"), &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/commands/ship.md");
        assert!(
            published.contains("argument-hint: \"<handwritten>\""),
            "{published}"
        );
        assert!(!published.contains("<version>"), "{published}");
        // The section still renders — only the hint is overridden.
        assert!(published.contains("## Arguments"), "{published}");
    }

    // The same override rule, for Claude Code's own `arguments:` key.
    #[test]
    fn a_hand_written_arguments_list_is_never_overridden_by_a_derived_one() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(
            Path::new("/vault/skills/ship.md"),
            concat!(
                "---\nname: ship\ndescription: Cuts a release.\nap-kind: command\n",
                "arguments: [handwritten]\n",
                "ap-arguments:\n  - name: version\n",
                "---\n\nCut the release.\n"
            )
            .as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        publish_skill(&vfs, &command_request("claude"), &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/commands/ship.md");
        assert!(
            published.contains("arguments:\n  - handwritten"),
            "{published}"
        );
        assert!(!published.contains("- version"), "{published}");
        // The derived hint and the body section are unaffected — only the
        // native `arguments:` key has a hand-written override to respect.
        assert!(
            published.contains("argument-hint: \"[version]\""),
            "{published}"
        );
        assert!(published.contains("## Arguments"), "{published}");
    }

    // A skill (not a command) gets the same derivation and the same section —
    // `apply_arguments` gates on kind, not on which renderer is called.
    #[test]
    fn a_skill_also_derives_its_hint_and_renders_the_section() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(
            Path::new("/vault/skills/review.md"),
            concat!(
                "---\nname: review\ndescription: Reviews a PR.\n",
                "ap-arguments:\n  - name: pr-number\n    required: true\n",
                "---\n\nReview it.\n"
            )
            .as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let request = PublishRequest {
            skill_path: PathBuf::from("/vault/skills/review.md"),
            destination_root: PathBuf::from("/dest"),
            target: "claude".to_owned(),
            mode: PublishMode::Write,
            skills_root: Some(PathBuf::from("/vault")),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        };
        publish_skill(&vfs, &request, &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/skills/review/SKILL.md");
        assert!(
            published.contains("argument-hint: \"<pr-number>\""),
            "{published}"
        );
        assert!(
            published.contains("arguments:\n  - pr-number"),
            "{published}"
        );
        assert!(published.contains("## Arguments"), "{published}");
        assert!(
            published.contains("- `pr-number` (required)"),
            "{published}"
        );
    }

    // Amp names no command format, and Cursor has no runtime at all — a
    // guessed path would be a file no harness loads.
    #[test]
    fn a_target_with_no_command_layout_is_refused_by_name() {
        let vfs = vault_with_command();

        for target in ["amp", "cursor"] {
            let err = publish_skill(&vfs, &command_request(target), &ap()).unwrap_err();
            let message = err.to_string();
            assert!(message.contains(target), "{target}: {message}");
        }
        assert!(!vfs.exists(Path::new("/dest/.claude")));
        assert!(!vfs.exists(Path::new("/dest/.codex")));
    }

    // The fixture command note, published to every destination that now has
    // a command renderer, landing at that destination's own path in that
    // destination's own frontmatter shape.
    #[test]
    fn the_fixture_command_publishes_to_every_verified_destination() {
        let cases = [
            ("codex", ".codex/prompts/ship.md"),
            ("opencode", ".opencode/commands/ship.md"),
            ("copilot", ".github/prompts/ship.prompt.md"),
        ];
        for (target, expected_path) in cases {
            let vfs = vault_with_command();
            let report = publish_skill(&vfs, &command_request(target), &ap()).unwrap();
            assert_eq!(
                statuses(&report),
                vec![(expected_path, PublishStatus::Written)],
                "{target}"
            );
            let published = text_at(&vfs, &format!("/dest/{expected_path}"));
            assert!(!published.contains("ap-kind"), "{target}: {published}");
        }
    }

    #[test]
    fn codex_keeps_description_and_hint_but_no_name_model_or_tools() {
        let vfs = vault_with_command();
        publish_skill(&vfs, &command_request("codex"), &ap()).unwrap();
        let published = text_at(&vfs, "/dest/.codex/prompts/ship.md");
        assert!(
            published.contains("description: Cuts a release."),
            "{published}"
        );
        assert!(
            published.contains("argument-hint: \"<version>\""),
            "{published}"
        );
        assert!(
            published.contains("Cut the release for $ARGUMENTS."),
            "{published}"
        );
        for absent in ["name:", "model:", "allowed-tools", "arguments:"] {
            assert!(!published.contains(absent), "{absent}: {published}");
        }
    }

    #[test]
    fn opencode_keeps_only_description_and_model() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(
            Path::new("/vault/skills/ship.md"),
            concat!(
                "---\nname: ship\ndescription: Cuts a release.\nmodel: anthropic/claude\n",
                "argument-hint: <version>\nallowed-tools:\n  - Read\nap-kind: command\n---\n\n",
                "Cut the release for $ARGUMENTS.\n"
            )
            .as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        publish_skill(&vfs, &command_request("opencode"), &ap()).unwrap();
        let published = text_at(&vfs, "/dest/.opencode/commands/ship.md");
        assert!(
            published.contains("description: Cuts a release."),
            "{published}"
        );
        assert!(published.contains("model: anthropic/claude"), "{published}");
        for absent in ["name:", "argument-hint", "allowed-tools", "arguments:"] {
            assert!(!published.contains(absent), "{absent}: {published}");
        }
    }

    #[test]
    fn copilot_keeps_every_documented_key_under_its_own_tools_name() {
        let vfs = vault_with_command();
        publish_skill(&vfs, &command_request("copilot"), &ap()).unwrap();
        let published = text_at(&vfs, "/dest/.github/prompts/ship.prompt.md");
        assert!(published.contains("name: ship"), "{published}");
        assert!(
            published.contains("description: Cuts a release."),
            "{published}"
        );
        assert!(
            published.contains("argument-hint: \"<version>\""),
            "{published}"
        );
        assert!(published.contains("tools:\n  - Read"), "{published}");
        assert!(!published.contains("allowed-tools"), "{published}");
    }

    #[test]
    fn ap_targets_narrows_a_command_the_same_way_it_narrows_a_skill() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills")).unwrap();
        vfs.write_file(
            Path::new("/vault/skills/ship.md"),
            concat!(
                "---\nname: ship\ndescription: Cuts a release.\nap-kind: command\n",
                "ap-targets: [copilot]\n---\n\nCut the release.\n"
            )
            .as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let excluded = publish_skill(&vfs, &command_request("codex"), &ap()).unwrap();
        assert!(excluded.files.is_empty());
        assert!(excluded.not_published.is_some());

        let admitted = publish_skill(&vfs, &command_request("copilot"), &ap()).unwrap();
        assert_eq!(
            statuses(&admitted),
            vec![(".github/prompts/ship.prompt.md", PublishStatus::Written)]
        );
    }

    #[test]
    fn a_command_note_carrying_peers_is_refused_rather_than_losing_them() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills/ship/scripts"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/ship/ship.md"),
            COMMAND_NOTE.as_bytes(),
        )
        .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/ship/scripts/tag.sh"),
            b"#!/bin/sh\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let mut request = command_request("claude");
        request.skill_path = PathBuf::from("/vault/skills/ship/ship.md");
        let err = publish_skill(&vfs, &request, &ap()).unwrap_err();

        let message = err.to_string();
        assert!(message.contains("no-renderer"), "{message}");
        assert!(message.contains("scripts/tag.sh"), "{message}");
    }

    // A command in a `commands/` folder needs no `ap-kind`, and is tracked
    // like anything else.
    #[test]
    fn a_note_in_a_commands_folder_publishes_and_is_tracked() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/plugins/core/commands"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/plugins/core/commands/ship.md"),
            b"---\nname: ship\ndescription: Cuts a release.\n---\n\nCut it.\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let mut request = command_request("claude");
        request.skill_path = PathBuf::from("/vault/plugins/core/commands/ship.md");
        publish_skill(&vfs, &request, &ap()).unwrap();

        assert!(vfs.exists(Path::new("/dest/.claude/commands/ship.md")));
        let entry = manifest_of(&vfs, "/dest")
            .get(".claude/commands/ship.md")
            .expect("the command is recorded")
            .clone();
        assert_eq!(entry.source_note, "plugins/core/commands/ship.md");
        assert!(!entry.source_hash.is_empty());
    }

    // --- Plugins --------------------------------------------------------------

    /// A vault holding one marketplace, one plugin, and two member skills —
    /// the canonical layout the build renders and this now publishes.
    fn vault_with_plugin() -> MemVfs {
        let vfs = MemVfs::new();
        let base = "/vault/marketplaces/house/plugins/git-tools";
        vfs.create_dir_all(Path::new(&format!("{base}/skills")))
            .unwrap();
        vfs.write_file(
            Path::new(&format!("{base}/git-tools.md")),
            b"---\nname: git-tools\ndescription: Git helpers.\nap-kind: plugin\nap-version: 2.1.0\nap-license: MIT\n---\n\nThe pack.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new(&format!("{base}/skills/commit-helper.md")),
            b"---\nname: commit-helper\ndescription: Writes commits.\n---\n\nCommit well.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new(&format!("{base}/skills/rebase-guide.md")),
            b"---\nname: rebase-guide\ndescription: Rebases.\nap-targets:\n  - claude\n---\n\nRebase well.\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    fn plugin_request(target: &str) -> PublishRequest {
        PublishRequest {
            skill_path: PathBuf::from("/vault/marketplaces/house/plugins/git-tools/git-tools.md"),
            destination_root: PathBuf::from("/dest"),
            target: target.to_owned(),
            mode: PublishMode::Write,
            skills_root: Some(PathBuf::from("/vault")),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        }
    }

    // A pack publishes as one unit, into a slugged directory inside the
    // target's own skills root — never at the destination root, which would
    // let exactly one plugin exist per destination.
    #[test]
    fn a_plugin_publishes_its_members_and_its_pack_manifest() {
        let vfs = vault_with_plugin();

        let report = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        assert_eq!(
            statuses(&report),
            vec![
                (
                    ".claude/skills/git-tools/.claude-plugin/plugin.json",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/git-tools/skills/commit-helper/SKILL.md",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/git-tools/skills/rebase-guide/SKILL.md",
                    PublishStatus::Written
                ),
            ]
        );
    }

    // One person's half-written draft, anywhere else in a shared vault, is
    // not this pack's problem: the scan skips it and the pack still ships.
    #[test]
    fn a_pack_publishes_over_an_unreadable_note_outside_it() {
        let vfs = vault_with_plugin();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/skills"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/marketplaces/house/skills/draft.md"),
            b"---\nname: Not A Legal Name\ndescription: A draft.\n---\n\nHalf written.\n",
        )
        .unwrap();

        let report = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        assert_eq!(
            statuses(&report),
            vec![
                (
                    ".claude/skills/git-tools/.claude-plugin/plugin.json",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/git-tools/skills/commit-helper/SKILL.md",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/git-tools/skills/rebase-guide/SKILL.md",
                    PublishStatus::Written
                ),
            ]
        );
    }

    // The other half of the same rule: a member this pack holds that the scan
    // could not read stops the pack. The publish spec: a pack must not install a subset
    // silently.
    #[test]
    fn an_unreadable_member_stops_its_own_pack() {
        let vfs = vault_with_plugin();
        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/skills/draft.md"),
            b"---\nname: Not A Legal Name\ndescription: A draft.\n---\n\nHalf written.\n",
        )
        .unwrap();

        let err = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap_err();

        let message = err.to_string();
        assert!(message.contains("unreadable-note"), "{message}");
        assert!(message.contains("skills/draft.md"), "{message}");
    }

    // The same rule over a member that named this pack from outside its
    // folder. `ap-plugin` decides membership for a readable note, so it has
    // to decide it for one the scan could not read too — otherwise the pack
    // ships without a member and says nothing.
    #[test]
    fn an_unreadable_member_from_outside_the_folder_stops_its_pack() {
        let vfs = vault_with_plugin();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/skills"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/marketplaces/house/skills/draft.md"),
            b"---\nname: Not A Legal Name\ndescription: A draft.\nap-plugin: git-tools\n---\n\nHalf written.\n",
        )
        .unwrap();

        let err = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap_err();

        let message = err.to_string();
        assert!(message.contains("unreadable-note"), "{message}");
        assert!(message.contains("skills/draft.md"), "{message}");
    }

    // A member's own `ap-targets` narrows it, and a pack does not override
    // that: `rebase-guide` lists claude only, so codex gets the other member
    // and no mention of it.
    #[test]
    fn a_member_narrowed_away_by_its_own_targets_is_absent_from_the_pack() {
        let vfs = vault_with_plugin();

        let report = publish_skill(&vfs, &plugin_request("codex"), &ap()).unwrap();

        let paths: Vec<&str> = statuses(&report).into_iter().map(|(p, _)| p).collect();
        assert!(
            paths.contains(&".agents/skills/git-tools/skills/commit-helper/SKILL.md"),
            "{paths:?}"
        );
        assert!(
            !paths.iter().any(|p| p.contains("rebase-guide")),
            "a narrowed member reached the pack: {paths:?}"
        );
        // The Codex dialect, not Claude's.
        assert!(
            paths.contains(&".agents/skills/git-tools/.codex-plugin/plugin.json"),
            "{paths:?}"
        );
    }

    // The pack's identity comes from the plugin note, which is the only place
    // a per-destination publish can read it from.
    #[test]
    fn the_pack_manifest_reads_the_plugin_notes_own_identity() {
        let vfs = vault_with_plugin();
        publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        let manifest = text_at(
            &vfs,
            "/dest/.claude/skills/git-tools/.claude-plugin/plugin.json",
        );
        assert!(manifest.contains("\"name\": \"git-tools\""), "{manifest}");
        assert!(manifest.contains("\"version\": \"2.1.0\""), "{manifest}");
        assert!(manifest.contains("\"license\": \"MIT\""), "{manifest}");
    }

    // "The pack manifest is written only by publishing the plugin note.
    // Publishing a member skill standalone never creates, updates, or removes
    // one."
    #[test]
    fn publishing_a_member_standalone_writes_no_pack_manifest() {
        let vfs = vault_with_plugin();
        let mut request = plugin_request("claude");
        request.skill_path =
            PathBuf::from("/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md");

        let report = publish_skill(&vfs, &request, &ap()).unwrap();

        assert_eq!(
            statuses(&report),
            vec![(
                ".claude/skills/commit-helper/SKILL.md",
                PublishStatus::Written
            )]
        );
        assert!(!vfs.exists(Path::new("/dest/.claude/skills/git-tools")));
    }

    // --- Skill calls ----------------------------------------------------------

    const COMMIT_HELPER: &str =
        "/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md";

    /// [`vault_with_plugin`], with `commit-helper`'s body set to `body`.
    fn vault_with_commit_body(body: &str) -> MemVfs {
        let vfs = vault_with_plugin();
        vfs.write_file(
            Path::new(COMMIT_HELPER),
            format!("---\nname: commit-helper\ndescription: Writes commits.\n---\n\n{body}")
                .as_bytes(),
        )
        .unwrap();
        vfs
    }

    fn commit_helper_request(target: &str) -> PublishRequest {
        PublishRequest {
            skill_path: PathBuf::from(COMMIT_HELPER),
            ..plugin_request(target)
        }
    }

    #[test]
    fn a_standalone_call_renders_without_a_namespace_and_is_recorded() {
        let vfs = vault_with_commit_body("Then run /[[rebase-guide]].\n");
        publish_skill(&vfs, &commit_helper_request("claude"), &ap()).unwrap();

        let body = text_at(&vfs, "/dest/.claude/skills/commit-helper/SKILL.md");
        assert!(body.contains("Then run `/rebase-guide`."), "{body}");
        let manifest = manifest_of(&vfs, "/dest");
        let entry = manifest
            .get(".claude/skills/commit-helper/SKILL.md")
            .expect("the skill is recorded");
        assert_eq!(entry.calls, vec!["rebase-guide".to_owned()]);
    }

    #[test]
    fn a_pack_call_names_the_skill_under_its_plugin() {
        let vfs = vault_with_commit_body("Then run /[[rebase-guide]].\n");
        publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        let path = ".claude/skills/git-tools/skills/commit-helper/SKILL.md";
        let body = text_at(&vfs, &format!("/dest/{path}"));
        assert!(
            body.contains("Then run `/git-tools:rebase-guide`."),
            "{body}"
        );
        let manifest = manifest_of(&vfs, "/dest");
        let entry = manifest.get(path).expect("the member is recorded");
        assert_eq!(entry.calls, vec!["git-tools:rebase-guide".to_owned()]);
    }

    // `rebase-guide` narrows itself to Claude Code, so a call to it published
    // anywhere else names a command that is not there.
    #[test]
    fn a_call_to_a_skill_the_destination_does_not_take_is_refused() {
        let vfs = vault_with_commit_body("Then run /[[rebase-guide]].\n");
        for request in [commit_helper_request("codex"), plugin_request("codex")] {
            let err = publish_skill(&vfs, &request, &ap())
                .unwrap_err()
                .to_string();
            assert!(err.contains("skill-call-not-shipped"), "{err}");
            assert!(err.contains("rebase-guide"), "{err}");
            assert!(err.contains("codex does not ship"), "{err}");
        }
    }

    // A standalone publish needs the vault scan only for a call, so a fault
    // elsewhere in the vault blocks only a body that has one.
    #[test]
    fn a_standalone_publish_scans_the_vault_only_for_a_body_with_calls() {
        let with_dup = |vfs: &MemVfs| {
            let other = "/vault/marketplaces/house/plugins/other/skills";
            vfs.create_dir_all(Path::new(other)).unwrap();
            for file in ["one", "two"] {
                vfs.write_file(
                    Path::new(&format!("{other}/{file}.md")),
                    b"---\nname: dup\ndescription: Twice.\n---\n\nSame name.\n",
                )
                .unwrap();
            }
        };

        let vfs = vault_with_plugin();
        with_dup(&vfs);
        publish_skill(&vfs, &commit_helper_request("claude"), &ap()).unwrap();

        // A plain link is read as a call only when the index can be built.
        let vfs = vault_with_commit_body("See [[rebase-guide]]. Also [[nowhere]].\n");
        with_dup(&vfs);
        publish_skill(&vfs, &commit_helper_request("claude"), &ap()).unwrap();

        let vfs = vault_with_commit_body("Then run /[[rebase-guide]].\n");
        with_dup(&vfs);
        let err = publish_skill(&vfs, &commit_helper_request("claude"), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("dup"), "{err}");
    }

    // Tracking is per emitted file, so a pack's rows name the member that
    // produced each one rather than the plugin note that published them.
    #[test]
    fn a_packs_rows_name_the_member_that_produced_each_file() {
        let vfs = vault_with_plugin();
        publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        let manifest = manifest_of(&vfs, "/dest");
        let member = manifest
            .get(".claude/skills/git-tools/skills/commit-helper/SKILL.md")
            .expect("the member is recorded");
        assert_eq!(
            member.source_note,
            "marketplaces/house/plugins/git-tools/skills/commit-helper.md"
        );
        assert!(!member.source_hash.is_empty());

        // The pack manifest has no closure of its own, so the plugin note
        // stands as its source.
        let pack = manifest
            .get(".claude/skills/git-tools/.claude-plugin/plugin.json")
            .expect("the pack manifest is recorded");
        assert_eq!(
            pack.source_note,
            "marketplaces/house/plugins/git-tools/git-tools.md"
        );

        // And a second publish is a no-op, as it is for every other kind.
        let again = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();
        assert!(
            again
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Unchanged),
            "{again:?}"
        );
    }

    // A container holds more than its members — a licence, a readme, an icon —
    // and dropping those would lose the part of a pack that is not a skill.
    #[test]
    fn a_packs_own_files_travel_beside_its_manifest() {
        let vfs = vault_with_plugin();
        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/LICENSE.txt"),
            b"MIT\n",
        )
        .unwrap();

        let report = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        let paths: Vec<&str> = statuses(&report).into_iter().map(|(p, _)| p).collect();
        assert!(
            paths.contains(&".claude/skills/git-tools/LICENSE.txt"),
            "{paths:?}"
        );
        assert_eq!(
            text_at(&vfs, "/dest/.claude/skills/git-tools/LICENSE.txt"),
            "MIT\n"
        );
        // And a member's own files stay with the member, not at the pack root:
        // `owned_resources` gives each path to the innermost component holding
        // it, so the two sets never overlap.
        assert!(
            !paths.contains(&".claude/skills/git-tools/commit-helper.md"),
            "a member's note reached the pack root: {paths:?}"
        );
    }

    // A snippet under `skills/` belongs to no component, so it arrives as the
    // plugin's resource — and it is not the plugin's content. It is
    // vault-internal writing an embed inlines, and shipping it raw would put a
    // copy in the pack beside the skill that already contains it.
    #[test]
    fn vault_writing_inside_a_kind_folder_is_not_the_containers_own_content() {
        let vfs = vault_with_plugin();
        vfs.create_dir_all(Path::new(
            "/vault/marketplaces/house/plugins/git-tools/skills/snippets",
        ))
        .unwrap();
        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/skills/snippets/tone.md"),
            b"---\ntag: fragment\n---\n\nBe terse.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/README.md"),
            b"# The pack\n",
        )
        .unwrap();

        let report = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();
        let paths: Vec<&str> = statuses(&report).into_iter().map(|(p, _)| p).collect();

        // Beside the note, outside every kind folder: the pack's own.
        assert!(
            paths.contains(&".claude/skills/git-tools/README.md"),
            "{paths:?}"
        );
        // Inside `skills/`: the structure's, not the container's.
        assert!(
            !paths.iter().any(|p| p.contains("snippets")),
            "vault writing shipped as pack content: {paths:?}"
        );
    }

    // A pack declares only `skills/`, so a member of another kind has nowhere
    // to go. Reported, never dropped, and never a refusal of the whole pack —
    // a plugin holding skills and an agent is an ordinary vault.
    #[test]
    fn a_member_a_pack_cannot_hold_is_reported_and_the_rest_still_travel() {
        let vfs = vault_with_plugin();
        vfs.create_dir_all(Path::new(
            "/vault/marketplaces/house/plugins/git-tools/agents",
        ))
        .unwrap();
        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/agents/triage.md"),
            b"---\nname: triage\ndescription: Triages.\n---\n\nSort it.\n",
        )
        .unwrap();

        let report = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        assert_eq!(
            report.not_carried,
            vec!["marketplaces/house/plugins/git-tools/agents/triage.md".to_owned()]
        );
        // The skills still published.
        let paths: Vec<&str> = statuses(&report).into_iter().map(|(p, _)| p).collect();
        assert!(
            paths
                .iter()
                .any(|p| p.ends_with("skills/commit-helper/SKILL.md")),
            "{paths:?}"
        );
        // And nothing was invented for the agent.
        assert!(
            !paths.iter().any(|p| p.contains("agents")),
            "a path was invented for a member the pack cannot hold: {paths:?}"
        );
    }

    // An ordinary report never mentions it, and the field is omitted from the
    // wire when empty.
    #[test]
    fn a_skill_publish_carries_no_not_carried() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        assert!(report.not_carried.is_empty());
        assert!(!wire(&report).contains("not_carried"), "{}", wire(&report));
    }

    // Editing a member makes the pack stale at the destination — the same
    // comparison, over files a pack happens to own.
    #[test]
    fn editing_a_member_makes_the_pack_stale() {
        let vfs = vault_with_plugin();
        publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md"),
            b"---\nname: commit-helper\ndescription: Writes commits.\n---\n\nCommit better.\n",
        )
        .unwrap();

        let report = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();
        let member = report
            .files
            .iter()
            .find(|f| f.path.contains("commit-helper"))
            .expect("still one of ours");
        assert_eq!(member.status, PublishStatus::Written);
    }

    /// [`vault_with_plugin`] plus one command member.
    fn vault_with_plugin_and_command() -> MemVfs {
        let vfs = vault_with_plugin();
        vfs.create_dir_all(Path::new(
            "/vault/marketplaces/house/plugins/git-tools/commands",
        ))
        .unwrap();
        vfs.write_file(
            Path::new("/vault/marketplaces/house/plugins/git-tools/commands/ship.md"),
            b"---\nname: ship\ndescription: Cuts a release.\n---\n\nCut it.\n",
        )
        .unwrap();
        vfs
    }

    // Claude Code's plugin manifest has a slot for commands.
    #[test]
    fn a_plugin_carries_its_command_where_the_layout_has_a_slot() {
        let vfs = vault_with_plugin_and_command();

        let report = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        let paths: Vec<&str> = statuses(&report).into_iter().map(|(p, _)| p).collect();
        assert!(
            paths.contains(&".claude/skills/git-tools/commands/ship.md"),
            "{paths:?}"
        );
        assert!(report.not_carried.is_empty(), "{:?}", report.not_carried);
    }

    // Codex's plugin format has no commands concept.
    #[test]
    fn a_plugin_leaves_its_command_uncarried_where_the_layout_has_no_slot() {
        let vfs = vault_with_plugin_and_command();

        let report = publish_skill(&vfs, &plugin_request("codex"), &ap()).unwrap();

        assert_eq!(
            report.not_carried,
            vec!["marketplaces/house/plugins/git-tools/commands/ship.md".to_owned()]
        );
        let paths: Vec<&str> = statuses(&report).into_iter().map(|(p, _)| p).collect();
        assert!(
            paths.contains(&".agents/skills/git-tools/skills/commit-helper/SKILL.md"),
            "the skill still travels: {paths:?}"
        );
        assert!(
            !paths.iter().any(|p| p.contains("commands")),
            "a path was invented for a command the pack cannot hold: {paths:?}"
        );
    }

    // A pack with no skills, only a command, still installs where the
    // layout has a slot for one.
    #[test]
    fn a_commands_only_pack_still_publishes_where_the_layout_has_a_slot() {
        let vfs = MemVfs::new();
        let base = "/vault/marketplaces/house/plugins/git-tools";
        vfs.create_dir_all(Path::new(&format!("{base}/commands")))
            .unwrap();
        vfs.write_file(
            Path::new(&format!("{base}/git-tools.md")),
            b"---\nname: git-tools\ndescription: Git helpers.\nap-kind: plugin\n---\n\nThe pack.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new(&format!("{base}/commands/ship.md")),
            b"---\nname: ship\ndescription: Cuts a release.\n---\n\nCut it.\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let report = publish_skill(&vfs, &plugin_request("claude"), &ap()).unwrap();

        let paths: Vec<&str> = statuses(&report).into_iter().map(|(p, _)| p).collect();
        assert!(
            paths.contains(&".claude/skills/git-tools/commands/ship.md"),
            "{paths:?}"
        );
        assert!(
            paths.contains(&".claude/skills/git-tools/.claude-plugin/plugin.json"),
            "the pack still gets a manifest: {paths:?}"
        );
        assert!(report.not_carried.is_empty(), "{:?}", report.not_carried);
    }

    // --- The manifest ---------------------------------------------------------

    fn manifest_of(vfs: &MemVfs, root: &str) -> DestinationManifest {
        match read_manifest(vfs, Path::new(root)) {
            ManifestState::Ok { manifest, .. } => manifest,
            other => panic!("expected a usable manifest, got {other:?}"),
        }
    }

    #[test]
    fn the_manifest_is_reported_like_any_other_file() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        let line = report
            .files
            .iter()
            .find(|f| f.path == MANIFEST_RELATIVE_PATH)
            .expect("the manifest gets an outcome");
        assert_eq!(line.status, PublishStatus::Written);
    }

    // "A run in which every file is unchanged leaves the manifest
    // byte-identical, and the manifest itself then reports unchanged."
    #[test]
    fn a_second_publish_changes_nothing_including_the_manifest() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        let first = vfs
            .read_file(&crate::manifest::manifest_path(Path::new("/dest")))
            .unwrap();

        let again = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        assert!(
            again
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Unchanged),
            "{again:?}"
        );
        assert_eq!(
            vfs.read_file(&crate::manifest::manifest_path(Path::new("/dest")))
                .unwrap(),
            first
        );
    }

    // The migration. A destination written to by a build with no manifest has
    // our exact bytes at our exact paths and no record of them. Those files
    // are claimed rather than refused, so upgrading does not present a wall of
    // foreign files for output we produced ourselves.
    #[test]
    fn output_already_identical_to_ours_is_claimed_rather_than_refused() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        // Publish, then delete only the manifest — exactly the shape an
        // earlier build left behind.
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        vfs.remove(&crate::manifest::manifest_path(Path::new("/dest")))
            .unwrap();

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        for file in statuses(&report) {
            assert_eq!(file.1, PublishStatus::Unchanged, "{report:?}");
        }
        let claimed = report
            .files
            .iter()
            .find(|f| f.path.ends_with("SKILL.md"))
            .and_then(|f| f.reason.as_ref())
            .expect("a claim says so");
        assert_eq!(claimed.token, ReasonToken::Claimed, "{claimed}");
        assert_eq!(manifest_of(&vfs, "/dest").len(), 3);
    }

    // A partial fact, unlike a missing one: replacing it silently would
    // re-arm the orphan sweep against a false empty baseline.
    #[test]
    fn a_corrupt_manifest_blocks_the_whole_destination() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest/.agent-pants")).unwrap();
        vfs.write_file(
            &crate::manifest::manifest_path(Path::new("/dest")),
            b"{ truncated",
        )
        .unwrap();

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        assert!(!report.files.is_empty());
        for file in &report.files {
            assert_eq!(file.status, PublishStatus::Refused, "{report:?}");
            let reason = file.reason.as_ref().expect("a reason");
            assert_eq!(reason.token, ReasonToken::BadManifest, "{reason}");
        }
        assert!(!vfs.exists(Path::new("/dest/.claude")));
    }

    #[test]
    fn a_dry_run_leaves_no_manifest_behind() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap();

        assert!(!vfs.exists(&crate::manifest::manifest_path(Path::new("/dest"))));
    }

    // The entry records the closure, which is what makes "what did editing
    // this make stale" a reverse lookup rather than a re-expansion.
    #[test]
    fn the_manifest_records_the_closure_that_fed_each_file() {
        let vfs = vault_with_links();
        publish_skill(&vfs, &linked_request(), &ap()).unwrap();

        let manifest = manifest_of(&vfs, "/dest");
        let skill = manifest
            .get(".claude/skills/code-review/SKILL.md")
            .expect("the skill is recorded");

        assert_eq!(skill.source_note, "skills/code-review.md");
        assert_eq!(
            skill.contributing_notes,
            vec![
                "skills/code-review.md".to_owned(),
                "skills/snippets/reviewer.md".to_owned()
            ]
        );
        assert!(!skill.source_hash.is_empty());
        assert!(!skill.emitted_hash.is_empty());
    }

    // The whole reason staleness is computed over a closure. The skill note is
    // untouched; the bytes that belong at the destination are not.
    #[test]
    fn editing_an_embedded_note_moves_the_source_hash_of_a_skill_that_did_not_change() {
        let vfs = vault_with_links();
        publish_skill(&vfs, &linked_request(), &ap()).unwrap();
        let before = manifest_of(&vfs, "/dest")
            .get(".claude/skills/code-review/SKILL.md")
            .expect("recorded")
            .clone();

        vfs.write_file(
            Path::new("/vault/skills/snippets/reviewer.md"),
            b"---\ntag: fragment\n---\n\nBe a *staff* reviewer.\n",
        )
        .unwrap();
        publish_skill(&vfs, &linked_request(), &ap()).unwrap();
        let after = manifest_of(&vfs, "/dest")
            .get(".claude/skills/code-review/SKILL.md")
            .expect("recorded")
            .clone();

        assert_eq!(after.source_note, before.source_note);
        assert_ne!(
            after.source_hash, before.source_hash,
            "an edit to an embedded note left the closure hash unmoved"
        );
    }

    // "published_at on an entry changes only when that entry's emitted_hash
    // changes." An output-neutral edit moves neither.
    #[test]
    fn the_publish_time_moves_only_when_the_emitted_bytes_move() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();

        let mut later = request("/dest", "claude");
        later.published_at = Some("2027-01-01T00:00:00Z".to_owned());
        publish_skill(&vfs, &later, &ap()).unwrap();

        let entry = manifest_of(&vfs, "/dest")
            .get(".claude/skills/code-review/SKILL.md")
            .expect("recorded")
            .clone();
        assert_eq!(entry.published_at, "2026-08-29T10:00:00Z");
    }

    // --- The compile pass ---------------------------------------------------

    /// A vault where the note embeds one snippet and links one reference, both
    /// outside the folder it owns — the shape the whole product is built
    /// around, and the one a publish used to emit verbatim.
    fn vault_with_links() -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills/snippets"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/snippets/reviewer.md"),
            b"---\ntag: fragment\n---\n\nBe a senior reviewer.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/house-style.md"),
            b"# House style\n\nTwo spaces.\n",
        )
        .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/code-review.md"),
            b"---\nname: code-review\ndescription: Reviews a diff.\n---\n\n              ![[reviewer]]\n\nSee [[house-style]].\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    fn linked_request() -> PublishRequest {
        PublishRequest {
            skill_path: PathBuf::from("/vault/skills/code-review.md"),
            destination_root: PathBuf::from("/dest"),
            target: "claude".to_owned(),
            mode: PublishMode::Write,
            skills_root: Some(PathBuf::from("/vault")),
            published_at: Some("2026-08-29T10:00:00Z".to_owned()),
            overwrite: Vec::new(),
        }
    }

    fn text_at(vfs: &MemVfs, path: &str) -> String {
        String::from_utf8(vfs.read_file(Path::new(path)).unwrap()).unwrap()
    }

    // The defect this pass fixes. The build compiled and this path did not, so
    // the embedded prose never reached the destination and the wikilink that
    // stood in for it means nothing to a harness.
    #[test]
    fn an_embedded_note_is_inlined_rather_than_published_as_a_wikilink() {
        let vfs = vault_with_links();
        publish_skill(&vfs, &linked_request(), &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/skills/code-review/SKILL.md");
        assert!(
            published.contains("Be a senior reviewer."),
            "the embedded body is missing: {published}"
        );
        assert!(
            !published.contains("![["),
            "an embed sigil survived to the destination: {published}"
        );
    }

    // The other half of the same defect: a linked note is supposed to travel
    // as its own file with the link rewritten to point at it.
    #[test]
    fn a_linked_note_is_written_out_beside_the_skill_and_the_link_rewritten() {
        let vfs = vault_with_links();
        let report = publish_skill(&vfs, &linked_request(), &ap()).unwrap();

        let reference = "references/vault/skills/house-style.md";
        let written: Vec<&str> = report.files.iter().map(|f| f.path.as_str()).collect();
        assert!(
            written.iter().any(|p| p.ends_with(reference)),
            "no reference file was emitted: {written:?}"
        );
        assert!(
            text_at(
                &vfs,
                &format!("/dest/.claude/skills/code-review/{reference}")
            )
            .contains("Two spaces."),
            "the reference file is empty or missing"
        );

        let published = text_at(&vfs, "/dest/.claude/skills/code-review/SKILL.md");
        assert!(
            !published.contains("[[house-style]]"),
            "a link sigil survived to the destination: {published}"
        );
        assert!(
            published.contains("house-style.md"),
            "the link was not rewritten to the emitted path: {published}"
        );
    }

    // No sigil of either kind may reach a destination, because nothing there
    // has a resolver to give it meaning.
    #[test]
    fn no_obsidian_syntax_reaches_any_emitted_file() {
        let vfs = vault_with_links();
        let report = publish_skill(&vfs, &linked_request(), &ap()).unwrap();

        for file in &report.files {
            if !file.path.ends_with(".md") {
                continue;
            }
            let text = text_at(&vfs, &format!("/dest/{}", file.path));
            assert!(
                !text.contains("[["),
                "{} still carries a wikilink: {text}",
                file.path
            );
        }
    }

    // A vault root is not always supplied. Links then resolve within the tree
    // the note sits in, and one that resolves to nothing is recorded rather
    // than emitted raw — degrading to a missing reference beats degrading to
    // bytes no harness can read.
    #[test]
    fn without_a_vault_root_an_unreachable_link_still_never_publishes_as_a_sigil() {
        let vfs = vault_with_links();
        let mut request = linked_request();
        request.skills_root = None;
        publish_skill(&vfs, &request, &ap()).unwrap();

        let published = text_at(&vfs, "/dest/.claude/skills/code-review/SKILL.md");
        assert!(!published.contains("[["), "{published}");
    }

    // The common case must not have moved: a note with no links publishes
    // exactly what it did before this pass was added.
    #[test]
    fn a_note_with_no_links_is_unaffected_by_the_compile() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        let first = text_at(&vfs, "/dest/.claude/skills/code-review/SKILL.md");

        let second = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        assert!(
            second
                .files
                .iter()
                .all(|f| f.status == PublishStatus::Unchanged),
            "a second publish rewrote something: {:?}",
            second.files
        );
        assert_eq!(
            text_at(&vfs, "/dest/.claude/skills/code-review/SKILL.md"),
            first
        );
    }

    // --- `ap-kind` ---------------------------------------------------------

    /// The same note, declared a plugin.
    const PLUGIN_NOTE: &str = "---\n\
         description: the review pack\n\
         ap-kind: plugin\n\
         ---\nIt holds ![[code-review]].\n";

    #[test]
    fn a_plugin_note_is_never_published_as_a_skill() {
        // The original bug: the kind was read and then ignored, so a note that
        // says it is a plugin came back as somebody's `SKILL.md`. A plugin
        // publishes now, but never through the skill layout — and this
        // fixture's plugin has no members, so it refuses `empty-plugin` rather
        // than writing anything at all.
        for target in ["claude", "codex", "portable"] {
            let vfs = vault_with_peers();
            vfs.write_file(
                Path::new("/vault/skills/code-review/code-review.md"),
                PLUGIN_NOTE.as_bytes(),
            )
            .unwrap();
            vfs.create_dir_all(Path::new("/dest")).unwrap();

            let err = publish_skill(&vfs, &request("/dest", target), &ap()).unwrap_err();
            let message = err.to_string();

            assert!(matches!(err, CoreError::Refused(_)), "{message}");
            // `portable` has no plugin layout and says so; the other two have
            // one and this plugin has nothing to put in it.
            let expected = if target == "portable" {
                "no-renderer"
            } else {
                "empty-plugin"
            };
            assert!(message.contains(expected), "{target}: {message}");

            // And no `SKILL.md` — not written, not even rendered.
            assert!(
                snapshot(&vfs, Path::new("/dest")).is_empty(),
                "{target}: a plugin note left files behind"
            );
        }
    }

    #[test]
    fn a_note_that_declares_itself_a_skill_still_publishes() {
        // The gate is on the resolved kind, so the explicit spelling and the
        // absent key must reach the same place — `ap-kind: skill` is what a
        // vault writes once one note in it is a plugin.
        let vfs = vault_with_peers();
        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            b"---\ndescription: reviews code\nap-kind: skill\n---\nReview the diff.\n",
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        assert_eq!(statuses(&report).len(), 3, "{report:?}");
        assert!(vfs.exists(Path::new("/dest/.claude/skills/code-review/SKILL.md")));
    }

    // --- `ap-overrides` ----------------------------------------------------

    /// A vault whose one note carries a per-destination override block.
    fn vault_with_overrides(block: &str) -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/skills/code-review"))
            .unwrap();
        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            format!(
                "---\ndescription: reviews code\nallowed-tools:\n  - Read\n  - Grep\n{block}---\nReview the diff.\n"
            )
            .as_bytes(),
        )
        .unwrap();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        vfs
    }

    fn published_skill_md(vfs: &MemVfs, relative: &str) -> String {
        String::from_utf8(vfs.read_file(Path::new(relative)).unwrap()).unwrap()
    }

    #[test]
    fn an_override_reaches_the_target_it_names_and_no_other() {
        // AC-1. `permissionMode` is Claude Code's own key and no canonical
        // field maps onto it, which is the whole reason the block exists.
        let block = "ap-overrides:\n  claude:\n    permissionMode: plan\n";
        let vfs = vault_with_overrides(block);
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        let claude = published_skill_md(&vfs, "/dest/.claude/skills/code-review/SKILL.md");
        assert!(claude.contains("permissionMode: plan"), "{claude}");

        for (target, path) in [
            ("codex", "/dest/.agents/skills/code-review/SKILL.md"),
            ("antigravity", "/dest/.agents/skills/code-review/SKILL.md"),
            ("opencode", "/dest/.opencode/skills/code-review/SKILL.md"),
        ] {
            let vfs = vault_with_overrides(block);
            publish_skill(&vfs, &request("/dest", target), &ap()).unwrap();
            let text = published_skill_md(&vfs, path);
            assert!(!text.contains("permissionMode"), "{target}: {text}");
        }
    }

    #[test]
    fn a_codex_override_does_not_leak_into_a_portable_publish() {
        // `codex` and `portable` share the codex-cli renderer, so a lookup
        // keyed by the runtime rather than the destination would hand
        // `portable` the `codex` block. The block is keyed by the destination
        // it names, and `portable` is not that destination.
        let block = "ap-overrides:\n  codex:\n    policy.allow_implicit_invocation: true\n";
        let vfs = vault_with_overrides(block);
        publish_skill(&vfs, &request("/dest", "portable"), &ap()).unwrap();
        let portable = published_skill_md(&vfs, "/dest/.agents/skills/code-review/SKILL.md");
        assert!(
            !portable.contains("policy.allow_implicit_invocation"),
            "{portable}"
        );
    }

    #[test]
    fn a_portable_override_reaches_the_portable_publish() {
        // The destination's own block does reach it: `license` is a key the
        // portable dialect writes from no model field, so the override is the
        // only way to set it, and publishing to `portable` lands it.
        let block = "ap-overrides:\n  portable:\n    license: MIT\n";
        let vfs = vault_with_overrides(block);
        publish_skill(&vfs, &request("/dest", "portable"), &ap()).unwrap();
        let portable = published_skill_md(&vfs, "/dest/.agents/skills/code-review/SKILL.md");
        assert!(portable.contains("license: MIT"), "{portable}");
    }

    #[test]
    fn the_overrides_key_itself_reaches_no_destination() {
        // AC-2. The emit-side namespace strip covers a modelled `ap-` key the
        // same way it covers an unmodelled one — there is no field on
        // `SkillContent::annotations` for it to leak through.
        let block = "ap-overrides:\n  claude:\n    permissionMode: plan\n";
        for (target, path) in [
            ("claude", "/dest/.claude/skills/code-review/SKILL.md"),
            ("portable", "/dest/.agents/skills/code-review/SKILL.md"),
        ] {
            let vfs = vault_with_overrides(block);
            publish_skill(&vfs, &request("/dest", target), &ap()).unwrap();
            let text = published_skill_md(&vfs, path);
            assert!(!text.contains("ap-overrides"), "{target}: {text}");
        }
    }

    #[test]
    fn an_override_key_the_harness_does_not_read_is_refused_by_name() {
        // AC-3. Codex's dialect omits `argument-hint`, so the harness never
        // reads the key and the matrix does not list it — the refusal names
        // both the destination and the key.
        let vfs = vault_with_overrides("ap-overrides:\n  codex:\n    argument-hint: <path>\n");
        let err = publish_skill(&vfs, &request("/dest", "codex"), &ap()).unwrap_err();
        let message = err.to_string();
        assert!(matches!(err, CoreError::Refused(_)), "{message}");
        assert!(
            message.starts_with("refused: unknown-override-key: "),
            "{message}"
        );
        assert!(message.contains("codex"), "{message}");
        assert!(message.contains("argument-hint"), "{message}");
        // Nothing rendered, so nothing was written.
        assert!(snapshot(&vfs, Path::new("/dest")).is_empty());
    }

    #[test]
    fn a_destination_with_no_declaration_refuses_every_override_key() {
        // The decision inside the check: an unmapped harness receives no
        // unchecked keys. `cursor` is a destination this build maps to no
        // runtime, so it has no roster and admits nothing. Asked of the
        // validator directly, because a publish to `cursor` stops one gate
        // earlier — there is no renderer to reach.
        let note = VaultFrontmatter {
            overrides: serde_json::json!({"cursor": {"anything": 1}})
                .as_object()
                .unwrap()
                .clone(),
            ..VaultFrontmatter::default()
        };
        let err = overrides_for(&note, Path::new("/vault/a.md"), "cursor", &ap()).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("unknown-override-key"), "{message}");
        assert!(message.contains("anything"), "{message}");

        // The same block is untouched at a destination it does not name.
        let folded = overrides_for(&note, Path::new("/vault/a.md"), "claude", &ap()).unwrap();
        assert!(folded.contains_key("cursor"));
    }

    #[test]
    fn an_override_target_outside_the_roster_is_the_unknown_target_refusal() {
        // AC-4, and the same blocker scope `ap-targets` has: the typo is
        // refused whichever destination is being published to.
        let vfs = vault_with_overrides("ap-overrides:\n  claud:\n    permissionMode: plan\n");
        let err = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap_err();
        let message = err.to_string();
        assert!(
            message.starts_with("refused: unknown-target: "),
            "{message}"
        );
        assert!(message.contains("claud"), "{message}");
    }

    #[test]
    fn a_redundant_override_is_a_diagnostic_and_still_publishes() {
        // AC-5. `allowed-tools` is what the projection already writes from
        // the note's own `allowed-tools`, so the key changes nothing.
        let vfs = vault_with_overrides("ap-overrides:\n  claude:\n    allowed-tools: Read Grep\n");
        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        assert_eq!(report.redundant_overrides.len(), 1, "{report:?}");
        let reason = &report.redundant_overrides[0];
        assert_eq!(reason.token, ReasonToken::RedundantOverride);
        assert!(!reason.token.is_refusal());
        let detail = reason.detail.as_deref().unwrap();
        assert!(detail.contains("allowed-tools"), "{detail}");
        assert!(detail.contains("claude"), "{detail}");
        // Still published, and unchanged by the key.
        let text = published_skill_md(&vfs, "/dest/.claude/skills/code-review/SKILL.md");
        assert!(text.contains("allowed-tools: Read Grep"), "{text}");
        assert_eq!(text.matches("allowed-tools").count(), 1, "{text}");
    }

    #[test]
    fn two_spellings_of_one_destination_merge_into_its_block() {
        // The same equivalence `publishes_to` grants: `claude-code` and
        // `claude` are one destination, so their keys are one block rather
        // than one silently winning.
        let vfs = vault_with_overrides(
            "ap-overrides:\n  claude:\n    permissionMode: plan\n  claude-code:\n    context: fork\n",
        );
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        let text = published_skill_md(&vfs, "/dest/.claude/skills/code-review/SKILL.md");
        assert!(text.contains("permissionMode: plan"), "{text}");
        assert!(text.contains("context: fork"), "{text}");
    }

    // The closed set itself, pinned against the publish spec's
    // "The two vocabularies" table. A token added to the enum and forgotten
    // here fails; a token in the table and missing from the enum fails too.
    #[test]
    fn the_refusal_tokens_are_the_tables_outbound_set() {
        let spelled: Vec<&str> = ReasonToken::REFUSALS.iter().map(|t| t.as_str()).collect();
        assert_eq!(
            spelled,
            vec![
                "conflict",
                "foreign",
                "unsafe-path",
                "io",
                "no-renderer",
                "plugin-managed",
                "stopped",
                "cycle",
                "unsafe-root",
                "bad-manifest",
                "path-collision",
                "unknown-target",
                "unknown-override-key",
                "unknown-kind",
                "member-unresolved",
                "empty-plugin",
                "mixed-frontmatter-shape",
            ]
        );
        assert!(ReasonToken::REFUSALS.iter().all(|t| t.is_refusal()));
        assert!(!ReasonToken::Claimed.is_refusal());
        // The other outcome-that-wrote token named on ReasonToken::is_refusal's doc (with Claimed).
        assert!(!ReasonToken::RedundantOverride.is_refusal());
    }

    #[test]
    fn a_token_round_trips_through_its_spelling_and_the_wire() {
        for token in ReasonToken::REFUSALS
            .iter()
            .copied()
            .chain(std::iter::once(ReasonToken::Claimed))
        {
            assert_eq!(ReasonToken::parse(token.as_str()), Some(token));
            let json = serde_json::to_string(&token).unwrap();
            assert_eq!(json, format!("\"{token}\""));
            let back: ReasonToken = serde_json::from_str(&json).unwrap();
            assert_eq!(back, token);
        }
        assert_eq!(ReasonToken::parse("not-a-reason"), None);
    }

    // A refusal reaching a report from a rail keeps the rail's token even when
    // the message carries none. Bare prose is what this shape exists to stop.
    #[test]
    fn a_refusal_message_splits_into_its_token_and_its_prose() {
        let parsed = PublishReason::from_refusal(
            "unknown-target: /vault/a.md: `claud` names nothing",
            ReasonToken::Io,
        );
        assert_eq!(parsed.token, ReasonToken::UnknownTarget);
        assert_eq!(
            parsed.detail.as_deref(),
            Some("/vault/a.md: `claud` names nothing")
        );

        let untokened =
            PublishReason::from_refusal("something went wrong", ReasonToken::UnsafeRoot);
        assert_eq!(untokened.token, ReasonToken::UnsafeRoot);
        assert_eq!(untokened.detail.as_deref(), Some("something went wrong"));
    }

    // The human report and `--json` read one field: the line prints
    // `<token>: <prose>` and the document carries the same token as a value.
    #[test]
    fn a_reason_prints_and_serializes_from_one_value() {
        let reason = PublishReason::new(ReasonToken::Conflict, "a/SKILL.md changed at 10:00Z");
        assert_eq!(reason.to_string(), "conflict: a/SKILL.md changed at 10:00Z");
        assert_eq!(
            serde_json::to_string(&reason).unwrap(),
            r#"{"token":"conflict","detail":"a/SKILL.md changed at 10:00Z"}"#
        );
        assert_eq!(
            serde_json::to_string(&PublishReason::bare(ReasonToken::Stopped)).unwrap(),
            r#"{"token":"stopped"}"#
        );
    }

    /// The outcome for one destination-relative path, or `None` where the
    /// report has no line for it.
    fn outcome_of(report: &PublishReport, path: &str) -> Option<PublishOutcome> {
        report
            .files
            .iter()
            .find(|f| f.path == path)
            .map(|f| f.outcome)
    }

    const ENTRY: &str = ".claude/skills/code-review/SKILL.md";

    // The distinction the status alone throws away: both runs write the same
    // path, and only the outcome says which is an install and which is a
    // repair.
    #[test]
    fn a_rewrite_of_stale_output_is_not_reported_as_a_first_write() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let first = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        assert_eq!(outcome_of(&first, ENTRY), Some(PublishOutcome::FirstWrite));

        vfs.write_file(
            Path::new("/vault/skills/code-review/code-review.md"),
            b"---\ndescription: reviews code, carefully\n---\nReview the diff twice.\n",
        )
        .unwrap();

        let again = publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap();
        let line = again.files.iter().find(|f| f.path == ENTRY).unwrap();
        assert_eq!(line.status, PublishStatus::Written);
        assert_eq!(line.outcome, PublishOutcome::Rewrite);
        assert_ne!(line.outcome, outcome_of(&first, ENTRY).unwrap());
    }

    // Rule 2's other half: the bytes are ours and identical, and only the
    // execute bit moved. Still a rewrite of recorded output, never a first
    // write of it.
    #[test]
    fn a_rewrite_that_changed_only_the_mode_is_still_a_rewrite() {
        const SCRIPT: &str = ".claude/skills/code-review/scripts/check.py";
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();

        let first = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        assert_eq!(outcome_of(&first, SCRIPT), Some(PublishOutcome::FirstWrite));

        vfs.set_executable(
            Path::new("/dest/.claude/skills/code-review/scripts/check.py"),
            false,
        )
        .unwrap();

        let again = publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap();
        let line = again.files.iter().find(|f| f.path == SCRIPT).unwrap();
        assert_eq!(line.status, PublishStatus::Written);
        assert_eq!(line.outcome, PublishOutcome::Rewrite);
    }

    // The self-healing case `classify`'s rule order exists for, asserted on
    // the outcome as well as the status: a destination holding exactly our
    // bytes with no manifest is claimed, not conflicted and not a first write.
    #[test]
    fn our_own_bytes_with_no_manifest_are_claimed() {
        let vfs = vault_with_peers();
        vfs.create_dir_all(Path::new("/dest")).unwrap();
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        vfs.remove(&crate::manifest::manifest_path(Path::new("/dest")))
            .unwrap();

        let report = publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap();
        let line = report.files.iter().find(|f| f.path == ENTRY).unwrap();
        assert_eq!(line.status, PublishStatus::Unchanged);
        assert_eq!(line.outcome, PublishOutcome::Claimed);
    }

    #[test]
    fn the_wire_forms_are_lowercase() {
        // Hosts read this report as JSON; pin the wire form.
        let report = PublishReport {
            files: vec![PublishedFile {
                path: "a/SKILL.md".into(),
                status: PublishStatus::Unchanged,
                outcome: PublishOutcome::Unchanged,
                reason: None,
            }],
            not_published: None,
            not_carried: Vec::new(),
            redundant_overrides: Vec::new(),
        };
        let json = serde_json::to_string(&report).unwrap();
        // An ordinary report is the shape it always was: `not_published` is
        // absent from the wire, not present as `null`.
        assert_eq!(
            json,
            r#"{"files":[{"path":"a/SKILL.md","status":"unchanged","outcome":"unchanged","reason":null}]}"#
        );
        let back: PublishReport = serde_json::from_str(&json).unwrap();
        assert_eq!(back.files[0].status, PublishStatus::Unchanged);
        assert!(back.not_published.is_none());

        let excluded = PublishReport {
            files: vec![],
            not_published: Some("`ap-targets` does not name `codex`".into()),
            not_carried: Vec::new(),
            redundant_overrides: Vec::new(),
        };
        let json = serde_json::to_string(&excluded).unwrap();
        assert_eq!(
            json,
            r#"{"files":[],"not_published":"`ap-targets` does not name `codex`"}"#
        );
    }

    // --- dry run -----------------------------------------------------------

    /// One row of a table-driven test builds its own vault from scratch, so no
    /// row can be reading a filesystem a previous one left behind.
    type Vault = Box<dyn Fn() -> MemVfs>;

    /// A vault whose destination already holds this publish.
    fn already_published() -> MemVfs {
        let vfs = vault_targeting(None);
        publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        vfs
    }

    #[test]
    fn a_dry_run_over_a_clean_destination_classifies_every_file_written() {
        let vfs = vault_targeting(None);
        let report = publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap();

        assert_eq!(
            statuses(&report),
            vec![
                (
                    ".claude/skills/code-review/SKILL.md",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/code-review/references/style.md",
                    PublishStatus::Written
                ),
                (
                    ".claude/skills/code-review/scripts/check.py",
                    PublishStatus::Written
                ),
            ]
        );
        assert!(report.files.iter().all(|f| f.reason.is_none()));
        assert!(report.not_published.is_none());
        // Classified, not written.
        assert!(!vfs.exists(Path::new("/dest/.claude/skills/code-review/SKILL.md")));
    }

    #[test]
    fn a_dry_run_over_an_identical_destination_classifies_every_file_unchanged() {
        let vfs = already_published();
        let before = everything(&vfs);

        let report = publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap();

        assert_eq!(tally(&report), (0, 3, 0), "{report:?}");
        assert_eq!(everything(&vfs), before);
    }

    #[test]
    fn a_dry_run_writes_nothing_and_creates_nothing() {
        // Byte-for-byte over the WHOLE filesystem rather than "the target file
        // is absent": a temporary staged beside it, or an empty
        // `.claude/skills/code-review/` left behind, is still a write.
        //
        // Four fixtures, so every branch the writer has is exercised — a file
        // it would create, a file it would overwrite, one it would leave alone,
        // a destination root it would have to bring into existence, and a
        // publish it would refuse outright.
        let cases: Vec<(&str, Vault, &str, Tally)> = vec![
            (
                "would write",
                Box::new(vault_with_peers),
                "/dest",
                (3, 0, 0),
            ),
            (
                "would update one file and leave two",
                Box::new(|| {
                    let vfs = already_published();
                    vfs.write_file(
                        Path::new("/vault/skills/code-review/code-review.md"),
                        b"---\ndescription: reviews code\nlicense: MIT\n---\nReview the diff twice.\n",
                    )
                    .unwrap();
                    vfs
                }),
                "/dest",
                (1, 2, 0),
            ),
            (
                "would have to create the destination root itself",
                Box::new(vault_with_peers),
                "/nowhere-yet",
                (3, 0, 0),
            ),
            (
                "would refuse: the destination is inside the vault",
                Box::new(vault_with_peers),
                "/vault/skills",
                (0, 0, 3),
            ),
        ];

        for (what, build, destination, expected) in cases {
            let vfs = build();
            let before = everything(&vfs);
            assert!(
                !before.is_empty(),
                "{what}: the snapshot saw nothing at all"
            );

            let report = publish_skill(&vfs, &dry(destination, "claude"), &ap()).unwrap();

            assert_eq!(tally(&report), expected, "{what}: {report:?}");
            assert_eq!(everything(&vfs), before, "{what}");

            // And the snapshot is not blind: the same publish for real moves
            // the tree exactly when the plan said it would.
            let performed = publish_skill(&vfs, &request(destination, "claude"), &ap()).unwrap();
            assert_eq!(wire(&report), wire(&performed), "{what}");
            assert_eq!(
                everything(&vfs) != before,
                expected.0 > 0,
                "{what}: the real run and its plan disagree about whether anything moved"
            );
        }
    }

    // This test used to assert the opposite, and said so: "There is no
    // `foreign` refusal in this build … what a real run does to somebody
    // else's file at one of our paths is overwrite it." The manifest is what
    // makes the refusal possible, and the bytes at a destination are usually
    // the only copy — destinations are not repositories.
    #[test]
    fn a_file_we_never_wrote_is_refused_rather_than_overwritten() {
        // A destination we have never published to, holding a file at one of
        // our paths. Nothing records it, so it is not ours to rewrite — we
        // cannot tell a hand-written `SKILL.md` from another tool's export.
        let vfs = vault_with_peers();
        let theirs = Path::new("/dest/.claude/skills/code-review/references/style.md");
        vfs.create_dir_all(theirs.parent().unwrap()).unwrap();
        vfs.write_file(theirs, b"# Hand-written, by somebody else\n")
            .unwrap();

        let planned = publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap();
        let line = planned
            .files
            .iter()
            .find(|f| f.path.ends_with("style.md"))
            .expect("the foreign path is still one of ours");

        assert_eq!(line.status, PublishStatus::Refused);
        let reason = line.reason.as_ref().expect("a refusal carries a reason");
        assert_eq!(reason.token, ReasonToken::Foreign, "{reason}");

        // The real run does exactly what the plan said, and the bytes stand.
        let performed = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        assert_eq!(wire(&planned), wire(&performed));
        assert_eq!(
            vfs.read_file(theirs).unwrap(),
            b"# Hand-written, by somebody else\n"
        );
    }

    // Our own file, edited at the destination. A different rule from the one
    // above and a different word, because the user's move differs: publishing
    // fixes staleness and will not fix this.
    #[test]
    fn our_own_file_edited_at_the_destination_is_a_conflict_not_a_foreign_file() {
        let vfs = already_published();
        let ours = Path::new("/dest/.claude/skills/code-review/references/style.md");
        vfs.write_file(ours, b"# Edited at the destination\n")
            .unwrap();

        let report = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap();
        let line = report
            .files
            .iter()
            .find(|f| f.path.ends_with("style.md"))
            .expect("still one of ours");

        assert_eq!(line.status, PublishStatus::Refused);
        let reason = line.reason.as_ref().expect("a reason");
        assert_eq!(reason.token, ReasonToken::Conflict, "{reason}");
        // It names when we last published, so the cost of overwriting is legible.
        assert!(
            reason.to_string().contains("2026-08-29T10:00:00Z"),
            "{reason}"
        );
        assert_eq!(
            vfs.read_file(ours).unwrap(),
            b"# Edited at the destination\n"
        );
    }

    // Per file and named. There is no run-wide force, because discarding
    // somebody's edit is a decision about that edit.
    #[test]
    fn naming_the_file_is_what_lets_it_be_overwritten() {
        let vfs = already_published();
        let theirs = Path::new("/dest/.claude/skills/code-review/references/style.md");
        vfs.write_file(theirs, b"# Hand-written, by somebody else\n")
            .unwrap();

        let mut acknowledged = request("/dest", "claude");
        acknowledged.overwrite = vec![".claude/skills/code-review/references/style.md".to_owned()];
        let report = publish_skill(&vfs, &acknowledged, &ap()).unwrap();

        let line = report
            .files
            .iter()
            .find(|f| f.path.ends_with("style.md"))
            .expect("still one of ours");
        assert_eq!(line.status, PublishStatus::Written);
        assert_ne!(
            vfs.read_file(theirs).unwrap(),
            b"# Hand-written, by somebody else\n"
        );
    }

    // Rule 6's acknowledged arm. A file nothing records, whose bytes differ
    // from ours, is *overwritten* — not claimed. `claimed` says "already
    // byte-identical", which would be a flat falsehood about content this run
    // replaced.
    #[test]
    fn an_acknowledged_foreign_overwrite_is_not_reported_as_a_claim() {
        let vfs = vault_with_peers();
        let theirs = Path::new("/dest/.claude/skills/code-review/references/style.md");
        vfs.create_dir_all(theirs.parent().unwrap()).unwrap();
        vfs.write_file(theirs, b"# Hand-written, by somebody else\n")
            .unwrap();

        let mut acknowledged = request("/dest", "claude");
        acknowledged.overwrite = vec![".claude/skills/code-review/references/style.md".to_owned()];
        let report = publish_skill(&vfs, &acknowledged, &ap()).unwrap();

        let line = report
            .files
            .iter()
            .find(|f| f.path.ends_with("style.md"))
            .expect("still one of ours");
        assert_eq!(line.status, PublishStatus::Written);
        assert_eq!(line.outcome, PublishOutcome::Overwritten);
        let reason = line.reason.as_ref().expect("an overwrite carries a reason");
        assert_eq!(reason.token, ReasonToken::Overwritten, "{reason}");
        assert!(
            !reason.to_string().contains("byte-identical"),
            "the bytes differed: {reason}"
        );
        assert_ne!(
            vfs.read_file(theirs).unwrap(),
            b"# Hand-written, by somebody else\n"
        );
    }

    #[test]
    fn the_rail_refuses_a_dry_run_the_same_way_it_refuses_a_real_one() {
        let vfs = vault_with_peers();
        let before = everything(&vfs);

        for destination in ["/vault", "/vault/skills", "/vault/skills/code-review"] {
            let planned = publish_skill(&vfs, &dry(destination, "claude"), &ap()).unwrap();

            assert_eq!(statuses(&planned).len(), 3, "{destination}");
            for file in &planned.files {
                assert_eq!(file.status, PublishStatus::Refused, "{destination}");
                let reason = file.reason.as_ref().expect("a reason");
                assert_eq!(reason.token, ReasonToken::UnsafeRoot, "{reason}");
                assert!(
                    reason.to_string().contains("protected source tree"),
                    "{reason}"
                );
            }
            // Same report, same reason, in both modes.
            let performed = publish_skill(&vfs, &request(destination, "claude"), &ap()).unwrap();
            assert_eq!(wire(&planned), wire(&performed), "{destination}");
            assert_eq!(everything(&vfs), before, "{destination}");
        }
    }

    #[test]
    fn an_unknown_target_name_blocks_a_dry_run_under_the_same_token() {
        // Again: a dry run that hid this would be a preview of a publish
        // that never happens.
        let vfs = vault_targeting(Some("[claude, claud]"));
        let before = everything(&vfs);

        let planned = publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap();

        assert_eq!(statuses(&planned).len(), 3, "{planned:?}");
        for file in &planned.files {
            assert_eq!(file.status, PublishStatus::Refused);
            let reason = file.reason.as_ref().expect("a reason");
            assert_eq!(reason.token, ReasonToken::UnknownTarget, "{reason}");
            assert!(reason.to_string().contains("`claud`"), "{reason}");
        }
        assert_eq!(everything(&vfs), before);
    }

    #[test]
    fn an_excluded_destination_reports_no_files_in_a_dry_run_either() {
        // An exclusion is the absence of an outcome in both modes, so a
        // preview must not invent one — and must still say why.
        let vfs = vault_targeting(Some("[claude]"));
        let before = everything(&vfs);

        let planned = publish_skill(&vfs, &dry("/dest", "codex"), &ap()).unwrap();

        assert!(planned.files.is_empty(), "{planned:?}");
        let reason = planned
            .not_published
            .as_deref()
            .expect("a reason, not a silent skip");
        assert!(reason.contains("codex"), "{reason}");
        assert!(reason.contains("`claude`"), "{reason}");

        let performed = publish_skill(&vfs, &request("/dest", "codex"), &ap()).unwrap();
        assert_eq!(wire(&planned), wire(&performed));
        assert_eq!(everything(&vfs), before);
    }

    #[test]
    fn a_note_a_real_run_refuses_outright_a_dry_run_refuses_identically() {
        // The refusals that never reach the report, because they stop the read
        // or the kind check before a projection exists. A dry run must raise
        // them too, under the same token: a preview that swallowed one would
        // promise a publish that cannot happen.
        for (token, note) in [
            ("empty-plugin", PLUGIN_NOTE),
            (
                "mixed-frontmatter-shape",
                "---\ndescription: reviews code\nap-kind: skill\nap:\n  targets:\n    - claude\n---\nReview the diff.\n",
            ),
        ] {
            let vfs = vault_with_peers();
            vfs.write_file(
                Path::new("/vault/skills/code-review/code-review.md"),
                note.as_bytes(),
            )
            .unwrap();
            vfs.create_dir_all(Path::new("/dest")).unwrap();
            let before = everything(&vfs);

            let planned = publish_skill(&vfs, &dry("/dest", "claude"), &ap()).unwrap_err();
            let message = planned.to_string();

            assert!(matches!(planned, CoreError::Refused(_)), "{message}");
            assert!(message.contains(token), "{message}");
            assert_eq!(everything(&vfs), before, "{token}");

            // And the same sentence, word for word, from a real run.
            let performed = publish_skill(&vfs, &request("/dest", "claude"), &ap()).unwrap_err();
            assert_eq!(message, performed.to_string(), "{token}");
        }
    }

    #[test]
    fn a_dry_run_reports_exactly_what_the_real_run_reports() {
        // The guard against drift, and the reason a mode was chosen over a
        // second entry point. Each fixture is published twice over one
        // filesystem — dry first, so the real run sees precisely the state the
        // dry run classified — and the two answers are compared at the wire.
        let fixtures: Vec<(&str, Vault, &str, &str)> = vec![
            (
                "a clean destination",
                Box::new(vault_with_peers),
                "/dest",
                "claude",
            ),
            (
                "a destination root that does not exist yet",
                Box::new(vault_with_peers),
                "/nowhere-yet",
                "claude",
            ),
            (
                "a destination already holding this publish",
                Box::new(already_published),
                "/dest",
                "claude",
            ),
            (
                "a note edited since it was published",
                Box::new(|| {
                    let vfs = already_published();
                    vfs.write_file(
                        Path::new("/vault/skills/code-review/code-review.md"),
                        b"---\ndescription: reviews code\nlicense: MIT\n---\nReview the diff twice.\n",
                    )
                    .unwrap();
                    vfs
                }),
                "/dest",
                "claude",
            ),
            (
                "a foreign file at one of our paths",
                Box::new(|| {
                    let vfs = already_published();
                    vfs.write_file(
                        Path::new("/dest/.claude/skills/code-review/references/style.md"),
                        b"# Somebody else's\n",
                    )
                    .unwrap();
                    vfs
                }),
                "/dest",
                "claude",
            ),
            (
                "a stale execute bit and nothing else",
                Box::new(|| {
                    let vfs = already_published();
                    vfs.set_executable(
                        Path::new("/dest/.claude/skills/code-review/scripts/check.py"),
                        false,
                    )
                    .unwrap();
                    vfs
                }),
                "/dest",
                "claude",
            ),
            (
                "a note carrying every key of ours",
                Box::new(|| {
                    let vfs = vault_with_peers();
                    vfs.write_file(
                        Path::new("/vault/skills/code-review/code-review.md"),
                        NOTE_WITH_OUR_KEYS.as_bytes(),
                    )
                    .unwrap();
                    vfs
                }),
                "/dest",
                "claude",
            ),
            (
                "the rail: a destination inside the vault",
                Box::new(vault_with_peers),
                "/vault/skills",
                "claude",
            ),
            (
                "an unknown name in `ap-targets`",
                Box::new(|| vault_targeting(Some("[claude, claud]"))),
                "/dest",
                "claude",
            ),
            (
                "a destination `ap-targets` leaves out",
                Box::new(|| vault_targeting(Some("[claude]"))),
                "/dest",
                "codex",
            ),
            (
                "an empty `ap-targets`",
                Box::new(|| vault_targeting(Some("[]"))),
                "/dest",
                "claude",
            ),
            (
                "a plugin note",
                Box::new(|| {
                    let vfs = vault_with_peers();
                    vfs.write_file(
                        Path::new("/vault/skills/code-review/code-review.md"),
                        PLUGIN_NOTE.as_bytes(),
                    )
                    .unwrap();
                    vfs
                }),
                "/dest",
                "claude",
            ),
            (
                "a target with no renderer",
                Box::new(vault_with_peers),
                "/dest",
                "cursor",
            ),
            (
                "a note carrying both frontmatter shapes",
                Box::new(|| {
                    let vfs = vault_with_peers();
                    vfs.write_file(
                        Path::new("/vault/skills/code-review/code-review.md"),
                        b"---\ndescription: reviews code\nap-kind: skill\nap:\n  targets:\n    - claude\n---\nReview the diff.\n",
                    )
                    .unwrap();
                    vfs
                }),
                "/dest",
                "claude",
            ),
            (
                "a note with no description at all",
                Box::new(|| {
                    let vfs = vault_with_peers();
                    vfs.write_file(
                        Path::new("/vault/skills/code-review/code-review.md"),
                        b"No frontmatter.\n",
                    )
                    .unwrap();
                    vfs
                }),
                "/dest",
                "claude",
            ),
        ];

        let mut seen = Vec::new();
        for (name, build, destination, target) in fixtures {
            let vfs = build();
            let before = everything(&vfs);

            let planned = outcome(publish_skill(&vfs, &dry(destination, target), &ap()));
            assert_eq!(
                everything(&vfs),
                before,
                "{name}: the dry run moved something"
            );

            let performed = outcome(publish_skill(&vfs, &request(destination, target), &ap()));
            assert_eq!(planned, performed, "{name}");
            seen.push(planned);
        }

        // The table only guards against drift if its rows differ: a dozen
        // identical empty reports would agree with each other and prove
        // nothing.
        let distinct: BTreeSet<&Result<String, String>> = seen.iter().collect();
        assert!(distinct.len() >= 7, "{distinct:#?}");
        assert!(
            seen.iter().any(Result::is_err),
            "no fixture reached an error"
        );
        for token in [
            "\"written\"",
            "\"unchanged\"",
            "\"refused\"",
            "not_published",
        ] {
            assert!(
                seen.iter()
                    .any(|o| matches!(o, Ok(json) if json.contains(token))),
                "no fixture produced {token}"
            );
        }
    }

    #[test]
    fn a_dry_run_maps_to_the_exit_code_its_real_counterpart_would() {
        // The CLI spec: "`--dry-run` writes nothing and returns the exit code
        // the real run would have returned." The core does not own exit codes,
        // so what it owes is a report a caller maps to the same number — for
        // the run that lands everything, the destination-level blockers that
        // are exit 1, and the exclusion that is emphatically not.
        let cases: Vec<(&str, Vault, &str, &str, i32)> = vec![
            (
                "everything written",
                Box::new(vault_with_peers),
                "/dest",
                "claude",
                0,
            ),
            (
                "everything unchanged",
                Box::new(already_published),
                "/dest",
                "claude",
                0,
            ),
            (
                "a destination-level blocker: the rail",
                Box::new(vault_with_peers),
                "/vault/skills",
                "claude",
                1,
            ),
            (
                "a destination-level blocker: an unknown target name",
                Box::new(|| vault_targeting(Some("[claude, claud]"))),
                "/dest",
                "claude",
                1,
            ),
            (
                "an exclusion, which is not a refusal",
                Box::new(|| vault_targeting(Some("[claude]"))),
                "/dest",
                "codex",
                0,
            ),
        ];

        for (name, build, destination, target, expected) in cases {
            let vfs = build();
            let planned = publish_skill(&vfs, &dry(destination, target), &ap()).unwrap();
            let performed = publish_skill(&vfs, &request(destination, target), &ap()).unwrap();

            assert_eq!(exit_code(&planned), expected, "{name}");
            assert_eq!(exit_code(&planned), exit_code(&performed), "{name}");
        }
    }

    #[test]
    fn the_mode_rides_the_request_and_an_absent_one_still_writes() {
        // The wasm boundary serializes a `PublishRequest`, so this is the whole
        // of what a host has to learn to preview — and a host that has learned
        // nothing keeps publishing exactly as before.
        let old: PublishRequest = serde_json::from_str(
            r#"{"skill_path":"/vault/skills/code-review/code-review.md","destination_root":"/dest","target":"claude"}"#,
        )
        .unwrap();
        assert_eq!(old.mode, PublishMode::Write);

        let asked: PublishRequest = serde_json::from_str(
            r#"{"skill_path":"/vault/skills/code-review/code-review.md","destination_root":"/dest","target":"claude","mode":"dry-run"}"#,
        )
        .unwrap();
        assert_eq!(asked.mode, PublishMode::DryRun);

        assert_eq!(
            serde_json::to_value(PublishMode::DryRun).unwrap(),
            serde_json::json!("dry-run")
        );
        assert_eq!(
            serde_json::to_value(PublishMode::Write).unwrap(),
            serde_json::json!("write")
        );

        // A mode this build does not know is a deserialization failure, not a
        // silent write — the same reading `ap-targets` gives an unknown name.
        assert!(
            serde_json::from_str::<PublishRequest>(
                r#"{"skill_path":"/v/a.md","destination_root":"/dest","target":"claude","mode":"maybe"}"#,
            )
            .is_err()
        );
    }
}

//! Rename and move one note without breaking the vault, as a
//! plan/execute pair over a path map.
//!
//! Renaming a note in a vault is not a filesystem operation. It is a
//! filesystem operation plus a rewrite of every inbound `[[wikilink]]` in every
//! note that pointed at it, and there is no transaction underneath either half.
//! This crate is the whole of that: [`plan()`] computes the rewrite set and
//! returns it for a human to look at, [`execute`] applies it under per-file
//! compare-and-swap, and nothing is written until the second call.
//!
//! Every function that takes a `vault_dir` needs an absolute path: the path
//! guard reads no current directory, and a relative one is refused with
//! [`TransformError::Path`].
//!
//! # Never string-guessing
//!
//! The tempting implementation is textual — find the old name in every body,
//! substitute the new one. It cannot be made correct, and the reasons are
//! the link-rewriting design in miniature:
//!
//! - **A bare-name link carries no path.** `[[Alpha]]` says nothing about
//!   `Projects/`, so a path-oriented substitution never matches it, and a
//!   name-oriented one also matches the prose sentence "the Alpha project".
//! - **The correct output is sometimes no output.** Moving `Projects/Alpha.md`
//!   to `Archive/Alpha.md` must leave `[[Alpha]]` **exactly as written** — the
//!   basename did not change and the link still resolves. A substitution pass
//!   has no way to know that; it either rewrites (churning every linking note
//!   for nothing) or does not (and cannot tell that case from the one where it
//!   must).
//! - **Spellings diverge from identities.** `[the notes](Projects/Alpha%20One.md)`
//!   and `[[Alpha One]]` name the same file.
//! - **The right answer depends on the whole vault.** Whether the new bare name
//!   is unambiguous is a property of every *other* note's path, not of the two
//!   paths in the request.
//!
//! So every link is **resolved to an identity, looked up in the path map, and
//! re-expressed** — never matched as text. The internal path map is the
//! single source of truth for where things went; v1 puts exactly one entry in
//! it, and every type below is shaped so a multi-entry map (a folder move, a
//! bulk restructure) needs no reshaping to arrive.
//!
//! # Span-preserving: only the target changes
//!
//! A rewrite replaces the **target span** of a link and nothing else. An alias
//! (`|the alpha project`), a heading anchor (`#Goals`), a block ref
//! (`#^goals-block`) and an embed's `!` all ride along byte for byte, because
//! none of them is a fact about where the file is. That is what makes a rename
//! diff reviewable: the only bytes that moved are the ones that had to.
//!
//! # There is no markdown scanner in this crate
//!
//! Enumeration is [`markdown_link::body_links_spanned`] and
//! normalisation is that module's too. A second answer to "is this a link"
//! would mean splicing bytes that are not one, so the offset scanner lives in
//! `markdown-link` and is never copied up. The only index built here is
//! the planner's internal corpus, and its docs argue why it is a different *question*
//! rather than a second implementation.
//!
//! Nor is there a cache. [`VaultFacts`] is a snapshot a caller supplies —
//! a host application can hand over its warm link graph and frontmatter index,
//! and [`VaultFacts::scan`] builds the same thing from a walk for anyone who
//! has neither. Keeping the caches out is what leaves this crate a pure
//! function over a vault, and what lets the arrow between the two crates point
//! one way.
//!
//! # Scope
//!
//! Two shapes: [`plan()`]/[`execute`] move one note, and [`bundle::plan_bundle`]/
//! [`bundle::execute_bundle`] move a **bundle** — a component folder shaped
//! `<name>/<name>.md` plus whatever peer files (a script, an image, a second
//! doc) live beside it — as one unit: the directory, its entry note, and
//! every peer. Not a multi-file restructure beyond that one directory, and
//! not deletes. The one delete-shaped plan is [`plan_redirect`]: the
//! edits that point a doomed note's inbound links at a copy that stays, which
//! the caller splices before it removes the note. The wire shapes anticipate more (a `PathMap` is a map,
//! the edit set is per-file, `expect` is a list), so the single-file planner
//! and the bundle planner are the SAME rewrite machinery over a bigger
//! `PathMap`, not two implementations that happen to agree.
//!
//! Journaled crash recovery is out of scope;
//! what this crate offers instead is that a partial application is
//! **reported**. The rename still completes, every file the apply pass
//! declined to write is named with its reason in [`RenameResult::skipped`], and
//! the links in those files still spell the old path — a broken link a person
//! repairs, not a state a re-run heals. [`execute`]'s docs say exactly what is
//! left behind and who fixes it; [`bundle::execute_bundle`]'s docs do the same
//! for the one bundle-specific failure mode, an entry-file rename that fails
//! after the directory already moved.

pub mod apply;
pub mod bundle;
pub mod error;
pub mod facts;
pub mod plan;
mod rewrite;

#[cfg(test)]
mod tests;

pub use apply::{execute, splice};
pub use bundle::{execute_bundle, plan_bundle};
pub use error::TransformError;
pub use facts::{FrontmatterRef, VaultFacts};
pub use plan::{plan, plan_redirect};

/// One file's byte edits, with the etag they were computed against.
///
/// Present even when `edits` is empty for the renamed note itself, because its
/// etag is still part of the compare-and-swap set: the plan asserts "the note
/// I am about to move is the one you previewed" whether or not it contains a
/// link to itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEdits {
    /// Vault-relative path of the note to edit.
    pub path: String,
    /// sha256 of the file's bytes at plan time.
    pub etag: String,
    /// Edits in **ascending offset order**. [`execute`] applies them in
    /// reverse, so an earlier splice cannot shift a later offset.
    pub edits: Vec<ByteEdit>,
}

/// One splice: delete `delete_count` bytes at `offset`, insert `insert`.
///
/// # The offsets index the FILE, not the body
///
/// A UI-facing link report may use body-relative spans,
/// because its consumer is an editor decorating the body it renders and the
/// frontmatter block's length is not something a decoration should have to
/// know. This type's consumer splices the file, so every number in it — the
/// offset and the line alike — counts from the first byte of the file. Mixing
/// the two conventions inside one struct is how a rename writes into the
/// middle of a YAML value, so the rule here is that they all mean the same
/// thing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ByteEdit {
    /// Byte offset into the file.
    pub offset: usize,
    /// How many bytes to remove. Always the length of [`Self::old_text`].
    pub delete_count: usize,
    /// What to put there.
    pub insert: String,
    /// The bytes being replaced, for the preview's old → new line.
    pub old_text: String,
    /// 1-indexed line **within the file**, for display.
    pub line: u64,
}

/// A file and the etag a caller expects it to still have.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEtag {
    /// Vault-relative path of the file.
    pub path: String,
    /// The etag the file had when it was planned.
    pub etag: String,
}

/// One peer file carried along by a bundle rename — everything under the
/// bundle's directory besides the entry note itself (a script, an image, a
/// second doc). Peers have no etag: they are moved, never edited on their own
/// account, so there is nothing to compare-and-swap. Listed in
/// [`RenamePlan::peers`] for the user's consent before the move and in
/// [`RenameResult::peers_moved`] for what actually moved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundlePeer {
    /// Vault-relative, under the bundle's OLD directory.
    pub from: String,
    /// Vault-relative, under the bundle's NEW directory — same position
    /// inside the bundle, only the directory prefix changes.
    pub to: String,
}

/// Why a link was not rewritten, or was rewritten in a way worth saying out
/// loud. Every one of these is reported whether or not the plan is applied —
/// silence is the failure mode this whole surface exists to avoid.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum DiagnosticCode {
    /// A bare name stopped being unique after the move, so the rewrite
    /// qualified it with the shortest path that is.
    AmbiguousLink,
    /// A link that names the renamed note but does not resolve to it — broken
    /// before the rename, and left exactly as broken. The transform refuses to
    /// destroy evidence of a problem it did not cause.
    PreBrokenLink,
    /// The renamed note links to itself. Rewritten by the same rule as any
    /// other inbound link; reported because "the note edited itself" is
    /// surprising in a preview that is otherwise about *other* notes.
    SelfLink,
    /// A link-shaped value in some note's frontmatter names the renamed note.
    /// Frontmatter is not rewritten (see [`plan()`]'s scope note) — this is the
    /// diagnostic that says so rather than ignoring it.
    FrontmatterLinkUntouched,
    /// `from` and `to` differ only by letter case.
    CaseOnlyRename,
    /// A link the scanner found but whose target span could not be located
    /// inside its own syntax. Never rewritten — a splice at a guessed offset is
    /// worse than a missed link.
    UnmappableLinkSpan,
    /// A note the snapshot says links here, which the planner could not read
    /// when it went to look. It is absent from the plan and from its
    /// compare-and-swap set, so nothing is written to it — and a link inside it
    /// will still name the old path afterwards.
    UnreadableCandidate,
    /// The same, for a note whose bytes are not valid UTF-8 by the time the
    /// planner reads them. Every offset in an edit indexes the file's bytes, and
    /// a lossy decode indexes a *different* string — each undecodable byte
    /// widens to a three-byte U+FFFD — so every edit after the first bad byte
    /// would splice in the wrong place.
    InvalidUtf8Candidate,
}

impl DiagnosticCode {
    /// The stable wire string. Codes are matched by clients, so they are
    /// spelled once, here.
    pub fn as_str(self) -> &'static str {
        match self {
            DiagnosticCode::AmbiguousLink => "ambiguous_link",
            DiagnosticCode::PreBrokenLink => "pre_broken_link",
            DiagnosticCode::SelfLink => "self_link",
            DiagnosticCode::FrontmatterLinkUntouched => "frontmatter_link_untouched",
            DiagnosticCode::CaseOnlyRename => "case_only_rename",
            DiagnosticCode::UnmappableLinkSpan => "unmappable_link_span",
            DiagnosticCode::UnreadableCandidate => "unreadable_candidate",
            DiagnosticCode::InvalidUtf8Candidate => "invalid_utf8_candidate",
        }
    }
}

/// One diagnostic, against the note it was found in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    /// The kind of finding.
    pub code: DiagnosticCode,
    /// The note the finding is about. Empty for a finding about the rename
    /// itself rather than about any one note (`case_only_rename`).
    pub note_path: String,
    /// Human-readable specifics — the link as written, the qualified form
    /// chosen, the frontmatter key.
    pub detail: String,
}

/// The reviewable rewrite set: what a rename would do, before it does it.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RenamePlan {
    /// The normalised source path.
    pub from: String,
    /// The normalised destination path.
    pub to: String,
    /// Why the rename cannot proceed, when it cannot. `None` means the plan is
    /// applicable. A conflict is data rather than an error because
    /// the error channel is a string by the time a browser sees it.
    pub conflict: Option<String>,
    /// Per-file edits, sorted by path. Includes the renamed note itself when it
    /// links to itself, and always includes its etag entry via [`Self::expect`].
    pub files: Vec<FileEdits>,
    /// Findings the planner reports beside the edits.
    pub diagnostics: Vec<Diagnostic>,
    /// How many notes the planner looked at.
    pub files_scanned: u64,
    /// The compare-and-swap set: every file whose bytes this plan depends on,
    /// **including the renamed note**.
    pub expect: Vec<FileEtag>,
    /// Set for a bundle rename ([`bundle::plan_bundle`]): every file under the
    /// bundle's directory besides the entry note, source path to destination
    /// path — the directory-move mapping a user has to see to consent to it.
    /// Empty for a single-file rename.
    pub peers: Vec<BundlePeer>,
}

impl RenamePlan {
    /// Whether the plan can be applied.
    pub fn ok(&self) -> bool {
        self.conflict.is_none()
    }

    /// How many individual link rewrites the plan carries.
    pub fn edit_count(&self) -> u64 {
        self.files.iter().map(|f| f.edits.len() as u64).sum()
    }

    /// How many notes the plan would edit. Distinct from the number of files
    /// it *depends* on — a pure folder move rewrites nothing and still has a
    /// full `expect` set.
    pub fn edited_file_count(&self) -> u64 {
        self.files.iter().filter(|f| !f.edits.is_empty()).count() as u64
    }
}

/// One file the apply pass declined to touch, and why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Skip {
    /// Vault-relative path of the file that was skipped.
    pub path: String,
    /// A short stable reason: `drifted`, `not_previewed`, `unreadable`,
    /// `write_failed`, or `entry_rename_failed` (a bundle's entry file did not
    /// take its new name after the directory moved; the filesystem error is in
    /// [`RenameResult::conflict`]).
    pub reason: String,
}

/// What an apply actually did. Every outcome is reported — nothing is silently
/// repointed and nothing is silently dropped.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RenameResult {
    /// Whether the rename as a whole succeeded. `false` with a `conflict` set
    /// means nothing was touched at all.
    pub ok: bool,
    /// Whether the file itself moved.
    pub renamed: bool,
    /// Which linking notes were rewritten, vault-relative.
    ///
    /// The wire shape carries only the count, because a preview already told
    /// the client which files it would touch. The paths are kept here for the
    /// caller that has to *react* to them — a host publishing one change event
    /// per edited note cannot do it from a number.
    pub edited: Vec<String>,
    /// Files in the plan that were not written, with the reason.
    pub skipped: Vec<Skip>,
    /// The etag of the note at its new path. Empty when nothing moved.
    pub new_etag: String,
    /// Why the rename was refused, when it was. Same success-channel
    /// discipline as [`RenamePlan::conflict`]. Also set, with `ok` still
    /// `true`, when a bundle's entry file failed to rename after the directory
    /// moved: it then holds the filesystem error behind the
    /// `entry_rename_failed` skip.
    pub conflict: Option<String>,
    /// For a bundle rename, every peer file that moved. Since the move is one
    /// `fs::rename` on the whole directory, this is either all of
    /// [`RenamePlan::peers`] (the directory landed) or none (it did not).
    /// Empty for a single-file rename.
    pub peers_moved: Vec<BundlePeer>,
}

// Compiles the README's code blocks as doctests, so they cannot drift from the
// API. Kept out of the rendered crate docs, which already say the same things.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;

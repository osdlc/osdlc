//! Adoption — published SKILL.md bundles imported as vault notes.
//!
//! The reverse of publication. A source of
//! published skills — one skill directory, a plugin directory holding a
//! `skills/` folder, or a directory of skill directories — becomes notes under
//! the vault's skills root, shaped so that
//! [`crate::discover::discover_components`] finds every one of them and the
//! import re-publishes through the same pipeline it came from.
//!
//! # The rail's mirror
//!
//! [`crate::publish`] never writes into a source tree it reads; adoption never
//! writes into the **source** it reads (the publish spec).
//! [`crate::guard::assert_destination_allowed`] refuses a skills root equal to,
//! inside, or containing the source — both sides resolved as far as the
//! filesystem can see them — before anything is planned.
//!
//! # What one adopted skill becomes
//!
//! | Source | Vault |
//! |---|---|
//! | `<dir>/SKILL.md` | `<root>/plugins/<plugin>/skills/<name>/<name>.md`, frontmatter rebuilt |
//! | any other file under `<dir>` | the same relative path beside that entry, markdown bodies rewritten, bytes and execute bits otherwise verbatim |
//! | — | `<root>/plugins/<plugin>/<plugin>.md`, a bare `ap-kind: plugin` note, created once and never rewritten |
//!
//! `<root>` is [`AdoptRequest::skills_root`], the vault root unless configured.
//! `plugins/<plugin>/skills/<name>/<name>.md` is one of discovery's shapes, so
//! the walk that vets adopted notes is the same walk that vets hand-authored
//! ones; an import this module wrote but discovery refused is a bug in one of
//! the two.
//!
//! Both kind folders are load-bearing. `skills/` is what makes the plugin
//! directory read as a plugin — without a kind folder inside it, `<plugin>/` is
//! just a directory carrying files. `plugins/` is what makes `<plugin>` a
//! plugin name rather than a stray directory under the root, and must be
//! written rather than assumed of the root: a root whose basename happens to be
//! `plugins` supplies that level only by coincidence.
//!
//! # The rewrite is [`crate::compile`]'s, inverted
//!
//! Relative markdown links and images to bundled files become `[[wikilinks]]`
//! addressed by note name — the shortest-path spelling Obsidian resolves and
//! the compile pass rewrites back to relative links at the next publish. What
//! passes through untouched, and the inline-code span that does not, are
//! [`rewrite_to_wikilinks`]'s contract.
//!
//! # Frontmatter: rebuilt at the namespace, with provenance
//!
//! The adopted entry note carries the Agent Skills spec's bare `name` and `description`,
//! every *foreign* source key verbatim, and then our namespace's keys —
//! `ap-kind: skill`, `ap-plugin`, `ap-targets` when the request narrows, and
//! every one of [`crate::frontmatter::Provenance`]'s six:
//!
//! | Key | What it records |
//! |---|---|
//! | `ap-source` | Where the skill came from: the directory read, or [`AdoptRequest::source_label`] where a caller fetched the tree from somewhere durable |
//! | `ap-format` | The harness layout it was read in — [`AdoptRequest::format`], or [`detect_format`]'s answer |
//! | `ap-source-hash` | [`crate::projection::content_hash`] over the source files as read |
//! | `ap-adopted-hash` | The same formula over what adoption wrote |
//! | `ap-adopted-at` | The caller's clock |
//! | `ap-also-at` | Every other root in [`AdoptRequest::also_scan`] holding the same content |
//!
//! `ap-also-at` is the one with three outcomes rather than two, spelled the
//! way `ap-targets` is: no roots to cross-reference writes no key at all,
//! because a key would claim a scan that never ran; roots that turned up
//! nothing write `[]`, which is a different and useful fact.
//!
//! # Re-adopt is a three-way comparison, not an existence check
//!
//! `ap-source-hash` answers "has the source moved on". `ap-adopted-hash`
//! answers "has the note been edited since". Together they place a re-adopt
//! in one of four quadrants (the publish spec): neither moved is
//! [`AdoptStatus::Unchanged`] and writes nothing; only the source moved is
//! [`AdoptStatus::Updated`]; only the note moved is `Unchanged`, because the
//! note is the user's and the source has nothing new to give; both moved is
//! `refused: diverged`, which has no base to merge from.
//!
//! A note carrying no provenance at all was written by hand, and is
//! `refused: hand-authored` rather than compared. A note whose hashes are
//! absent or unparseable proves nothing, and is `refused: diverged`. A note
//! recording a *different* `ap-source` is `refused: foreign-provenance`: both
//! its hashes were taken against that other source, so the quadrant cannot
//! speak about this one, and reading it through the quadrant anyway would
//! replace somebody else's adoption without a word.
//!
//! The escape from any of them — a refusal, or an edited note the source has
//! nothing to give — is [`AdoptRequest::overwrite`], per note and named. There
//! is no run-wide force: discarding a note somebody edited is a decision about
//! *that note*.
//!
//! `ap-adopted-hash` is computed over the entry note **with every key under
//! the namespace prefix removed**, plus every peer file. The exclusion is what
//! makes it satisfiable — one of those keys holds the hash — and it is also
//! what makes hand-editing `ap-targets` in Obsidian not read as an edit to the
//! note's content.
//!
//! `ap-adopted-at` is the *caller's* clock, a field on [`AdoptRequest`]. This
//! crate reads no clock, for the same reason it opens no file without a
//! [`Vfs`]: `wasm32-unknown-unknown` has neither.
//!
//! # Further contracts
//!
//! * **Foreign frontmatter keys are carried, not dropped.** `license`,
//!   `allowed-tools` and everything else travel into the note, so an
//!   adopt-then-publish round trip returns them — the verbatim-carry rule
//!   ([`crate::vault`]).
//! * **A source key inside the namespace is refused.** A published `SKILL.md`
//!   never carries our keys — the publish-time strip guarantees it — so one
//!   that does was not made by this pipeline, and carrying it would let the
//!   source dictate the vault's own configuration (`ap-kind: plugin` would
//!   silently re-kind the note).
//! * **What adoption writes is pre-validated with discovery's rules** — the
//!   skills-spec name rule for skill and plugin names, the 1024-character
//!   description cap — so the written vault discovers instead of failing one
//!   scan later. Targets validate against [`KNOWN_TARGETS`] with the core's
//!   three-outcome contract: `None` writes no `ap-targets` key at all.
//! * **Collisions and misses are loud.** Two source directories adopting onto
//!   one name are refused naming both; a requested skill that matches nothing
//!   is refused by name; a symlink anywhere in the source is refused
//!   `unsafe-path` exactly as discovery refuses one.
//! * **Nothing is written until everything is planned.** Every source file is
//!   read, rewritten, and vetted first, so a refusal or error over the third
//!   skill leaves the vault untouched rather than half-imported.
//!
//! # A dry run is the same adoption, over a different filesystem
//!
//! [`AdoptMode::DryRun`] runs the identical path against a
//! [`crate::vfs::PreviewVfs`] over the caller's filesystem, not a second code
//! path. The report is the one the write would have produced, existing targets
//! are classified against the real tree, and not one byte lands.

use std::path::{Path, PathBuf};

use markdown_link::code::{CodeRules, FenceLine, Fences, Spans};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::compile::{basename, extension_of_target};
use crate::discover::{slugify, validate_name};
use crate::error::CoreError;
use crate::frontmatter::EntityKind;
use crate::guard::{assert_destination_allowed, resolve_write_path, within};
use crate::namespace::Namespace;
use crate::projection::{ProjectedFile, content_hash};
use crate::publish::KNOWN_TARGETS;
use crate::skill::{forward_slashed, read_utf8, split_frontmatter};
use crate::vault::{frontmatter_map, read_vault_skill};
use crate::vfs::{PreviewVfs, Vfs, normalize};

/// The plugin adopted skills group under when the request names none, so a
/// bare `adopt` is honest about what it did.
pub const DEFAULT_ADOPTED_PLUGIN: &str = "adopted";

/// One adoption: this source, into this vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdoptRequest {
    /// Absolute path to what is being adopted: a skill directory (holds a
    /// `SKILL.md`), a plugin directory (holds `skills/`), or a directory of
    /// skill directories.
    pub source: PathBuf,
    /// Absolute path to the vault root.
    pub vault_root: PathBuf,
    /// The content root written under — the vault root when `None`, which is
    /// the same root [`crate::discover::discover_components`] scans by default.
    /// The two must name the same tree: an adoption the scan cannot find is an
    /// import that silently went nowhere.
    ///
    /// This is a *content* root, not a plugins directory. Adoption spells the
    /// `plugins/<plugin>/skills/` levels under it, so a vault gets
    /// `<vault>/plugins/adopted/skills/…` and a root configured to `library/`
    /// gets `library/plugins/adopted/skills/…` — each one a tree a scan from
    /// that root reads.
    #[serde(default)]
    pub skills_root: Option<PathBuf>,
    /// The plugin group stamped as `ap-plugin`;
    /// [`DEFAULT_ADOPTED_PLUGIN`] when `None`. Validated with the skills
    /// spec's name rule — it becomes a directory name.
    #[serde(default)]
    pub plugin: Option<String>,
    /// What [`Self::source`] is CALLED in `ap-source`, when the path is not
    /// the honest answer.
    ///
    /// A source fetched from a repository lives in a cache directory whose
    /// path says nothing about where the skill came from and will not
    /// survive a cache sweep. The caller that fetched it knows the durable
    /// spelling — `<url>@<sha>` — and hands it over here. The re-adopt
    /// comparison reads this too, so a note stamped with a URL is compared
    /// against that URL rather than against the checkout it happens to sit
    /// in this run.
    ///
    /// `None` stamps the source path, which is what a local adoption wants.
    #[serde(default)]
    pub source_label: Option<String>,
    /// The harness layout stamped as `ap-format` — `claude`, `codex`, and
    /// the rest of [`crate::skill::RUNTIME_DIRS`]'s second column.
    ///
    /// `None` derives one from the source path, so a caller that knows the
    /// answer (a picker naming the harness) states it and a caller that does
    /// not gets the heuristic. See [`detect_format`].
    #[serde(default)]
    pub format: Option<String>,
    /// Further roots to cross-reference for `ap-also-at`: every other place
    /// this machine holds the same skill. Three outcomes, like
    /// [`Self::targets`] — see the module doc's `ap-also-at` row.
    #[serde(default)]
    pub also_scan: Vec<PathBuf>,
    /// What lands in `ap-targets`, with the key's own three-outcome contract:
    /// `None` writes no key (every destination), an empty list writes `[]`
    /// (nowhere), names are validated against [`KNOWN_TARGETS`].
    #[serde(default)]
    pub targets: Option<Vec<String>>,
    /// Adopt only these skills, matched by source directory basename or
    /// source-relative path. A name that matches nothing is refused.
    #[serde(default)]
    pub skills: Option<Vec<String>>,
    /// Vault notes whose replacement the caller has explicitly acknowledged,
    /// and which this run may therefore overwrite.
    ///
    /// Per note and named, never a run-wide force — the same rule and the
    /// same spelling as [`crate::publish::PublishRequest::overwrite`]. A note
    /// matches by its entry path: the absolute spelling the report prints, or
    /// that path relative to the vault root or the content root.
    #[serde(default)]
    pub overwrite: Vec<String>,
    /// Write, or classify only. Absent on the wire means [`AdoptMode::Write`].
    #[serde(default)]
    pub mode: AdoptMode,
    /// The timestamp stamped as `ap-adopted-at`, supplied by the caller —
    /// the layer that has a clock. See the module doc.
    pub adopted_at: String,
}

/// Whether an adoption writes, or only reports what it would write.
///
/// The same shape as [`crate::publish::PublishMode`], for the same reasons:
/// one code path, previewing a property of the request so it rides the wire,
/// and a default that does the thing harder to undo rather than the thing
/// that silently does nothing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AdoptMode {
    /// Plan and write.
    #[default]
    Write,
    /// Plan and stop. The report is the one the write would have produced.
    DryRun,
}

/// What happened to one skill.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AdoptStatus {
    /// The skill's notes landed in the vault — or would have, under
    /// [`AdoptMode::DryRun`].
    Adopted,
    /// The note was already there and adoption refreshed it: the source moved
    /// on and the note had not been edited since it was written.
    Updated,
    /// The note was already there and nothing was written. Either both sides
    /// still match their recorded hashes, or only the note moved — and the
    /// note is the user's.
    Unchanged,
    /// Nothing of this skill was written and the others proceeded: the note is
    /// hand-authored, the two sides diverged, or the folder holds content
    /// adoption did not write.
    Refused,
}

/// One line of an [`AdoptReport`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdoptedSkill {
    /// The adopted name: the source frontmatter's `name` slugified, or the
    /// source directory's basename where the frontmatter is silent.
    pub name: String,
    /// The plugin it was grouped under — stamped as `ap-plugin`.
    pub plugin: String,
    /// Whether the source carried resources beside its `SKILL.md`.
    pub bundle: bool,
    /// The source directory this skill was read from.
    pub source_dir: PathBuf,
    /// Where the entry note landed (or would land):
    /// `<content-root>/plugins/<plugin>/skills/<name>/<name>.md`.
    pub entry_path: PathBuf,
    /// What the adoption did, or would do, with this skill.
    pub status: AdoptStatus,
    /// Why. Always set on [`AdoptStatus::Refused`]; also set on an
    /// [`AdoptStatus::Unchanged`] the note's own edits produced, and on an
    /// [`AdoptStatus::Updated`] that an acknowledged overwrite forced, so a
    /// discarded edit is stated rather than silent.
    pub reason: Option<String>,
}

/// Every skill the adoption considered, sorted by name. A refused skill is
/// still a line — a silent skip is how an import quietly loses half its
/// skills.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdoptReport {
    /// One entry per skill considered, sorted by name.
    pub skills: Vec<AdoptedSkill>,
}

/// Reads the source's SKILL.md bundles and writes them into the vault as
/// notes — or, under [`AdoptMode::DryRun`], reports what that would have done
/// and writes nothing.
///
/// `ns` is the vault's frontmatter namespace: the adopted keys are spelled with
/// it, so every reader in this crate types them as the vault's own.
///
/// # Errors
///
/// Everything below refuses or errors before a single byte is written:
///
/// * [`CoreError::RootNotFound`] — the source does not exist.
/// * `refused` (the rail's own prose) — the skills root is, is inside, or
///   contains the source.
/// * `refused: unknown-target` — [`AdoptRequest::targets`] names something
///   this build does not publish to.
/// * `refused: unsafe-path` — a symlink in the source.
/// * `refused: path-collision` — two source directories adopt onto one name.
/// * [`CoreError::SkillNotFound`] — a requested skill matched nothing.
/// * A content error naming the file for everything mis-shaped: no
///   `SKILL.md` anywhere under the source, a missing or wrong-shaped
///   `description`, an illegal name, an over-long description, a source key
///   inside the vault's namespace.
///
/// An adoption target that already exists is **not** an error: it is one of
/// [`AdoptStatus::Unchanged`], [`AdoptStatus::Updated`], or
/// [`AdoptStatus::Refused`] on that skill's report line, decided by the
/// three-way comparison in the module doc, and a refusal is lifted only by
/// naming that note in [`AdoptRequest::overwrite`].
pub fn adopt_skills(
    vfs: &dyn Vfs,
    request: &AdoptRequest,
    ns: &Namespace,
) -> Result<AdoptReport, CoreError> {
    match request.mode {
        AdoptMode::Write => adopt_onto(vfs, request, ns),
        // The overlay is the only difference between the two modes, and it is
        // constructed here so no caller can be previewing without having asked.
        AdoptMode::DryRun => adopt_onto(&PreviewVfs::over(vfs), request, ns),
    }
}

/// The adoption itself, blind to the mode: plan everything, then write.
fn adopt_onto(
    vfs: &dyn Vfs,
    request: &AdoptRequest,
    ns: &Namespace,
) -> Result<AdoptReport, CoreError> {
    let source = normalize(&request.source);
    if !vfs.exists(&source) {
        return Err(CoreError::RootNotFound(source));
    }

    if let Some(declared) = request.targets.as_deref() {
        let unknown: Vec<&str> = declared
            .iter()
            .map(String::as_str)
            .filter(|name| !KNOWN_TARGETS.contains(name))
            .collect();
        if !unknown.is_empty() {
            return Err(CoreError::refused(
                "unknown-target",
                format!(
                    "the request names {}, which this build does not know (known: {})",
                    quoted(&unknown),
                    KNOWN_TARGETS.join(", ")
                ),
            ));
        }
    }

    let plugin = request
        .plugin
        .clone()
        .unwrap_or_else(|| DEFAULT_ADOPTED_PLUGIN.to_owned());
    // The plugin becomes a directory name and an `ap-plugin` value discovery
    // re-validates, so a bad one fails here rather than as a broken vault.
    validate_name(&plugin, "plugin name", &source)?;

    let vault_root = normalize(&request.vault_root);
    let content_root = match &request.skills_root {
        Some(root) => normalize(root),
        None => vault_root.clone(),
    };
    // Discovery requires the content root inside the vault; writing outside it
    // would build a tree the round trip cannot see. Both rules: discovery
    // strips the vault root as spelled, and a content root linked out of the
    // vault is outside it on disk.
    if !content_root.starts_with(&vault_root) || !within(vfs, &vault_root, &content_root)? {
        return Err(CoreError::PathEscapesRoot(content_root));
    }
    // `plugins/` is spelled here rather than assumed of the root, which is the
    // whole difference between a tree the scan reads and one it walks past. A
    // root whose own basename happens to be `plugins` used to hide this: the
    // level was there by coincidence, so a root named anything else wrote a
    // plugin directory with no kind folder over it and the round trip broke
    // where nothing was watching.
    let plugins_root = content_root.join("plugins");

    // The rail's mirror, before anything else: adoption reads the source and
    // writes under `plugins/`, and the two must not overlap in either
    // direction. The rail resolves both sides, so a symlinked spelling of one
    // cannot slip past the comparison.
    assert_destination_allowed(vfs, &plugins_root, std::slice::from_ref(&source))?;

    let mut skill_dirs = collect_skill_dirs(vfs, &source)?;
    if skill_dirs.is_empty() {
        return Err(CoreError::malformed(
            &source,
            "no skill directories: nothing under this source has a SKILL.md",
        ));
    }
    if let Some(requested) = request.skills.as_deref() {
        skill_dirs = filter_requested(&source, skill_dirs, requested)?;
    }

    // `ap-format` is a property of the SOURCE, read once: one adoption reads
    // one installation, and asking per skill would let two skills out of one
    // tree disagree about the tree they came from.
    let format = match request.format.as_deref() {
        Some(named) => named.to_owned(),
        None => detect_format(vfs, &source),
    };
    // Every other place this machine holds the same content, hashed once for
    // the whole run rather than per skill.
    let elsewhere = index_other_roots(vfs, &request.also_scan)?;

    // Plan every skill before writing any: reads, rewrites, and refusals all
    // happen here, so an error over the last skill leaves the vault untouched.
    let mut plans = Vec::with_capacity(skill_dirs.len());
    for dir in &skill_dirs {
        plans.push(plan_one(
            vfs,
            dir,
            &plugin,
            request,
            &format,
            elsewhere.as_deref(),
            ns,
        )?);
    }
    plans.sort_by(|a, b| a.name.cmp(&b.name));

    // Two sources onto one name would make the second silently define the
    // skill — or, forced, destroy the first. Named and refused instead.
    for pair in plans.windows(2) {
        if pair[0].name == pair[1].name {
            return Err(CoreError::refused(
                "path-collision",
                format!(
                    "duplicate skill name `{}`: {} and {} both adopt onto one vault directory — \
                     nothing was adopted",
                    pair[0].name,
                    pair[0].source_dir.display(),
                    pair[1].source_dir.display(),
                ),
            ));
        }
    }

    // Every write path is vetted before the first byte, publish's discipline:
    // the joins are checked lexically and resolved on disk by the same guard.
    let plugin_note_path =
        resolve_write_path(vfs, &plugins_root, &format!("{plugin}/{plugin}.md"))?;
    let mut resolved: Vec<(PathBuf, Vec<PathBuf>)> = Vec::with_capacity(plans.len());
    for plan in &plans {
        let dest_dir = resolve_write_path(vfs, &plugins_root, &plan.dest_rel)?;
        let mut files = Vec::with_capacity(plan.files.len());
        for (rel, _, _) in &plan.files {
            files.push(resolve_write_path(
                vfs,
                &plugins_root,
                &format!("{}/{rel}", plan.dest_rel),
            )?);
        }
        resolved.push((dest_dir, files));
    }

    // The writes, only now. The plugin note is created once and never
    // rewritten: it is the author's note the moment it exists.
    if !vfs.exists(&plugin_note_path) {
        if let Some(parent) = plugin_note_path.parent() {
            vfs.create_dir_all(parent)?;
        }
        vfs.write_file(&plugin_note_path, plugin_note(&plugin, ns)?.as_bytes())?;
    }

    let mut report = Vec::with_capacity(plans.len());
    for (plan, (dest_dir, targets)) in plans.iter().zip(&resolved) {
        let entry_path = targets
            .last()
            .expect("every plan carries its entry")
            .clone();
        // Forced, wherever it applies, says what it discarded first: the whole
        // point of naming the note is that the decision is visible.
        let named = acknowledged(&request.overwrite, &entry_path, &vault_root, &content_root);
        let (status, reason) = match classify_existing(vfs, dest_dir, &entry_path, plan, ns)? {
            Existing::Fresh => (AdoptStatus::Adopted, None),
            Existing::Unchanged => (AdoptStatus::Unchanged, None),
            // A8: the source has nothing to give, so this is not a refusal —
            // but the edit is still stated, or the user learns nothing from a
            // run that looks like a no-op. Naming the note takes the source's
            // side anyway, which is the only way back to a tracked note.
            Existing::NoteEdited if named => (
                AdoptStatus::Updated,
                Some(format!(
                    "overwritten · edited: {} had been edited since it was adopted",
                    entry_path.display()
                )),
            ),
            Existing::NoteEdited => (
                AdoptStatus::Unchanged,
                Some(format!(
                    "edited: {} has been edited since it was adopted, and {} has nothing new \
                     to give it",
                    entry_path.display(),
                    plan.source_dir.display()
                )),
            ),
            Existing::SourceMoved => (AdoptStatus::Updated, None),
            Existing::Refused { token, detail } if named => (
                AdoptStatus::Updated,
                Some(format!("overwritten · {token}: {detail}")),
            ),
            Existing::Refused { token, detail } => {
                (AdoptStatus::Refused, Some(format!("{token}: {detail}")))
            }
        };

        if matches!(status, AdoptStatus::Refused | AdoptStatus::Unchanged) {
            report.push(AdoptedSkill {
                name: plan.name.clone(),
                plugin: plugin.clone(),
                bundle: plan.bundle,
                source_dir: plan.source_dir.clone(),
                entry_path,
                status,
                reason,
            });
            continue;
        }

        if vfs.exists(dest_dir) {
            // Replaced whole, so a resource the source no longer has does not
            // survive as a stale peer.
            vfs.remove(dest_dir)?;
        }
        for ((_, bytes, executable), target) in plan.files.iter().zip(targets) {
            if let Some(parent) = target.parent() {
                vfs.create_dir_all(parent)?;
            }
            vfs.write_file(target, bytes)?;
            if *executable {
                vfs.set_executable(target, true)?;
            }
        }
        report.push(AdoptedSkill {
            name: plan.name.clone(),
            plugin: plugin.clone(),
            bundle: plan.bundle,
            source_dir: plan.source_dir.clone(),
            entry_path,
            status,
            reason,
        });
    }

    Ok(AdoptReport { skills: report })
}

// --- Re-adopt ---------------------------------------------------------------

/// What the vault already holds where this skill would land.
enum Existing {
    /// Nothing there. The ordinary case.
    Fresh,
    /// Both hashes still match what was recorded.
    Unchanged,
    /// The note was edited since it was adopted; the source was not.
    NoteEdited,
    /// The source moved on; the note was not edited.
    SourceMoved,
    /// A closed-set refusal token and the prose that names both paths.
    Refused { token: &'static str, detail: String },
}

/// Places one re-adopt in the four-quadrant table, or refuses it.
///
/// The comparison reads the vault note itself rather than trusting a name:
/// `ap-source-hash` against the source as just read, and `ap-adopted-hash`
/// against the note and its peers as they stand now. Absent provenance is not
/// a match and not a miss — it is proof somebody else wrote the file.
fn classify_existing(
    vfs: &dyn Vfs,
    dest_dir: &Path,
    entry_path: &Path,
    plan: &SkillPlan,
    ns: &Namespace,
) -> Result<Existing, CoreError> {
    if !vfs.exists(dest_dir) {
        return Ok(Existing::Fresh);
    }
    if !vfs.exists(entry_path) {
        return Ok(Existing::Refused {
            token: "folder-occupied",
            detail: format!(
                "{} holds content this adoption did not write — there is no {} in it — so \
                 {} was not adopted over it",
                dest_dir.display(),
                entry_path.display(),
                plan.source_dir.display()
            ),
        });
    }

    let hand_authored = |detail: String| Existing::Refused {
        token: "hand-authored",
        detail,
    };
    let note = match read_vault_skill(vfs, entry_path, ns) {
        Ok(note) => note,
        // Unreadable as a note is unreadable as *our* note. Refusing here is
        // what stops an adoption from replacing a file it cannot account for.
        Err(e) => {
            return Ok(hand_authored(format!(
                "{} could not be read as an adopted note ({e}), so {} was not adopted \
                 over it",
                entry_path.display(),
                plan.source_dir.display()
            )));
        }
    };

    let provenance = &note.frontmatter.provenance;
    if provenance.is_hand_authored() {
        return Ok(hand_authored(format!(
            "{} carries no adoption provenance, so somebody wrote it by hand; {} was not \
             adopted over it",
            entry_path.display(),
            plan.source_dir.display()
        )));
    }

    let diverged = |detail: String| Existing::Refused {
        token: "diverged",
        detail,
    };
    // A13. The quadrant only ever speaks about the source that wrote the note:
    // both recorded hashes were taken against it. Comparing a *different*
    // source through it reads an untouched note as `updated` and replaces
    // somebody else's adoption. The recorded value is authoritative even where
    // a hand edit put it there (A5), so a wrong source refuses rather than
    // clobbers.
    let Some(recorded_source) = provenance.source.as_deref() else {
        return Ok(diverged(format!(
            "{} records no source, so it cannot be compared with {}",
            entry_path.display(),
            plan.source_dir.display()
        )));
    };
    if recorded_source != plan.source_label {
        return Ok(Existing::Refused {
            token: "foreign-provenance",
            detail: format!(
                "{} was adopted from {}, not from {}, so it was left alone",
                entry_path.display(),
                recorded_source,
                plan.source_label
            ),
        });
    }
    // A missing hash proves nothing, and an unreadable one proves less. Both
    // are stale rather than matching: treating either as a match is how an
    // edited note gets clobbered by a run that thought it was current. The
    // shape is checked as well as the presence, because a hand-mangled digest
    // is otherwise indistinguishable from a note somebody edited — and those
    // two have different outcomes.
    fn digest(recorded: Option<&str>) -> Option<&str> {
        recorded.filter(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
    }
    let (Some(recorded_source_hash), Some(recorded_adopted_hash)) = (
        digest(provenance.source_hash.as_deref()),
        digest(provenance.adopted_hash.as_deref()),
    ) else {
        return Ok(diverged(format!(
            "{} records no usable pair of hashes, so it cannot be compared with {}",
            entry_path.display(),
            plan.source_dir.display()
        )));
    };

    let raw = read_utf8(vfs, entry_path)?;
    let current = adopted_note_hash(
        &format!("{}.md", plan.name),
        &raw,
        &note.projection.resources,
        ns,
        entry_path,
    )?;

    Ok(
        match (
            recorded_source_hash != plan.source_hash,
            recorded_adopted_hash != current,
        ) {
            (false, false) => Existing::Unchanged,
            (true, false) => Existing::SourceMoved,
            (false, true) => Existing::NoteEdited,
            (true, true) => diverged(format!(
                "{} moved on and {} was edited since the last adopt; nothing here picks a \
                 winner",
                plan.source_dir.display(),
                entry_path.display()
            )),
        },
    )
}

/// Whether the caller named this note in [`AdoptRequest::overwrite`].
///
/// Three spellings of one path, because a user copies whichever one their
/// report printed: the absolute path, or that path relative to the vault root
/// or the content root. Not the skill name — a name is not a note, and two
/// plugins can hold one.
fn acknowledged(
    overwrite: &[String],
    entry_path: &Path,
    vault_root: &Path,
    content_root: &Path,
) -> bool {
    let mut spellings = vec![forward_slashed(entry_path)];
    for root in [vault_root, content_root] {
        if let Ok(relative) = entry_path.strip_prefix(root) {
            spellings.push(forward_slashed(relative));
        }
    }
    overwrite.iter().any(|named| {
        let named = forward_slashed(Path::new(named));
        spellings.iter().any(|spelling| spelling == &named)
    })
}

/// `ap-adopted-hash`: [`content_hash`] over the entry note with every key
/// under the namespace prefix removed, plus every peer file.
///
/// One function, called from both sides — the write that stamps the hash and
/// the re-adopt that checks it — so the two cannot disagree about what was
/// hashed. That is also why it takes the note's *text*: the write side hands
/// it the bytes it is about to compose and the read side hands it the bytes
/// off disk, and the strip makes the presence of the hash key itself
/// irrelevant to the result.
///
/// The entry's execute bit is not read on either side. It is a note, the
/// renderer never sets it, and reading it here would make `chmod +x` on a
/// vault note report as a content edit.
fn adopted_note_hash(
    entry_rel: &str,
    note_text: &str,
    peers: &[(String, Vec<u8>, bool)],
    ns: &Namespace,
    about: &Path,
) -> Result<String, CoreError> {
    use serde_yaml::{Mapping, Value as Yaml};

    let (frontmatter, body) = split_frontmatter(note_text);
    let fields = frontmatter_map(frontmatter, about)?;
    let mut map = Mapping::new();
    for (key, value) in &fields {
        if ns.is_ours(key) {
            continue;
        }
        let value = serde_yaml::to_value(value).map_err(|e| {
            CoreError::malformed(
                about,
                format!("`{key}` is not representable in frontmatter: {e}"),
            )
        })?;
        map.insert(Yaml::String(key.clone()), value);
    }
    let stripped = compose_note(&map, body, about)?;

    let mut files: Vec<ProjectedFile> = peers
        .iter()
        .map(|(relative, bytes, executable)| ProjectedFile {
            relative_path: relative.clone(),
            content: bytes.clone(),
            executable: *executable,
        })
        .collect();
    files.push(ProjectedFile {
        relative_path: entry_rel.to_owned(),
        content: stripped.into_bytes(),
        executable: false,
    });
    Ok(content_hash(&files))
}

// --- Planning ---------------------------------------------------------------

/// One skill, fully read and rewritten, not yet written.
struct SkillPlan {
    name: String,
    bundle: bool,
    source_dir: PathBuf,
    /// What `ap-source` records: [`AdoptRequest::source_label`] where the
    /// caller supplied one, and the source directory's path otherwise. The
    /// re-adopt comparison reads it, so it is held rather than re-derived.
    source_label: String,
    /// `ap-source-hash` as just computed — what a recorded one is compared to.
    source_hash: String,
    /// `<plugin>/<name>`, relative to the skills root.
    dest_rel: String,
    /// `(path relative to `dest_rel`, bytes, executable)`, resources first and
    /// the entry note last — the write order, and the order the resolved
    /// write paths mirror.
    files: Vec<(String, Vec<u8>, bool)>,
}

/// Reads one source skill directory into a [`SkillPlan`].
fn plan_one(
    vfs: &dyn Vfs,
    skill_dir: &Path,
    plugin: &str,
    request: &AdoptRequest,
    format: &str,
    elsewhere: Option<&[(String, PathBuf)]>,
    ns: &Namespace,
) -> Result<SkillPlan, CoreError> {
    let entry_source = skill_dir.join("SKILL.md");
    let raw = read_utf8(vfs, &entry_source)?;
    let raw = strip_generated_marker(&raw);
    let (frontmatter, body) = split_frontmatter(&raw);
    let mut fields = frontmatter_map(frontmatter, &entry_source)?;

    // A published SKILL.md never carries our namespace — the emit-time strip
    // guarantees it — so a source that does was not made by this pipeline,
    // and carrying its keys would let it dictate the vault's configuration.
    let claimed: Vec<&String> = fields.keys().filter(|key| ns.is_ours(key)).collect();
    if let Some(first) = claimed.first() {
        return Err(CoreError::malformed(
            &entry_source,
            format!(
                "`{first}` is inside the vault's namespace (`{}`), which adoption stamps \
                 itself; remove it from the source",
                ns.prefix()
            ),
        ));
    }

    let name = match take_trimmed(&mut fields, "name", &entry_source)? {
        Some(name) => name,
        None => skill_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_owned(),
    };
    let name = slugify(&name);
    if name.is_empty() {
        return Err(CoreError::malformed(
            &entry_source,
            "cannot determine a skill name: no frontmatter `name`, and the directory \
             name slugifies to nothing",
        ));
    }
    validate_name(&name, "skill name", &entry_source)?;

    let description =
        take_trimmed(&mut fields, "description", &entry_source)?.ok_or_else(|| {
            CoreError::malformed(
                &entry_source,
                "not a skill: frontmatter carries no `description`",
            )
        })?;
    let described = description.chars().count();
    if described > 1024 {
        return Err(CoreError::malformed(
            &entry_source,
            format!(
                "the description is {described} characters; the Agent Skills spec caps it at 1024"
            ),
        ));
    }

    // Everything under the directory, bytes and bits, exactly once: the
    // resource copies, the rewrite context, and the source hash all come from
    // this one read, so they cannot disagree about what the source held.
    let mut sources: Vec<(String, Vec<u8>, bool)> = Vec::new();
    for (relative, path) in walk_skill_files(vfs, skill_dir)? {
        let bytes = vfs.read_file(&path)?;
        let executable = vfs.is_executable(&path);
        sources.push((relative, bytes, executable));
    }
    let source_hash = content_hash(
        &sources
            .iter()
            .map(|(relative, bytes, executable)| ProjectedFile {
                relative_path: relative.clone(),
                content: bytes.clone(),
                executable: *executable,
            })
            .collect::<Vec<_>>(),
    );
    let resource_paths: Vec<String> = sources
        .iter()
        .map(|(relative, _, _)| relative.clone())
        .filter(|relative| relative != "SKILL.md")
        .collect();
    let bundle = !resource_paths.is_empty();

    // Resources first: markdown bodies rewritten with the frontmatter bytes
    // carried through the strict split, everything else verbatim.
    let mut files: Vec<(String, Vec<u8>, bool)> = Vec::with_capacity(sources.len());
    for (relative, bytes, executable) in sources {
        if relative == "SKILL.md" {
            continue;
        }
        let written = if extension_of_target(&relative).as_deref() == Some(".md") {
            let text = String::from_utf8(bytes).map_err(|e| {
                CoreError::malformed(
                    skill_dir.join(&relative),
                    format!("not UTF-8, so its links cannot be rewritten: {e}"),
                )
            })?;
            let split = frontmatter_lossless::split(&text);
            let rewritten = rewrite_to_wikilinks(split.body, &resource_paths);
            frontmatter_lossless::compose(split.yaml, &rewritten, split.shape).into_bytes()
        } else {
            bytes
        };
        files.push((relative, written, executable));
    }

    let source_label = match request.source_label.as_deref() {
        Some(label) => label.to_owned(),
        None => skill_dir.display().to_string(),
    };
    // `ap-also-at`: every other scanned root holding this exact content.
    // Compared by hash, not by name — two directories called `review` are not
    // the same skill, and one called `review` and one called `pr-review` may
    // be.
    let also_at = elsewhere.map(|index| {
        index
            .iter()
            .filter(|(hash, dir)| hash == &source_hash && dir != skill_dir)
            .map(|(_, dir)| dir.display().to_string())
            .collect::<Vec<_>>()
    });

    // The entry note, last: rebuilt frontmatter over the rewritten body. A
    // fresh composition, so it takes the default framing rather than the
    // source's.
    let entry_body = rewrite_to_wikilinks(body, &resource_paths);
    let entry_rel = format!("{name}.md");
    let render = |adopted_hash: Option<&str>| {
        render_entry_note(&EntryNote {
            name: &name,
            description: &description,
            carried: &fields,
            plugin,
            targets: request.targets.as_deref(),
            source_label: &source_label,
            format,
            source_hash: &source_hash,
            adopted_hash,
            adopted_at: &request.adopted_at,
            also_at: also_at.as_deref(),
            body: &entry_body,
            entry_source: &entry_source,
            ns,
        })
    };
    // Rendered twice, and the first render is thrown away. It is the cheapest
    // honest answer to a hash over a note that holds it: the hash is taken
    // over the note with our keys stripped, so a composition that has not
    // stamped the key yet hashes to exactly what the finished note will.
    let adopted_hash = adopted_note_hash(&entry_rel, &render(None)?, &files, ns, &entry_source)?;
    files.push((entry_rel, render(Some(&adopted_hash))?.into_bytes(), false));

    Ok(SkillPlan {
        // The kind folder is load-bearing, not decoration: it is what names
        // everything under it a skill without each note having to.
        dest_rel: format!("{plugin}/skills/{name}"),
        name,
        bundle,
        source_dir: skill_dir.to_path_buf(),
        source_label,
        source_hash,
        files,
    })
}

/// A modeled source field as adoption reads it: a non-empty trimmed string,
/// absent when the key is absent — and refused when it is present as any
/// other shape, because adoption *rebuilds* `name` and `description` and a
/// carry-the-wrong-shape fallback would write the rebuilt key beside the
/// original one.
fn take_trimmed(
    fields: &mut Map<String, Value>,
    key: &str,
    path: &Path,
) -> Result<Option<String>, CoreError> {
    match fields.remove(key) {
        None => Ok(None),
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            Ok((!trimmed.is_empty()).then(|| trimmed.to_owned()))
        }
        Some(other) => Err(CoreError::malformed(
            path,
            format!("`{key}` must be a string, not {}", json_type_name(&other)),
        )),
    }
}

/// Everything the entry note is rendered from — one struct so the renderer's
/// signature survives the next field.
struct EntryNote<'a> {
    name: &'a str,
    description: &'a str,
    carried: &'a Map<String, Value>,
    plugin: &'a str,
    targets: Option<&'a [String]>,
    /// `ap-source`: the source path, or what the caller called it.
    source_label: &'a str,
    /// `ap-format`: the harness layout the source was read in.
    format: &'a str,
    source_hash: &'a str,
    /// `None` for the throwaway render the hash itself is taken over.
    adopted_hash: Option<&'a str>,
    adopted_at: &'a str,
    /// `ap-also-at`, with the key's own three outcomes: `None` writes no key
    /// (nothing was cross-referenced), a list writes it, empty included.
    also_at: Option<&'a [String]>,
    body: &'a str,
    entry_source: &'a Path,
    ns: &'a Namespace,
}

/// The adopted entry note: Agent Skills spec fields first, carried foreign keys next, the
/// namespace's keys last, over the rewritten body.
fn render_entry_note(note: &EntryNote<'_>) -> Result<String, CoreError> {
    use serde_yaml::{Mapping, Value as Yaml};

    let string = |value: &str| Yaml::String(value.to_owned());
    let mut map = Mapping::new();
    map.insert(string("name"), string(note.name));
    map.insert(string("description"), string(note.description));
    for (key, value) in note.carried {
        let value = serde_yaml::to_value(value).map_err(|e| {
            CoreError::malformed(
                note.entry_source,
                format!("`{key}` is not representable in frontmatter: {e}"),
            )
        })?;
        map.insert(string(key), value);
    }
    map.insert(string(&note.ns.key("kind")), string("skill"));
    map.insert(string(&note.ns.key("plugin")), string(note.plugin));
    if let Some(targets) = note.targets {
        map.insert(
            string(&note.ns.key("targets")),
            Yaml::Sequence(targets.iter().map(|t| string(t)).collect()),
        );
    }
    map.insert(string(&note.ns.key("source")), string(note.source_label));
    map.insert(string(&note.ns.key("format")), string(note.format));
    map.insert(
        string(&note.ns.key("source-hash")),
        string(note.source_hash),
    );
    if let Some(adopted_hash) = note.adopted_hash {
        map.insert(string(&note.ns.key("adopted-hash")), string(adopted_hash));
    }
    map.insert(string(&note.ns.key("adopted-at")), string(note.adopted_at));
    if let Some(also_at) = note.also_at {
        map.insert(
            string(&note.ns.key("also-at")),
            Yaml::Sequence(also_at.iter().map(|path| string(path)).collect()),
        );
    }

    compose_note(&map, note.body, note.entry_source)
}

/// The plugin note adoption creates when the group has none: `ap-kind:
/// plugin`, a `name`, a placeholder `description`, an empty body — a stub the
/// author grows.
///
/// `description` + `ap-kind` is the publishable contract for every kind, not
/// for skills alone: a note carrying one and not the other is refused
/// half-declared. The scan returns plugins, so a stub with no description would
/// refuse the vault it was just written into.
fn plugin_note(plugin: &str, ns: &Namespace) -> Result<String, CoreError> {
    use serde_yaml::{Mapping, Value as Yaml};
    let mut map = Mapping::new();
    map.insert(
        Yaml::String("name".to_owned()),
        Yaml::String(plugin.to_owned()),
    );
    map.insert(
        Yaml::String("description".to_owned()),
        Yaml::String(format!("Skills adopted into the {plugin} plugin.")),
    );
    map.insert(
        Yaml::String(ns.key("kind")),
        // The enum's own spelling, not a copy of it: one vocabulary, and a
        // renamed variant cannot leave a stale literal behind here.
        Yaml::String(EntityKind::Plugin.as_str().to_owned()),
    );
    compose_note(&map, "", Path::new(plugin))
}

/// Serialises frontmatter and frames it as a fresh note. `serde_yaml` quotes
/// any string a reader would type as something else, which is what keeps an
/// all-digit hash a string on the way back in.
fn compose_note(map: &serde_yaml::Mapping, body: &str, about: &Path) -> Result<String, CoreError> {
    let yaml = serde_yaml::to_string(map).map_err(|e| {
        CoreError::malformed(about, format!("frontmatter failed to serialise: {e}"))
    })?;
    Ok(frontmatter_lossless::compose(
        Some(yaml.trim_end_matches('\n')),
        body,
        frontmatter_lossless::new_shape(frontmatter_lossless::NewShapeOptions::default()),
    ))
}

// --- Provenance the source itself answers -----------------------------------

/// The layout stamped as `ap-format`, when nobody said.
///
/// Two signals, in order, because they answer for different sources. A tree
/// under a runtime's own directory names that runtime: `~/.claude/skills/x`
/// is the `claude` layout wherever it was copied to. A tree with none — a
/// repository just cloned into a cache — is read for a plugin manifest
/// instead, since a published pack declares the harness it was built for.
///
/// [`STANDARD_FORMAT`] is the answer when neither fires, and it is an answer
/// rather than an absence: a bare directory of `SKILL.md` bundles IS the
/// standard published layout, which is the shape adoption documents as its
/// own source. Writing no key would say "unknown", which is a different and
/// less true thing.
pub fn detect_format(vfs: &dyn Vfs, source: &Path) -> String {
    if let Some(runtime) = crate::skill::runtime_for(source) {
        return runtime;
    }
    for (marker, format) in PLUGIN_MARKERS {
        if vfs.exists(&source.join(marker)) {
            return (*format).to_owned();
        }
    }
    STANDARD_FORMAT.to_owned()
}

/// `ap-format` for a source that declares no harness: the published layout
/// the Agent Skills spec itself describes, which is what adoption reads.
pub const STANDARD_FORMAT: &str = "standard";

/// Plugin manifest directories and the harness each one belongs to, from
/// the plugin-installed-skills research's marker table. A pack carries the manifest of
/// the harness it was built for, so the marker names the layout even where
/// the path does not.
const PLUGIN_MARKERS: &[(&str, &str)] = &[
    (".claude-plugin", "claude"),
    (".codex-plugin", "codex"),
    (".cursor-plugin", "cursor"),
];

/// Every skill directory under `roots`, paired with the hash of its contents
/// — the index `ap-also-at` is answered from.
///
/// `None` when the caller named no roots, which is the difference between a
/// cross-reference that found nothing and one that never ran. A root that is
/// not there is skipped rather than raising: these are other places on the
/// machine, offered as a courtesy, and an adoption must not fail because a
/// second checkout was moved.
fn index_other_roots(
    vfs: &dyn Vfs,
    roots: &[PathBuf],
) -> Result<Option<Vec<(String, PathBuf)>>, CoreError> {
    if roots.is_empty() {
        return Ok(None);
    }
    let mut index = Vec::new();
    for root in roots {
        let root = normalize(root);
        if !vfs.exists(&root) {
            continue;
        }
        // A root that cannot be walked — a symlink in it, an unreadable
        // directory — contributes nothing rather than refusing the adoption
        // it was only informing.
        let Ok(dirs) = collect_skill_dirs(vfs, &root) else {
            continue;
        };
        for dir in dirs {
            let Ok(files) = walk_skill_files(vfs, &dir) else {
                continue;
            };
            let mut projected = Vec::with_capacity(files.len());
            for (relative, path) in files {
                projected.push(ProjectedFile {
                    relative_path: relative,
                    content: vfs.read_file(&path)?,
                    executable: vfs.is_executable(&path),
                });
            }
            index.push((content_hash(&projected), dir));
        }
    }
    Ok(Some(index))
}

// --- Source collection ------------------------------------------------------

/// The three source shapes, in precedence order: the source itself when
/// it holds a `SKILL.md`, otherwise the subdirectories of its `skills/`
/// folder when it has one, otherwise its own subdirectories — keeping those
/// that hold a `SKILL.md`, in sorted order.
fn collect_skill_dirs(vfs: &dyn Vfs, source: &Path) -> Result<Vec<PathBuf>, CoreError> {
    if vfs.exists(&source.join("SKILL.md")) {
        return Ok(vec![source.to_path_buf()]);
    }
    let skills = source.join("skills");
    let base = if vfs.exists(&skills) {
        skills
    } else {
        source.to_path_buf()
    };
    let mut entries = vfs.read_dir(&base)?;
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    let mut dirs = Vec::new();
    for entry in entries {
        let path = base.join(&entry.name);
        // Refused rather than skipped, and before the is_dir gate — a
        // symlinked skill directory reports as not-a-directory and would
        // otherwise vanish from the import without a word.
        refuse_symlink(vfs, &path)?;
        if entry.is_dir && vfs.exists(&path.join("SKILL.md")) {
            dirs.push(path);
        }
    }
    Ok(dirs)
}

/// Narrows the collected directories to the requested skills. Every requested
/// name must match something — an import that quietly dropped a named skill
/// is the silence this crate refuses everywhere else.
fn filter_requested(
    source: &Path,
    dirs: Vec<PathBuf>,
    requested: &[String],
) -> Result<Vec<PathBuf>, CoreError> {
    if requested.is_empty() {
        return Ok(dirs);
    }
    let matches = |dir: &Path, want: &str| {
        dir.file_name().and_then(|n| n.to_str()) == Some(want)
            || dir
                .strip_prefix(source)
                .map(forward_slashed)
                .is_ok_and(|relative| relative == want)
    };
    let unmatched: Vec<&str> = requested
        .iter()
        .map(String::as_str)
        .filter(|want| !dirs.iter().any(|dir| matches(dir, want)))
        .collect();
    if !unmatched.is_empty() {
        return Err(CoreError::SkillNotFound(unmatched.join(", ")));
    }
    Ok(dirs
        .into_iter()
        .filter(|dir| requested.iter().any(|want| matches(dir, want)))
        .collect())
}

/// Every file under `root`, `(forward-slashed relative, absolute)`, in sorted
/// walk order — `.DS_Store` skipped, symlinks refused, exactly discovery's
/// rules on the tree adoption is about to copy file-by-file.
fn walk_skill_files(vfs: &dyn Vfs, root: &Path) -> Result<Vec<(String, PathBuf)>, CoreError> {
    fn recurse(
        vfs: &dyn Vfs,
        base: &Path,
        dir: &Path,
        out: &mut Vec<(String, PathBuf)>,
    ) -> Result<(), CoreError> {
        let mut entries = vfs.read_dir(dir)?;
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        for entry in entries {
            if entry.name == ".DS_Store" {
                continue;
            }
            let path = dir.join(&entry.name);
            refuse_symlink(vfs, &path)?;
            if entry.is_dir {
                recurse(vfs, base, &path, out)?;
            } else {
                let relative = path
                    .strip_prefix(base)
                    .map(forward_slashed)
                    .map_err(|_| CoreError::PathEscapesRoot(path.clone()))?;
                out.push((relative, path));
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    recurse(vfs, root, root, &mut out)?;
    Ok(out)
}

/// A symlink in an adoption source reads as inside the bundle and resolves
/// outside it; copied file-by-file it would silently flatten. Same refusal,
/// same token, as [`crate::discover`]'s walk — and the same honest floor: a
/// host whose [`Vfs`] cannot see links answers `false` and the refusal
/// cannot fire.
fn refuse_symlink(vfs: &dyn Vfs, path: &Path) -> Result<(), CoreError> {
    if vfs.is_symlink(path) {
        return Err(CoreError::refused(
            "unsafe-path",
            format!(
                "{}: a symlink in an adoption source — it reads as inside the bundle and \
                 resolves outside it; replace it with the real file or directory",
                path.display()
            ),
        ));
    }
    Ok(())
}

/// Drops the marketplace renderer's `<!-- Generated by … -->` line. Machine provenance belongs in the frontmatter
/// this module stamps, not in the body of a note an author will edit. First
/// occurrence only, the whole line including its ending.
fn strip_generated_marker(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut stripped = false;
    for line in raw.split_inclusive('\n') {
        let content = line.trim_end_matches(['\n', '\r']);
        if !stripped && is_generated_marker(content) {
            stripped = true;
            continue;
        }
        out.push_str(line);
    }
    out
}

/// `^<!--\s*Generated by .*?-->\s*$`, matched without a regex dependency.
fn is_generated_marker(line: &str) -> bool {
    line.strip_prefix("<!--")
        .map(str::trim_start)
        .and_then(|rest| rest.strip_prefix("Generated by "))
        .is_some_and(|rest| rest.contains("-->") && line.trim_end().ends_with("-->"))
}

// --- The rewrite ------------------------------------------------------------

/// Rewrites a published markdown body into Obsidian-native form — the inverse
/// of [`crate::compile`]'s link rewriting:
///
/// * Inline markdown links and images to local bundle files become
///   `[[wikilinks]]` addressed by note name (extension dropped for markdown,
///   kept for everything else), the label surviving as an alias when it says
///   something the target does not.
/// * An inline-code span naming one of `resources` — by exact skill-relative
///   path, or by a basename unique among them — becomes a wikilink. All other
///   code is content and is never touched; pass no resources and this pass
///   never fires.
///
/// External links (any scheme), absolute paths, pure `#anchor` links, and
/// targets that `..` out of the bundle pass through untouched, as does
/// everything inside fenced blocks and HTML comments. The fence and
/// code-span lexer is [`markdown_link::code`]'s under [`CodeRules::SkillExport`],
/// shared with [`crate::compile`] so the two directions cannot disagree about
/// where content ends and markup begins.
pub fn rewrite_to_wikilinks(markdown: &str, resources: &[String]) -> String {
    let bytes = markdown.as_bytes();
    let mut out = String::with_capacity(markdown.len());
    let mut offset = 0usize;
    let mut fences = Fences::new(CodeRules::SkillExport);
    let mut spans = Spans::new(CodeRules::SkillExport, bytes);

    while offset < bytes.len() {
        let line_start = offset == 0 || bytes[offset - 1] == b'\n';
        if line_start {
            let line_end = markdown[offset..]
                .find('\n')
                .map(|at| offset + at)
                .unwrap_or(markdown.len());
            let stop = if line_end < markdown.len() {
                line_end + 1
            } else {
                line_end
            };
            let line = &bytes[offset..line_end];
            if fences.line(line) != FenceLine::Outside {
                out.push_str(&markdown[offset..stop]);
                offset = stop;
                continue;
            }
            spans.line(line);
        }

        if markdown[offset..].starts_with("<!--") {
            let stop = match markdown[offset + 4..].find("-->") {
                Some(at) => offset + 4 + at + 3,
                None => markdown.len(),
            };
            out.push_str(&markdown[offset..stop]);
            offset = stop;
            continue;
        }

        if bytes[offset] == b'`' {
            let (run, close) = spans.close(offset);
            match close {
                None => {
                    out.push_str(&markdown[offset..offset + run]);
                    offset += run;
                }
                Some(close) => {
                    let inner = &markdown[offset + run..close];
                    match resolve_resource_mention(inner, resources) {
                        Some(target) => out.push_str(&format!("[[{target}]]")),
                        None => out.push_str(&markdown[offset..close + run]),
                    }
                    offset = close + run;
                }
            }
            continue;
        }

        if (bytes[offset] == b'['
            || (bytes[offset] == b'!' && bytes.get(offset + 1) == Some(&b'[')))
            && let Some((length, converted)) = convert_markdown_link(&markdown[offset..])
        {
            out.push_str(&converted);
            offset += length;
            continue;
        }

        let c = markdown[offset..]
            .chars()
            .next()
            .expect("offset always sits on a char boundary: every skip ends beside ASCII");
        out.push(c);
        offset += c.len_utf8();
    }

    out
}

/// Parses one inline markdown link or image at the start of `text`
/// (`^(!?)\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)`)
/// and converts it. `None` leaves the text for the character-wise copy, which
/// is also what keeps a link this pass declines (external, absolute,
/// escaping) exactly as written.
fn convert_markdown_link(text: &str) -> Option<(usize, String)> {
    let bytes = text.as_bytes();
    let (embed, after_bang) = if bytes[0] == b'!' {
        (true, 1)
    } else {
        (false, 0)
    };
    if bytes.get(after_bang) != Some(&b'[') {
        return None;
    }
    let label_start = after_bang + 1;
    let label_end = text[label_start..].find(']')? + label_start;
    let label = &text[label_start..label_end];

    let mut at = label_end + 1;
    if bytes.get(at) != Some(&b'(') {
        return None;
    }
    at += 1;
    while bytes.get(at).is_some_and(u8::is_ascii_whitespace) {
        at += 1;
    }
    let target_start = at;
    while bytes
        .get(at)
        .is_some_and(|b| !b.is_ascii_whitespace() && *b != b')')
    {
        at += 1;
    }
    if at == target_start {
        return None;
    }
    let target = &text[target_start..at];

    // The optional quoted title: at least one space, then `"…"`.
    let whitespace_end = {
        let mut cursor = at;
        while bytes.get(cursor).is_some_and(u8::is_ascii_whitespace) {
            cursor += 1;
        }
        cursor
    };
    if whitespace_end > at && bytes.get(whitespace_end) == Some(&b'"') {
        let title_close = text[whitespace_end + 1..].find('"')? + whitespace_end + 1;
        at = title_close + 1;
    } else {
        at = whitespace_end;
    }
    while bytes.get(at).is_some_and(u8::is_ascii_whitespace) {
        at += 1;
    }
    if bytes.get(at) != Some(&b')') {
        return None;
    }

    let converted = convert_link(embed, label, target)?;
    Some((at + 1, converted))
}

/// The inverse of [`crate::compile`]'s percent-encoding, over one path
/// segment or fragment.
///
/// A `%` that does not introduce two hex digits, and a decoded byte run that
/// is not UTF-8, both keep their raw spelling: a link whose text was never
/// encoded reads back unchanged rather than becoming a ghost.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%'
            && at + 2 < bytes.len()
            && bytes[at + 1].is_ascii_hexdigit()
            && bytes[at + 2].is_ascii_hexdigit()
            && let Ok(hex) = std::str::from_utf8(&bytes[at + 1..at + 3])
            && let Ok(byte) = u8::from_str_radix(hex, 16)
        {
            out.push(byte);
            at += 3;
            continue;
        }
        out.push(bytes[at]);
        at += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_owned())
}

/// Converts one markdown link's parts into a wikilink, or `None` to leave the
/// link as written.
///
/// The wikilink addresses the target by **note name** rather than path,
/// because Obsidian resolves by name (shortest path) and that is the spelling
/// [`crate::compile`]'s resolver turns back into a relative link at the next
/// publish. The alias survives only when it says something the target does
/// not.
fn convert_link(embed: bool, label: &str, target: &str) -> Option<String> {
    let (path_part, fragment) = match target.find('#') {
        None => (target, ""),
        Some(at) => (&target[..at], &target[at + 1..]),
    };
    if path_part.is_empty() {
        return None; // pure anchor
    }
    if has_scheme(path_part) {
        return None; // external: http, mailto, …
    }
    if path_part.starts_with('/') {
        return None; // absolute
    }
    if path_part.split('/').any(|segment| segment == "..") {
        return None; // escapes the bundle
    }

    // Percent-decoded, because `crate::compile` percent-encodes every segment
    // of the href it renders: undecoded, `meeting%20notes.md` would come back
    // as a wikilink to a note by that literal name, which no vault holds.
    // Decoded after the basename so an encoded `/` inside a filename stays
    // part of that filename rather than splitting it.
    let base = percent_decode(basename(path_part.strip_prefix("./").unwrap_or(path_part)));
    let extension = extension_of_target(&base).unwrap_or_default();
    let wiki_target = if extension == ".md" {
        &base[..base.len() - extension.len()]
    } else {
        &base[..]
    };
    let fragment = percent_decode(fragment);
    let alias = if !label.is_empty() && label != wiki_target {
        label
    } else {
        ""
    };

    let mut inner = wiki_target.to_owned();
    if !fragment.is_empty() {
        inner.push('#');
        inner.push_str(&fragment);
    }
    if !alias.is_empty() {
        inner.push('|');
        inner.push_str(alias);
    }
    Some(if embed {
        format!("![[{inner}]]")
    } else {
        format!("[[{inner}]]")
    })
}

/// `^[a-z][a-z0-9+.-]*:` case-insensitively — is this target a URL rather
/// than a path? (A Windows drive spelling like `C:\…` reads as a scheme too,
/// and it passes through untouched.)
fn has_scheme(path: &str) -> bool {
    let bytes = path.as_bytes();
    if !bytes.first().is_some_and(u8::is_ascii_alphabetic) {
        return false;
    }
    for byte in &bytes[1..] {
        match byte {
            b':' => return true,
            b if b.is_ascii_alphanumeric() || matches!(b, b'+' | b'.' | b'-') => {}
            _ => return false,
        }
    }
    false
}

/// Resolves an inline-code span's content to a bundled resource and returns
/// its wikilink target, or `None` to leave the span as code. Only something that looks like a lone filename
/// is ever considered, so `` `sbt test` `` and prose code stay code; a match
/// is by exact skill-relative path or by a basename unique among the
/// resources, case-insensitively.
fn resolve_resource_mention(content: &str, resources: &[String]) -> Option<String> {
    if resources.is_empty() {
        return None;
    }
    let trimmed = content.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return None;
    }
    let candidate = trimmed.replace('\\', "/");
    let candidate = candidate.strip_prefix("./").unwrap_or(&candidate);
    if !looks_like_filename(candidate) {
        return None;
    }
    let lower = candidate.to_lowercase();

    let mut resource_path = resources
        .iter()
        .find(|resource| resource.to_lowercase() == lower)
        .map(String::as_str);
    if resource_path.is_none() && !candidate.contains('/') {
        let matches: Vec<&str> = resources
            .iter()
            .map(String::as_str)
            .filter(|resource| basename(resource).to_lowercase() == lower)
            .collect();
        if let [only] = matches.as_slice() {
            resource_path = Some(only);
        }
    }

    let base = basename(resource_path?);
    let extension = extension_of_target(base).unwrap_or_default();
    Some(if extension == ".md" {
        base[..base.len() - extension.len()].to_owned()
    } else {
        base.to_owned()
    })
}

/// `\.[a-z0-9]+$` case-insensitively — does this end in something shaped like
/// a file extension? The gate that keeps ordinary inline code from ever being
/// looked up as a resource.
fn looks_like_filename(candidate: &str) -> bool {
    match candidate.rfind('.') {
        None => false,
        Some(at) => {
            let extension = &candidate[at + 1..];
            !extension.is_empty() && extension.bytes().all(|b| b.is_ascii_alphanumeric())
        }
    }
}

fn json_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "nothing",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "a list",
        Value::Object(_) => "a mapping",
    }
}

fn quoted(names: &[&str]) -> String {
    names
        .iter()
        .map(|name| format!("`{name}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile::{CompileSource, compile_note};
    use crate::discover::discover_components;
    use crate::frontmatter::EntityKind;
    use crate::vault::read_vault_skill;
    use crate::vfs::MemVfs;

    fn ap() -> Namespace {
        Namespace::default()
    }

    fn write(vfs: &dyn Vfs, path: &str, content: &str) {
        let path = Path::new(path);
        vfs.create_dir_all(path.parent().unwrap()).unwrap();
        vfs.write_file(path, content.as_bytes()).unwrap();
    }

    /// The adopt fixture: one bundle under `/src/skills/demo`.
    fn demo_source() -> MemVfs {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: A demo skill for adoption.\n---\n\n# Demo\n\nRead [the environments guide](references/environments.md) before running.\n",
        );
        write(
            &vfs,
            "/src/skills/demo/references/environments.md",
            "# Environments\n\nDetails here.\n",
        );
        vfs
    }

    /// A configured root is a *content* root, and adoption spells the kind
    /// folders under it.
    ///
    /// The default root hid this for as long as it existed: `<vault>/plugins`
    /// supplied the `plugins/` level by having that basename, so the tree
    /// adoption wrote happened to be one a scan could read. Name the root
    /// anything else and the level vanished — the notes landed one directory
    /// too high, and `build` walked straight past an import that reported
    /// itself adopted.
    #[test]
    fn a_configured_root_still_gets_the_kind_folders_written_under_it() {
        let vfs = demo_source();
        let rooted = AdoptRequest {
            skills_root: Some(PathBuf::from("/vault/library")),
            ..request()
        };

        adopt_skills(&vfs, &rooted, &ap()).unwrap();

        assert!(vfs.exists(Path::new(
            "/vault/library/plugins/demos/skills/demo/demo.md"
        )));
        assert!(vfs.exists(Path::new("/vault/library/plugins/demos/demos.md")));

        // And what landed is what a scan from that root reads back.
        let found = crate::discover::discover_components(
            &vfs,
            Path::new("/vault"),
            Some(Path::new("/vault/library")),
            &ap(),
        )
        .unwrap()
        .components;
        let skills: Vec<&crate::discover::DiscoveredComponent> = found
            .iter()
            .filter(|c| c.kind == crate::frontmatter::EntityKind::Skill)
            .collect();
        assert_eq!(skills.len(), 1, "{found:#?}");
        assert_eq!(skills[0].name, "demo");
        assert_eq!(skills[0].plugin.as_deref(), Some("demos"));
    }

    /// The test request: `/src` (a plugin-dir shape), plugin `demos`, both
    /// targets.
    fn request() -> AdoptRequest {
        AdoptRequest {
            source: PathBuf::from("/src"),
            vault_root: PathBuf::from("/vault"),
            skills_root: None,
            plugin: Some("demos".to_owned()),
            source_label: None,
            format: None,
            also_scan: Vec::new(),
            targets: Some(vec!["codex".to_owned(), "claude".to_owned()]),
            skills: None,
            overwrite: Vec::new(),
            mode: AdoptMode::Write,
            adopted_at: "2026-08-22T12:00:00Z".to_owned(),
        }
    }

    fn read(vfs: &dyn Vfs, path: &str) -> String {
        String::from_utf8(vfs.read_file(Path::new(path)).unwrap()).unwrap()
    }

    // --- the link conversion ------------------------------------------------

    #[test]
    fn intra_bundle_links_become_note_name_wikilinks_and_redundant_aliases_drop() {
        assert_eq!(
            convert_link(false, "Environments", "references/environments.md").as_deref(),
            Some("[[environments|Environments]]")
        );
        assert_eq!(
            convert_link(false, "environments", "references/environments.md").as_deref(),
            Some("[[environments]]"),
            "an alias that repeats the target is noise"
        );
        assert_eq!(
            convert_link(false, "H", "references/a.md#Heading").as_deref(),
            Some("[[a#Heading|H]]")
        );
        assert_eq!(
            convert_link(true, "diagram", "assets/d.png").as_deref(),
            Some("![[d.png|diagram]]"),
            "a non-markdown target keeps its extension"
        );
    }

    #[test]
    fn external_absolute_anchor_and_escaping_links_pass_through() {
        for target in [
            "https://example.com",
            "mailto:a@b.com",
            "#intro",
            "/etc/hosts",
            "../other/thing.md",
        ] {
            assert_eq!(convert_link(false, "label", target), None, "{target}");
        }
    }

    // --- the body rewrite ---------------------------------------------------

    #[test]
    fn prose_links_rewrite_but_code_spans_and_fences_do_not() {
        let input = "See [the steps](references/steps.md) and [site](https://x.com).\n\
                     Inline `[x](y.md)` stays.\n\n```md\n[fenced](z.md)\n```\n";
        let output = rewrite_to_wikilinks(input, &[]);
        assert!(output.contains("[[steps|the steps]]"), "{output}");
        assert!(output.contains("[site](https://x.com)"), "{output}");
        assert!(output.contains("`[x](y.md)`"), "{output}");
        assert!(output.contains("[fenced](z.md)"), "{output}");
    }

    fn mention_resources() -> Vec<String> {
        vec![
            "references/architecture.md".to_owned(),
            "references/grpc-endpoints.md".to_owned(),
            "scripts/tool.sh".to_owned(),
        ]
    }

    #[test]
    fn code_spans_naming_a_bundle_resource_become_wikilinks() {
        // By exact skill-relative path, and by a basename unique in the set.
        assert_eq!(
            rewrite_to_wikilinks(
                "Open `references/architecture.md` and `grpc-endpoints.md`.",
                &mention_resources()
            ),
            "Open [[architecture]] and [[grpc-endpoints]]."
        );
        // A non-markdown resource keeps its extension, as a wikilink must.
        assert_eq!(
            rewrite_to_wikilinks("Run `tool.sh`.", &mention_resources()),
            "Run [[tool.sh]]."
        );
    }

    #[test]
    fn non_resource_code_and_unknown_files_stay_code() {
        let output = rewrite_to_wikilinks(
            "Run `sbt test`, read `AGENTS.md`, keep `references/architecture.md`.",
            &mention_resources(),
        );
        assert!(output.contains("`sbt test`"), "{output}");
        assert!(output.contains("`AGENTS.md`"), "{output}");
        assert!(output.contains("[[architecture]]"), "{output}");
    }

    /// The inverse of `compile`'s percent-encoding: a published
    /// `[meeting notes](meeting%20notes.md)` re-adopts as a wikilink to the
    /// note's real name, not to its encoded href spelling.
    #[test]
    fn a_percent_encoded_href_decodes_back_to_the_note_name() {
        assert_eq!(
            rewrite_to_wikilinks(
                "See [meeting notes](meeting%20notes.md) for details.\n",
                &["meeting notes.md".to_owned()]
            ),
            "See [[meeting notes]] for details.\n"
        );
        // A fragment is encoded on the way out too, so it decodes on the way
        // back in.
        assert_eq!(
            rewrite_to_wikilinks("Jump to [x](notes.md#the%20end).\n", &[]),
            "Jump to [[notes#the end|x]].\n"
        );
        // A bare `%` that introduces no hex pair is text, not an escape.
        assert_eq!(
            rewrite_to_wikilinks("See [rate](100%zz.md).\n", &[]),
            "See [[100%zz|rate]].\n"
        );
    }

    #[test]
    fn without_resources_code_spans_are_never_touched() {
        assert_eq!(
            rewrite_to_wikilinks("Keep `references/architecture.md`.", &[]),
            "Keep `references/architecture.md`."
        );
    }

    // --- adoption ------------------------------------------------------------

    #[test]
    fn a_bundle_adopts_with_namespace_frontmatter_and_a_wikilinked_body() {
        let vfs = demo_source();
        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();

        assert_eq!(report.skills.len(), 1);
        let skill = &report.skills[0];
        assert_eq!(skill.name, "demo");
        assert_eq!(skill.plugin, "demos");
        assert!(skill.bundle);
        assert_eq!(skill.status, AdoptStatus::Adopted);
        assert_eq!(skill.source_dir, PathBuf::from("/src/skills/demo"));
        assert_eq!(
            skill.entry_path,
            PathBuf::from("/vault/plugins/demos/skills/demo/demo.md")
        );

        let entry = read(&vfs, "/vault/plugins/demos/skills/demo/demo.md");
        // The Agent Skills spec's bare fields.
        assert!(entry.contains("name: demo"), "{entry}");
        assert!(
            entry.contains("description: A demo skill for adoption."),
            "{entry}"
        );
        // Ours, at the namespace: the kind, the grouping, the narrowing.
        assert!(entry.contains("ap-kind: skill"), "{entry}");
        assert!(entry.contains("ap-plugin: demos"), "{entry}");
        assert!(entry.contains("ap-targets:"), "{entry}");
        assert!(entry.contains("- codex"), "{entry}");
        assert!(entry.contains("- claude"), "{entry}");
        // The provenance the adopt step records.
        assert!(entry.contains("ap-source: /src/skills/demo"), "{entry}");
        assert!(entry.contains("ap-source-hash:"), "{entry}");
        assert!(
            entry.contains("ap-adopted-at: 2026-08-22T12:00:00Z"),
            "{entry}"
        );
        // The rewrite: a relative link became a note-name wikilink.
        assert!(
            entry.contains("[[environments|the environments guide]]"),
            "{entry}"
        );

        // The resource landed as a peer, byte-identical (it carried no links).
        assert_eq!(
            read(
                &vfs,
                "/vault/plugins/demos/skills/demo/references/environments.md"
            ),
            "# Environments\n\nDetails here.\n"
        );
        // And the plugin note exists, kinded at the namespace.
        let pack = read(&vfs, "/vault/plugins/demos/demos.md");
        assert!(pack.contains("name: demos"), "{pack}");
        assert!(pack.contains("ap-kind: plugin"), "{pack}");
    }

    #[test]
    fn the_adopted_vault_discovers_and_recompiles_to_the_published_bytes() {
        // The round trip the whole phase exists for: published shape → vault →
        // published shape, byte-identical.
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();

        let found = discover_components(&vfs, Path::new("/vault"), None, &ap())
            .unwrap()
            .components;
        // The scan returns both notes adoption wrote — the skill and the plugin
        // stub — and the resource beside them is not a component. What keeps
        // the plugin out of a marketplace is `export`'s kind filter, not the
        // scan pretending it is not there.
        let kinds: Vec<(&str, EntityKind)> =
            found.iter().map(|c| (c.name.as_str(), c.kind)).collect();
        assert_eq!(
            kinds,
            vec![("demo", EntityKind::Skill), ("demos", EntityKind::Plugin)],
            "the resource note is not a component"
        );
        let skill = found
            .iter()
            .find(|c| c.kind == EntityKind::Skill)
            .expect("the adopted skill");
        assert_eq!(skill.name, "demo");
        assert_eq!(skill.description, "A demo skill for adoption.");
        assert_eq!(skill.plugin.as_deref(), Some("demos"));
        assert_eq!(
            skill.targets,
            Some(vec!["codex".to_owned(), "claude".to_owned()])
        );
        assert_eq!(
            skill.bundle_root.as_deref(),
            Some(Path::new("/vault/plugins/demos/skills/demo"))
        );

        // Compile the adopted note back out — the inverse rewrite undone.
        let note = read_vault_skill(&vfs, &skill.entry_path, &ap()).unwrap();
        let compiled = compile_note(
            &vfs,
            &CompileSource {
                vault_root: Path::new("/vault"),
                entry_path: &skill.entry_path,
                bundle_root: skill.bundle_root.as_deref(),
                skill_name: &skill.name,
                calls: None,
            },
            &note.projection.content.body,
        )
        .unwrap();

        // The body is the source SKILL.md's body again, byte for byte.
        assert_eq!(
            compiled.body,
            "\n# Demo\n\nRead [the environments guide](references/environments.md) before running.\n"
        );
        assert_eq!(
            compiled.resources,
            vec![(
                "references/environments.md".to_owned(),
                b"# Environments\n\nDetails here.\n".to_vec(),
                false
            )]
        );
    }

    #[test]
    fn the_stamped_provenance_reads_back_typed() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();

        let note = read_vault_skill(
            &vfs,
            Path::new("/vault/plugins/demos/skills/demo/demo.md"),
            &ap(),
        )
        .unwrap();
        let provenance = &note.frontmatter.provenance;
        assert_eq!(provenance.source.as_deref(), Some("/src/skills/demo"));
        assert_eq!(
            provenance.adopted_at.as_deref(),
            Some("2026-08-22T12:00:00Z")
        );
        let hash = provenance.source_hash.as_deref().unwrap();
        assert_eq!(hash.len(), 64, "a SHA-256 hex digest");
        assert!(hash.bytes().all(|b| b.is_ascii_hexdigit()), "{hash}");
        assert!(!provenance.is_hand_authored());
        let adopted = provenance.adopted_hash.as_deref().unwrap();
        assert_eq!(adopted.len(), 64, "a SHA-256 hex digest");
        assert!(adopted.bytes().all(|b| b.is_ascii_hexdigit()), "{adopted}");
        assert_ne!(adopted, hash, "two hashes over two file sets");
        // Written through the same serialiser as `ap-source-hash`, which
        // quotes exactly the values a reader would otherwise type as
        // something else — an all-digit digest among them.
        assert!(
            read(&vfs, "/vault/plugins/demos/skills/demo/demo.md")
                .contains(&format!("ap-adopted-hash: {adopted}")),
        );
        // `/src` declares no runtime directory and carries no plugin
        // manifest, so the layout it was read in is the published standard.
        assert_eq!(provenance.format.as_deref(), Some(STANDARD_FORMAT));
        // Nothing was cross-referenced, so the key is absent rather than
        // empty: "not scanned" and "scanned, found nowhere else" are
        // different facts.
        assert_eq!(provenance.also_at, None);

        assert_eq!(note.frontmatter.declared_kind, Some(EntityKind::Skill));
        assert_eq!(note.frontmatter.plugin.as_deref(), Some("demos"));
        assert!(note.frontmatter.unknown_ours.is_empty());
    }

    /// `ap-format`'s three sources, in the order [`detect_format`] asks.
    #[test]
    fn the_format_comes_from_the_request_then_the_path_then_the_manifest() {
        // Named by the caller wins over everything the tree could say.
        let vfs = demo_source();
        let named = AdoptRequest {
            format: Some("codex".to_owned()),
            ..request()
        };
        adopt_skills(&vfs, &named, &ap()).unwrap();
        assert!(
            read(&vfs, "/vault/plugins/demos/skills/demo/demo.md").contains("ap-format: codex")
        );

        // A runtime directory anywhere above the source names the runtime.
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/host/.claude/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: d\n---\nb\n",
        );
        let under_claude = AdoptRequest {
            source: PathBuf::from("/host/.claude/skills"),
            ..request()
        };
        adopt_skills(&vfs, &under_claude, &ap()).unwrap();
        assert!(
            read(&vfs, "/vault/plugins/demos/skills/demo/demo.md").contains("ap-format: claude")
        );

        // No runtime directory, but a plugin manifest declaring the harness
        // the pack was built for.
        let vfs = MemVfs::new();
        write(&vfs, "/pack/.codex-plugin/plugin.json", "{}\n");
        write(
            &vfs,
            "/pack/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: d\n---\nb\n",
        );
        let packed = AdoptRequest {
            source: PathBuf::from("/pack"),
            ..request()
        };
        adopt_skills(&vfs, &packed, &ap()).unwrap();
        assert!(
            read(&vfs, "/vault/plugins/demos/skills/demo/demo.md").contains("ap-format: codex")
        );
    }

    /// `ap-also-at` is content-addressed and has three outcomes, not two.
    #[test]
    fn also_at_names_every_other_root_holding_the_same_bytes() {
        let vfs = demo_source();
        // The same skill, byte for byte, under a second harness root.
        write(
            &vfs,
            "/other/demo/SKILL.md",
            "---\nname: demo\ndescription: A demo skill for adoption.\n---\n\n# Demo\n\nRead [the environments guide](references/environments.md) before running.\n",
        );
        write(
            &vfs,
            "/other/demo/references/environments.md",
            "# Environments\n\nDetails here.\n",
        );
        // A skill of the same NAME with different bytes, which must not count.
        write(
            &vfs,
            "/decoy/demo/SKILL.md",
            "---\nname: demo\ndescription: Something else entirely.\n---\nb\n",
        );

        let scanned = AdoptRequest {
            also_scan: vec![
                PathBuf::from("/other"),
                PathBuf::from("/decoy"),
                // A root that is not there is a shrug, not a refusal.
                PathBuf::from("/gone"),
            ],
            ..request()
        };
        adopt_skills(&vfs, &scanned, &ap()).unwrap();
        let note = read_vault_skill(
            &vfs,
            Path::new("/vault/plugins/demos/skills/demo/demo.md"),
            &ap(),
        )
        .unwrap();
        assert_eq!(
            note.frontmatter.provenance.also_at,
            Some(vec!["/other/demo".to_owned()])
        );
    }

    /// Scanned and found nowhere else writes `[]`, which is not the same
    /// answer as the absent key a run that scanned nothing writes.
    #[test]
    fn a_cross_reference_that_found_nothing_still_writes_the_key() {
        let vfs = demo_source();
        let scanned = AdoptRequest {
            also_scan: vec![PathBuf::from("/gone")],
            ..request()
        };
        adopt_skills(&vfs, &scanned, &ap()).unwrap();
        let note = read_vault_skill(
            &vfs,
            Path::new("/vault/plugins/demos/skills/demo/demo.md"),
            &ap(),
        )
        .unwrap();
        assert_eq!(note.frontmatter.provenance.also_at, Some(Vec::new()));
    }

    /// A source label stands in for the path everywhere the path would be
    /// recorded — including the re-adopt comparison, which is the half that
    /// makes a cached checkout usable at all.
    #[test]
    fn a_labelled_source_stamps_the_label_and_re_adopts_against_it() {
        let vfs = demo_source();
        let labelled = || AdoptRequest {
            source_label: Some("https://github.com/acme/agent-kit@4f1c9ab".to_owned()),
            ..request()
        };
        adopt_skills(&vfs, &labelled(), &ap()).unwrap();
        let note = read_vault_skill(
            &vfs,
            Path::new("/vault/plugins/demos/skills/demo/demo.md"),
            &ap(),
        )
        .unwrap();
        assert_eq!(
            note.frontmatter.provenance.source.as_deref(),
            Some("https://github.com/acme/agent-kit@4f1c9ab")
        );

        // Re-adopted from a DIFFERENT cache directory under the same label:
        // the checkout moved, the source did not, and the note is untouched
        // rather than read as somebody else's adoption.
        for path in [
            "/src/skills/demo/SKILL.md",
            "/src/skills/demo/references/environments.md",
        ] {
            let content = read(&vfs, path);
            write(&vfs, &path.replace("/src/", "/cache-two/"), &content);
        }
        let again = AdoptRequest {
            source: PathBuf::from("/cache-two/skills"),
            ..labelled()
        };
        let report = adopt_skills(&vfs, &again, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Unchanged);
        assert_eq!(report.skills[0].reason, None);

        // Without the label, the same run reads the note as somebody else's:
        // the path it would record is not the one the note carries.
        let unlabelled = AdoptRequest {
            source: PathBuf::from("/cache-two/skills"),
            ..request()
        };
        let report = adopt_skills(&vfs, &unlabelled, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Refused);
        assert!(
            report.skills[0]
                .reason
                .as_deref()
                .is_some_and(|r| r.starts_with("foreign-provenance:")),
            "{:?}",
            report.skills[0].reason
        );
    }

    #[test]
    fn adopt_never_writes_into_the_source_it_reads() {
        // The rail's mirror, pinned. Destination inside the source:
        let vfs = demo_source();
        let mut inside = request();
        inside.vault_root = PathBuf::from("/src/vault");
        let err = adopt_skills(&vfs, &inside, &ap()).unwrap_err();
        assert!(matches!(err, CoreError::Refused(_)), "{err}");
        assert!(err.to_string().contains("/src"), "{err}");
        assert!(!vfs.exists(Path::new("/src/vault")), "nothing was written");

        // Destination containing the source:
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/plugins/incoming/SKILL.md",
            "---\nname: incoming\ndescription: d\n---\nb\n",
        );
        let mut containing = request();
        containing.source = PathBuf::from("/vault/plugins/incoming");
        let err = adopt_skills(&vfs, &containing, &ap()).unwrap_err();
        assert!(matches!(err, CoreError::Refused(_)), "{err}");
        assert!(!vfs.exists(Path::new("/vault/plugins/demos")));

        // Destination equal to the source:
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/plugins/SKILL.md",
            "---\nname: x\ndescription: d\n---\nb\n",
        );
        let mut equal = request();
        equal.source = PathBuf::from("/vault/plugins");
        let err = adopt_skills(&vfs, &equal, &ap()).unwrap_err();
        assert!(matches!(err, CoreError::Refused(_)), "{err}");
    }

    const ENTRY: &str = "/vault/plugins/demos/skills/demo/demo.md";

    /// The source's `SKILL.md`, with `extra` appended to its body — a source
    /// that moved on since the last adopt.
    fn move_the_source(vfs: &MemVfs, extra: &str) {
        let path = Path::new("/src/skills/demo/SKILL.md");
        let mut bytes = vfs.read_file(path).unwrap();
        bytes.extend_from_slice(extra.as_bytes());
        vfs.write_file(path, &bytes).unwrap();
    }

    /// Appends to the vault note's body — the user's edit in Obsidian.
    fn edit_the_note(vfs: &MemVfs) {
        let note = read(vfs, ENTRY);
        vfs.write_file(
            Path::new(ENTRY),
            format!("{note}\nedited in Obsidian\n").as_bytes(),
        )
        .unwrap();
    }

    #[test]
    fn a_re_adopt_of_an_untouched_note_is_unchanged_and_writes_nothing() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        let before = read(&vfs, ENTRY);

        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Unchanged);
        assert_eq!(report.skills[0].reason, None);
        assert_eq!(read(&vfs, ENTRY), before, "not one byte was rewritten");
    }

    #[test]
    fn a_key_under_the_prefix_is_outside_the_adopted_hash_and_a_body_edit_is_inside_it() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();

        // Adding, removing, and hand-editing our own keys: still `unchanged`.
        let note = read(&vfs, ENTRY);
        let rewritten = note
            .replace(
                "ap-plugin: demos",
                "ap-plugin: something-else\nap-invented: 1",
            )
            .replace("ap-adopted-at: ", "ap-adopted-at-was: x\nap-adopted-at: ");
        vfs.write_file(Path::new(ENTRY), rewritten.as_bytes())
            .unwrap();
        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Unchanged);
        assert_eq!(report.skills[0].reason, None, "our keys are not the note");

        // One byte of the body is inside it.
        edit_the_note(&vfs);
        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Unchanged);
        let reason = report.skills[0].reason.as_deref().unwrap();
        assert!(reason.starts_with("edited: "), "{reason}");

        // And so is one byte of a peer.
        let peer = "/vault/plugins/demos/skills/demo/references/environments.md";
        write(&vfs, peer, "# Environments\n\nDetails there.\n");
        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert!(
            report.skills[0]
                .reason
                .as_deref()
                .unwrap()
                .starts_with("edited: "),
            "a peer edit is an edit to the note"
        );
    }

    #[test]
    fn only_the_source_moving_updates_the_note() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        move_the_source(&vfs, "\nA new paragraph.\n");

        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Updated);
        assert_eq!(report.skills[0].reason, None);
        assert!(read(&vfs, ENTRY).contains("A new paragraph."));

        // And the rewrite re-stamps a hash the next run agrees with.
        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Unchanged);
    }

    #[test]
    fn only_the_note_moving_leaves_it_alone() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        edit_the_note(&vfs);
        let edited = read(&vfs, ENTRY);

        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Unchanged);
        assert_eq!(read(&vfs, ENTRY), edited, "the note is the user's");
    }

    #[test]
    fn naming_an_edited_note_replaces_it_and_says_it_was_edited() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        edit_the_note(&vfs);

        let mut forced = request();
        forced.overwrite = vec![ENTRY.to_owned()];
        let report = adopt_skills(&vfs, &forced, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Updated);
        let reason = report.skills[0].reason.as_deref().unwrap();
        assert!(
            reason.starts_with("overwritten \u{b7} edited: "),
            "{reason}"
        );
        assert!(reason.contains(ENTRY), "{reason}");
        assert!(!read(&vfs, ENTRY).contains("edited in Obsidian"));
    }

    #[test]
    fn both_moving_is_refused_diverged_and_the_note_is_untouched() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        move_the_source(&vfs, "\nA new paragraph.\n");
        edit_the_note(&vfs);
        let edited = read(&vfs, ENTRY);

        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Refused);
        let reason = report.skills[0].reason.as_deref().unwrap();
        assert!(reason.starts_with("diverged: "), "{reason}");
        assert!(
            reason.contains("/src/skills/demo"),
            "the source path: {reason}"
        );
        assert!(reason.contains(ENTRY), "the vault note: {reason}");
        assert_eq!(read(&vfs, ENTRY), edited, "not one byte moved");
    }

    #[test]
    fn overwrite_names_one_note_and_says_what_it_discarded() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        move_the_source(&vfs, "\nA new paragraph.\n");
        edit_the_note(&vfs);
        // A peer the source no longer has does not survive the replacement.
        write(
            &vfs,
            "/vault/plugins/demos/skills/demo/stale.md",
            "left behind\n",
        );

        // A different note's path does not lift this one's refusal.
        let mut wrong = request();
        wrong.overwrite = vec!["/vault/plugins/demos/skills/other/other.md".to_owned()];
        assert_eq!(
            adopt_skills(&vfs, &wrong, &ap()).unwrap().skills[0].status,
            AdoptStatus::Refused
        );

        let mut forced = request();
        forced.overwrite = vec![ENTRY.to_owned()];
        let report = adopt_skills(&vfs, &forced, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Updated);
        let reason = report.skills[0].reason.as_deref().unwrap();
        assert!(reason.starts_with("overwritten · diverged: "), "{reason}");
        assert!(reason.contains(ENTRY), "{reason}");
        assert!(read(&vfs, ENTRY).contains("A new paragraph."));
        assert!(!read(&vfs, ENTRY).contains("edited in Obsidian"));
        assert!(!vfs.exists(Path::new("/vault/plugins/demos/skills/demo/stale.md")));
    }

    #[test]
    fn the_vault_relative_spelling_of_the_note_also_acknowledges_it() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        move_the_source(&vfs, "\nA new paragraph.\n");
        edit_the_note(&vfs);

        let mut forced = request();
        forced.overwrite = vec!["plugins/demos/skills/demo/demo.md".to_owned()];
        let report = adopt_skills(&vfs, &forced, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Updated);
    }

    #[test]
    fn a_note_with_no_provenance_is_refused_hand_authored() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        let hand = "---\nname: demo\ndescription: mine\n---\n\nI wrote this.\n";
        vfs.write_file(Path::new(ENTRY), hand.as_bytes()).unwrap();

        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Refused);
        let reason = report.skills[0].reason.as_deref().unwrap();
        assert!(reason.starts_with("hand-authored: "), "{reason}");
        assert!(reason.contains(ENTRY), "{reason}");
        assert_eq!(read(&vfs, ENTRY), hand, "never overwritten unacknowledged");

        // Named, it is replaced — and the replacement says what it was.
        let mut forced = request();
        forced.overwrite = vec![ENTRY.to_owned()];
        let report = adopt_skills(&vfs, &forced, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Updated);
        assert!(
            report.skills[0]
                .reason
                .as_deref()
                .unwrap()
                .starts_with("overwritten · hand-authored: ")
        );
        assert!(read(&vfs, ENTRY).contains("ap-adopted-hash:"));
    }

    #[test]
    fn absent_or_unparseable_hashes_are_diverged_rather_than_matching() {
        for broken in ["", "ap-adopted-hash: not-a-digest\n"] {
            let vfs = demo_source();
            adopt_skills(&vfs, &request(), &ap()).unwrap();
            let note = read(&vfs, ENTRY);
            // Drop the recorded pair, then optionally put back a wrong one.
            let stripped: String = note
                .lines()
                .filter(|line| !line.starts_with("ap-adopted-hash:"))
                .map(|line| format!("{line}\n"))
                .collect();
            let stripped =
                stripped.replacen("ap-source-hash:", &format!("{broken}ap-source-hash:"), 1);
            vfs.write_file(Path::new(ENTRY), stripped.as_bytes())
                .unwrap();

            let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
            assert_eq!(report.skills[0].status, AdoptStatus::Refused, "{broken:?}");
            let reason = report.skills[0].reason.as_deref().unwrap();
            assert!(reason.starts_with("diverged: "), "{reason}");
        }
    }

    #[test]
    fn a_note_adopted_from_another_source_is_refused_foreign_provenance() {
        let vfs = demo_source();
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        let before = read(&vfs, ENTRY);

        // A second source, same skill name. Its hashes say nothing about the
        // note the first one wrote, so the quadrant must not be consulted.
        write(
            &vfs,
            "/other/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: A different demo.\n---\n\nElsewhere.\n",
        );
        let mut elsewhere = request();
        elsewhere.source = PathBuf::from("/other");

        let report = adopt_skills(&vfs, &elsewhere, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Refused);
        let reason = report.skills[0].reason.as_deref().unwrap();
        assert!(reason.starts_with("foreign-provenance: "), "{reason}");
        assert!(reason.contains("/src/skills/demo"), "{reason}");
        assert!(reason.contains("/other/skills/demo"), "{reason}");
        assert_eq!(read(&vfs, ENTRY), before, "not one byte moved");

        // Named, it is replaced — and the line says what it discarded.
        elsewhere.overwrite = vec![ENTRY.to_owned()];
        let report = adopt_skills(&vfs, &elsewhere, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Updated);
        assert!(
            report.skills[0]
                .reason
                .as_deref()
                .unwrap()
                .starts_with("overwritten \u{b7} foreign-provenance: ")
        );
        assert!(read(&vfs, ENTRY).contains("Elsewhere."));
    }

    #[test]
    fn a_folder_holding_content_adoption_did_not_write_is_refused() {
        let vfs = demo_source();
        write(&vfs, "/vault/plugins/demos/skills/demo/notes.md", "mine\n");

        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Refused);
        let reason = report.skills[0].reason.as_deref().unwrap();
        assert!(reason.starts_with("folder-occupied: "), "{reason}");
        assert_eq!(
            read(&vfs, "/vault/plugins/demos/skills/demo/notes.md"),
            "mine\n"
        );
    }

    #[test]
    fn a_dry_run_reports_the_plan_and_writes_nothing() {
        let vfs = demo_source();
        let mut preview = request();
        preview.mode = AdoptMode::DryRun;

        let report = adopt_skills(&vfs, &preview, &ap()).unwrap();
        assert_eq!(report.skills.len(), 1);
        assert_eq!(report.skills[0].status, AdoptStatus::Adopted);
        assert_eq!(
            report.skills[0].entry_path,
            PathBuf::from("/vault/plugins/demos/skills/demo/demo.md")
        );
        assert!(!vfs.exists(Path::new("/vault")), "not one byte landed");

        // And it classifies against the real tree: after a real adopt, the
        // same dry run reports the refusal a real re-run would.
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        let report = adopt_skills(&vfs, &preview, &ap()).unwrap();
        assert_eq!(report.skills[0].status, AdoptStatus::Unchanged);
    }

    #[test]
    fn the_three_source_shapes_collect_the_same_skill() {
        // A skill dir, a plugin dir with `skills/`, and a dir of skill dirs.
        for source in ["/src/skills/demo", "/src", "/src/skills"] {
            let vfs = demo_source();
            let mut shaped = request();
            shaped.source = PathBuf::from(source);
            let report = adopt_skills(&vfs, &shaped, &ap()).unwrap();
            assert_eq!(report.skills.len(), 1, "{source}");
            assert_eq!(report.skills[0].name, "demo", "{source}");
            assert!(
                vfs.exists(Path::new("/vault/plugins/demos/skills/demo/demo.md")),
                "{source}"
            );
        }
    }

    #[test]
    fn requested_skills_narrow_the_import_and_a_miss_is_refused_by_name() {
        let vfs = demo_source();
        write(
            &vfs,
            "/src/skills/other/SKILL.md",
            "---\nname: other\ndescription: d\n---\nb\n",
        );

        // By directory basename…
        let mut narrowed = request();
        narrowed.skills = Some(vec!["demo".to_owned()]);
        let report = adopt_skills(&vfs, &narrowed, &ap()).unwrap();
        assert_eq!(report.skills.len(), 1);
        assert!(!vfs.exists(Path::new("/vault/plugins/demos/other")));

        // …and by source-relative path.
        let vfs = demo_source();
        write(
            &vfs,
            "/src/skills/other/SKILL.md",
            "---\nname: other\ndescription: d\n---\nb\n",
        );
        let mut by_path = request();
        by_path.skills = Some(vec!["skills/other".to_owned()]);
        let report = adopt_skills(&vfs, &by_path, &ap()).unwrap();
        assert_eq!(report.skills[0].name, "other");

        // A name that matches nothing is refused, never silently dropped.
        let mut missing = request();
        missing.skills = Some(vec!["demo".to_owned(), "absent".to_owned()]);
        let err = adopt_skills(&vfs, &missing, &ap()).unwrap_err();
        assert!(matches!(err, CoreError::SkillNotFound(_)), "{err}");
        assert!(err.to_string().contains("absent"), "{err}");
    }

    #[test]
    fn the_name_falls_back_to_the_directory_and_slugifies() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/Workflow Checklist/SKILL.md",
            "---\ndescription: d\n---\nb\n",
        );
        let report = adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(report.skills[0].name, "workflow-checklist");
        assert!(vfs.exists(Path::new(
            "/vault/plugins/demos/skills/workflow-checklist/workflow-checklist.md"
        )));
    }

    #[test]
    fn half_declared_or_overlong_sources_are_refused_naming_the_file() {
        // No description.
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/mute/SKILL.md",
            "---\nname: mute\n---\nb\n",
        );
        let err = adopt_skills(&vfs, &request(), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("/src/skills/mute/SKILL.md"), "{err}");
        assert!(err.contains("description"), "{err}");
        assert!(!vfs.exists(Path::new("/vault")), "refused before any write");

        // A wrong-shaped name is refused, not read as absent: adoption
        // rebuilds this key, and a fallback would write the rebuilt one
        // beside the author's.
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/odd/SKILL.md",
            "---\nname:\n  - a\ndescription: d\n---\nb\n",
        );
        let err = adopt_skills(&vfs, &request(), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("`name` must be a string"), "{err}");

        // The description cap discovery would refuse one scan later.
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/talk/SKILL.md",
            &format!(
                "---\nname: talk\ndescription: {}\n---\nb\n",
                "d".repeat(1025)
            ),
        );
        let err = adopt_skills(&vfs, &request(), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("1024"), "{err}");

        // A name the Agent Skills spec refuses, even after the slug — one over
        // the 64-character cap `validate_name` admits.
        let vfs = MemVfs::new();
        let long = "a".repeat(65);
        write(
            &vfs,
            "/src/skills/x/SKILL.md",
            &format!("---\nname: {long}\ndescription: d\n---\nb\n"),
        );
        let err = adopt_skills(&vfs, &request(), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("Agent Skills spec"), "{err}");
    }

    #[test]
    fn foreign_frontmatter_keys_are_carried_not_dropped() {
        // Foreign keys are not rebuilt away: the
        // adopted note re-publishes with the source's own keys intact.
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: d\nlicense: MIT\nowner: kelly\nallowed-tools:\n  - Read\n---\nb\n",
        );
        adopt_skills(&vfs, &request(), &ap()).unwrap();

        let note = read_vault_skill(
            &vfs,
            Path::new("/vault/plugins/demos/skills/demo/demo.md"),
            &ap(),
        )
        .unwrap();
        assert_eq!(note.projection.content.allowed_tools, vec!["Read"]);
        // A spec key the reader models comes back on its own field, and one
        // it does not comes back in `annotations`. Both survived adoption,
        // which is the property.
        assert_eq!(note.projection.content.license.as_deref(), Some("MIT"));
        assert_eq!(
            note.projection.content.annotations["owner"],
            serde_json::json!("kelly")
        );
    }

    #[test]
    fn a_source_key_inside_the_namespace_is_refused() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: d\nap-kind: plugin\n---\nb\n",
        );
        let err = adopt_skills(&vfs, &request(), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("ap-kind"), "{err}");
        assert!(err.contains("namespace"), "{err}");
        assert!(!vfs.exists(Path::new("/vault")));
    }

    #[test]
    fn a_configured_namespace_stamps_its_own_keys_and_carries_the_default_one() {
        let x = Namespace::new("x").unwrap();
        let vfs = MemVfs::new();
        // `ap-kind` is somebody else's key in this vault — carried, not ours.
        write(
            &vfs,
            "/src/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: d\nap-kind: keep-me\n---\nb\n",
        );
        adopt_skills(&vfs, &request(), &x).unwrap();

        let entry = read(&vfs, "/vault/plugins/demos/skills/demo/demo.md");
        assert!(entry.contains("x-kind: skill"), "{entry}");
        assert!(entry.contains("x-plugin: demos"), "{entry}");
        assert!(entry.contains("x-source: /src/skills/demo"), "{entry}");
        assert!(entry.contains("ap-kind: keep-me"), "{entry}");

        let note = read_vault_skill(
            &vfs,
            Path::new("/vault/plugins/demos/skills/demo/demo.md"),
            &x,
        )
        .unwrap();
        assert_eq!(note.frontmatter.declared_kind, Some(EntityKind::Skill));
        assert_eq!(
            note.frontmatter.provenance.source.as_deref(),
            Some("/src/skills/demo")
        );
        assert_eq!(
            note.projection.content.annotations["ap-kind"],
            serde_json::json!("keep-me")
        );

        // And under `x`, a source `x-` key is the refusal `ap-` was above.
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: d\nx-kind: skill\n---\nb\n",
        );
        let err = adopt_skills(&vfs, &request(), &x).unwrap_err().to_string();
        assert!(err.contains("x-kind"), "{err}");
    }

    #[test]
    fn targets_validate_against_the_known_set_and_absent_stays_absent() {
        let vfs = demo_source();
        let mut unknown = request();
        unknown.targets = Some(vec!["codex".to_owned(), "emacs".to_owned()]);
        let err = adopt_skills(&vfs, &unknown, &ap()).unwrap_err().to_string();
        assert!(err.contains("unknown-target"), "{err}");
        assert!(err.contains("emacs"), "{err}");
        assert!(!vfs.exists(Path::new("/vault")));

        // No targets: no key at all — every destination, the ordinary vault.
        let mut open = request();
        open.targets = None;
        adopt_skills(&vfs, &open, &ap()).unwrap();
        let entry = read(&vfs, "/vault/plugins/demos/skills/demo/demo.md");
        assert!(!entry.contains("ap-targets"), "{entry}");
        let found = discover_components(&vfs, Path::new("/vault"), None, &ap())
            .unwrap()
            .components;
        assert_eq!(found[0].targets, None);
    }

    #[test]
    fn two_sources_onto_one_name_are_refused_naming_both() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/one/SKILL.md",
            "---\nname: demo\ndescription: d\n---\nb\n",
        );
        write(
            &vfs,
            "/src/skills/two/SKILL.md",
            "---\nname: demo\ndescription: d\n---\nb\n",
        );
        let err = adopt_skills(&vfs, &request(), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("path-collision"), "{err}");
        assert!(err.contains("/src/skills/one"), "{err}");
        assert!(err.contains("/src/skills/two"), "{err}");
        assert!(!vfs.exists(Path::new("/vault")), "nothing was adopted");
    }

    #[test]
    fn the_plugin_note_is_created_once_and_never_rewritten() {
        let vfs = demo_source();
        write(
            &vfs,
            "/vault/plugins/demos/demos.md",
            "---\nname: demos\nap-kind: plugin\n---\nThe author's own prose.\n",
        );
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        assert_eq!(
            read(&vfs, "/vault/plugins/demos/demos.md"),
            "---\nname: demos\nap-kind: plugin\n---\nThe author's own prose.\n",
            "an existing plugin note is the author's"
        );
    }

    #[test]
    fn a_bad_plugin_name_is_refused_before_anything_lands() {
        let vfs = demo_source();
        let mut bad = request();
        bad.plugin = Some("Bad Name".to_owned());
        let err = adopt_skills(&vfs, &bad, &ap()).unwrap_err().to_string();
        assert!(err.contains("plugin name"), "{err}");
        assert!(err.contains("Bad Name"), "{err}");
        assert!(!vfs.exists(Path::new("/vault")));

        // And the default plugin fills in when the request names none.
        let mut unnamed = request();
        unnamed.plugin = None;
        let report = adopt_skills(&vfs, &unnamed, &ap()).unwrap();
        assert_eq!(report.skills[0].plugin, DEFAULT_ADOPTED_PLUGIN);
        assert!(vfs.exists(Path::new("/vault/plugins/adopted/skills/demo/demo.md")));
    }

    #[test]
    fn an_error_over_any_skill_leaves_the_vault_untouched() {
        // Everything is planned before anything is written, so the broken
        // second skill takes the healthy first one down with it — loudly,
        // rather than a half-imported vault quietly missing a skill.
        let vfs = demo_source();
        write(
            &vfs,
            "/src/skills/broken/SKILL.md",
            "---\nname: broken\n---\nb\n",
        );
        let err = adopt_skills(&vfs, &request(), &ap());
        assert!(err.is_err());
        assert!(!vfs.exists(Path::new("/vault")), "no partial import");
    }

    #[test]
    fn resource_markdown_is_rewritten_with_its_frontmatter_carried_verbatim() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: d\n---\n\nSee [guide](references/guide.md).\n",
        );
        write(
            &vfs,
            "/src/skills/demo/references/guide.md",
            "---\ntag: kept\n---\n\nAlso read [notes](notes.md) and `scripts/run.sh`.\n",
        );
        write(&vfs, "/src/skills/demo/references/notes.md", "# Notes\n");
        write(&vfs, "/src/skills/demo/scripts/run.sh", "#!/bin/sh\n");
        adopt_skills(&vfs, &request(), &ap()).unwrap();

        let guide = read(&vfs, "/vault/plugins/demos/skills/demo/references/guide.md");
        // The resource's own frontmatter travels byte-for-byte…
        assert!(guide.starts_with("---\ntag: kept\n---\n"), "{guide}");
        // …its links are rewritten like the entry's…
        assert!(guide.contains("[[notes]]"), "{guide}");
        // …and an inline-code mention of a sibling resource becomes a link.
        assert!(guide.contains("[[run.sh]]"), "{guide}");
    }

    #[test]
    fn the_marketplace_generated_marker_is_stripped_from_the_body() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/src/skills/demo/SKILL.md",
            "---\nname: demo\ndescription: d\n---\n<!-- Generated by skill-export v1.0 -->\n\n# Demo\n",
        );
        adopt_skills(&vfs, &request(), &ap()).unwrap();
        let entry = read(&vfs, "/vault/plugins/demos/skills/demo/demo.md");
        assert!(!entry.contains("Generated by"), "{entry}");
        assert!(entry.contains("# Demo"), "{entry}");
        // An ordinary comment is content and stays.
        assert!(rewrite_to_wikilinks("<!-- keep me -->", &[]).contains("keep me"));
    }

    #[test]
    fn adoption_is_deterministic_given_the_callers_clock() {
        // Same source, same request → the same bytes, run to run: nothing
        // here reads a clock or iterates a hash map.
        let first = demo_source();
        adopt_skills(&first, &request(), &ap()).unwrap();
        let second = demo_source();
        adopt_skills(&second, &request(), &ap()).unwrap();
        assert_eq!(
            read(&first, "/vault/plugins/demos/skills/demo/demo.md"),
            read(&second, "/vault/plugins/demos/skills/demo/demo.md")
        );
    }

    #[test]
    fn a_missing_source_and_an_empty_source_are_distinct_errors() {
        let vfs = MemVfs::new();
        let err = adopt_skills(&vfs, &request(), &ap()).unwrap_err();
        assert!(matches!(err, CoreError::RootNotFound(_)), "{err}");

        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/src")).unwrap();
        let err = adopt_skills(&vfs, &request(), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("SKILL.md"), "{err}");
    }

    /// The two rules [`MemVfs`] cannot exercise: real execute bits and links.
    #[cfg(unix)]
    #[test]
    fn exec_bits_travel_and_a_symlinked_source_is_refused_on_a_real_filesystem() {
        use crate::vfs::NativeVfs;

        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("src/skills/demo");
        std::fs::create_dir_all(source.join("scripts")).unwrap();
        std::fs::write(
            source.join("SKILL.md"),
            "---\nname: demo\ndescription: d\n---\nRun `scripts/tool.sh`.\n",
        )
        .unwrap();
        std::fs::write(source.join("scripts/tool.sh"), "#!/bin/sh\necho ok\n").unwrap();
        NativeVfs
            .set_executable(&source.join("scripts/tool.sh"), true)
            .unwrap();

        let mut real = request();
        real.source = dir.path().join("src");
        real.vault_root = dir.path().join("vault");
        adopt_skills(&NativeVfs, &real, &ap()).unwrap();

        let tool = dir
            .path()
            .join("vault/plugins/demos/skills/demo/scripts/tool.sh");
        assert!(NativeVfs.is_executable(&tool), "the bit rode along");
        let entry =
            std::fs::read_to_string(dir.path().join("vault/plugins/demos/skills/demo/demo.md"))
                .unwrap();
        assert!(entry.contains("[[tool.sh]]"), "{entry}");

        // A symlink anywhere in the source refuses the import before a byte
        // of it lands.
        std::fs::write(dir.path().join("outside.md"), "outside\n").unwrap();
        std::os::unix::fs::symlink(
            dir.path().join("outside.md"),
            source.join("references-linked.md"),
        )
        .unwrap();
        let mut second = real.clone();
        second.vault_root = dir.path().join("vault2");
        let err = adopt_skills(&NativeVfs, &second, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unsafe-path"), "{err}");
        assert!(err.contains("references-linked.md"), "{err}");
        assert!(!dir.path().join("vault2").exists(), "nothing was written");
    }

    /// A skills root spelled inside the vault but linked outside it is outside.
    #[cfg(unix)]
    #[test]
    fn a_symlinked_skills_root_that_leaves_the_vault_is_refused() {
        use crate::vfs::NativeVfs;

        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("src/skills/demo");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(
            source.join("SKILL.md"),
            "---\nname: demo\ndescription: d\n---\nBody.\n",
        )
        .unwrap();
        let vault = dir.path().join("vault");
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, vault.join("library")).unwrap();

        let mut linked = request();
        linked.source = dir.path().join("src");
        linked.vault_root = vault.clone();
        linked.skills_root = Some(vault.join("library"));
        let err = adopt_skills(&NativeVfs, &linked, &ap()).unwrap_err();

        assert!(matches!(err, CoreError::PathEscapesRoot(_)), "{err}");
        assert_eq!(
            std::fs::read_dir(&outside).unwrap().count(),
            0,
            "nothing was written outside the vault"
        );
    }

    /// A skills root spelled through an alias of the vault is inside it on
    /// disk, but discovery strips the vault root as spelled and cannot read
    /// the tree back, so it is refused.
    #[cfg(unix)]
    #[test]
    fn a_skills_root_spelled_through_an_alias_of_the_vault_is_refused() {
        use crate::vfs::NativeVfs;

        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("src/skills/demo");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(
            source.join("SKILL.md"),
            "---\nname: demo\ndescription: d\n---\nBody.\n",
        )
        .unwrap();
        let vault = dir.path().join("vault");
        std::fs::create_dir_all(&vault).unwrap();
        let alias = dir.path().join("alias");
        std::os::unix::fs::symlink(&vault, &alias).unwrap();

        let mut aliased = request();
        aliased.source = dir.path().join("src");
        aliased.vault_root = vault.clone();
        aliased.skills_root = Some(alias.join("lib"));
        let err = adopt_skills(&NativeVfs, &aliased, &ap()).unwrap_err();

        assert!(matches!(err, CoreError::PathEscapesRoot(_)), "{err}");
        assert!(!vault.join("lib").exists(), "nothing was written");
    }
}

//! The `sw-` namespace — the frontmatter skillwright owns in a note.
//!
//! The namespace spec splits a note's frontmatter into
//! three classes, and this module is the boundary between the first two and
//! the third:
//!
//! | Class | Where it goes | At publish |
//! |---|---|---|
//! | Ours — every key under the namespace (`sw-` by default) | [`VaultFrontmatter`], typed | **dropped** |
//! | The standard's fields | [`crate::SkillContent`]'s modeled fields | emitted |
//! | Anything else | `SkillContent::annotations`, verbatim | carried |
//!
//! # Which prefix, is the caller's to say
//!
//! `sw-` is the default and what every document spells, but it is not wired
//! in: the prefix is a [`Namespace`] this module takes as a parameter, and a
//! vault that already has an `sw-` key of somebody else's configures its own
//! stem. Nothing below writes a literal `sw-…` — every key is
//! [`Namespace::key`] of a field name, which is what keeps the keys the drain
//! asks for inside the predicate the strip is built on. Below, "`sw-`" means
//! the configured prefix.
//!
//! # Why the prefix is claimed wholesale
//!
//! `sw-` is a **namespace we take**, not a list of keys we know. A key inside
//! it is ours whether this build models it yet or not, which is what makes the
//! publish-time strip one predicate instead of an allow-list that drifts every
//! time a field is added. So an unmodeled `sw-` key is *consumed* here — it
//! never reaches `annotations`, because a key that reached `annotations` would
//! reach a destination — and parked in [`VaultFrontmatter::unknown_ours`]
//! rather than refused or dropped:
//!
//! * **Not refused**, because the Obsidian plugin and the CLI edit one
//!   vault and ship on their own schedules: every field either side adds would
//!   break the other until both are upgraded.
//! * **Not dropped.** Everything unmodeled survives the read, addressable by a
//!   caller that wants to warn about it.
//!
//! # Why a wrong-shaped value inside the prefix is refused
//!
//! [`crate::vault`] carries a wrong-shaped *modeled* key verbatim rather than
//! swallowing it — `name: [a]` stays in the note's own bytes and travels on.
//! Inside `sw-` it cannot: our keys are stripped at emit, so "carry it
//! verbatim" and "lose it" are the same outcome. That leaves refusing, which is
//! also the rule the decision states for `sw-kind` and `sw-targets` — **an
//! absent key and a present-but-wrong key must not share an outcome.**
//! `sw-targets: claude` (a scalar where a list belongs) read as "no value, so
//! publish everywhere" would push files at destinations the author was trying
//! to exclude, with nothing on screen.
//!
//! # The kind is resolved, not just read
//!
//! `sw-kind` is the primary source and the only one this crate implements, but
//! it is not the only one there will be: [`resolve_kind`] is the seam the
//! other layers attach to. See its documentation for the precedence and for
//! what a configured directory mapping would cost.
//!
//! # Two shapes, one reader
//!
//! The CLI writes flat keys, because the author edits them in vanilla Obsidian
//! whose Properties panel renders a nested mapping through an inert read-only
//! widget. the plugin supplies its own UI and may write a nested `sw:`
//! block. Both are read here from day one — `claim` normalises the nested
//! shape onto the flat spelling and everything downstream sees one vocabulary
//! — and a note carrying both is refused · `mixed-frontmatter-shape` rather
//! than reconciled. There is no field-by-field comparison, only a shape check;
//! deciding what *agree* means across two shapes is a judgement call that is
//! eventually wrong, and picking a winner silently drops a field the author
//! typed.

use std::fmt;
use std::path::Path;
use std::str::FromStr;

use agent_adapt::Argument;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::CoreError;
use crate::namespace::Namespace;

/// Which publishable unit a note is — what `sw-kind` names.
///
/// Absent means [`EntityKind::Skill`]: a vault of skills declares nothing at
/// all, and the key appears only on the notes that are something else. That
/// default is for **absence only**. An unrecognised value is a typo, and
/// defaulting it would publish a `SKILL.md` at every destination for something
/// that is not a skill — silently, and as a write.
///
/// `mcp-server` is named by the decision as a later kind and is deliberately
/// not a variant yet.
///
/// # A kind in the vocabulary need not be publishable
///
/// Entering the vocabulary makes a note *discoverable* — the workbench can
/// list it and say what it is — while [`crate::publish`]'s kind gate refuses it
/// `no-renderer` until a projection exists. `Marketplace` and `Hook` are the
/// kinds sitting there now. Outside the vocabulary a note is `unknown-kind`: a typo.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntityKind {
    /// One skill: frontmatter plus a body, published as a `SKILL.md`.
    #[default]
    Skill,
    /// A pack of components, holding them in the folders beneath it.
    Plugin,
    /// A slash command, published into the target's commands layout.
    Command,
    /// A subagent definition, published into the target's agents layout.
    Agent,
    /// One automation hook: typed frontmatter naming the event and the
    /// matcher, and a body that is the script or the prompt.
    ///
    /// A hook reaches a harness through its plugin's `hooks/hooks.json`
    /// rather than through a file of its own, so [`crate::publish`] refuses
    /// a standalone hook publish `no-renderer` while [`crate::export`]
    /// renders it into the pack.
    Hook,
    /// A distribution: the plugins beneath it, built into one marketplace.
    ///
    /// The level above [`Self::Plugin`], and the only kind with no
    /// per-destination layout at all — a runtime reads skills, never
    /// marketplaces. [`crate::export`] renders one; [`crate::publish`] refuses
    /// it `no-renderer`, and says where to go.
    Marketplace,
}

impl EntityKind {
    /// Every spelling [`EntityKind::from_str`] accepts, in the order a refusal
    /// lists them.
    pub const KNOWN: &'static [&'static str] =
        &["agent", "command", "hook", "marketplace", "plugin", "skill"];

    /// Does this kind hold other components in the folders beneath it?
    ///
    /// True for the container kinds, and it is what tells a *shipping* overlap
    /// from an ordinary nesting. Everything under a skill's own directory
    /// travels with it, so another component in there would publish twice —
    /// but a plugin's directory holds its skills by design, and a
    /// marketplace's holds its plugins, and neither ships what is beneath it
    /// as its own resources.
    pub const fn holds_components(self) -> bool {
        matches!(self, Self::Plugin | Self::Marketplace)
    }

    /// The spelling a note carries.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Skill => "skill",
            Self::Plugin => "plugin",
            Self::Command => "command",
            Self::Agent => "agent",
            Self::Hook => "hook",
            Self::Marketplace => "marketplace",
        }
    }
}

/// `sw-kind` named something this build does not publish.
///
/// A distinct type rather than a bare `CoreError` so [`EntityKind::from_str`]
/// stays usable without a path in hand; [`VaultFrontmatter::take_from`] is
/// what pairs it with the note it came from and with the key it was spelled
/// under — which is why nothing here names that key. The stem is
/// configurable, and only the caller holding the [`Namespace`] knows whether
/// the note said `sw-kind` or `x-kind`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownKind {
    /// The value as the note spelled it.
    pub value: String,
}

impl fmt::Display for UnknownKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "`{}` is not a kind this build knows (known: {})",
            self.value,
            EntityKind::KNOWN.join(", ")
        )
    }
}

impl std::error::Error for UnknownKind {}

impl FromStr for EntityKind {
    type Err = UnknownKind;

    /// Exact match, no case folding: `Skill` is refused as loudly as `skil`.
    /// A vocabulary two surfaces write has to be one spelling, and quietly
    /// accepting a second is how a third appears.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "skill" => Ok(Self::Skill),
            "plugin" => Ok(Self::Plugin),
            "command" => Ok(Self::Command),
            "agent" => Ok(Self::Agent),
            "hook" => Ok(Self::Hook),
            "marketplace" => Ok(Self::Marketplace),
            other => Err(UnknownKind {
                value: other.to_owned(),
            }),
        }
    }
}

/// Which layer decided a note's kind.
///
/// Carried alongside the kind because the answer to "why is this a plugin"
/// is a different sentence per layer, and a report that only had the kind
/// could not write any of them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KindSource {
    /// Layer 1 — the caller said so explicitly.
    Override,
    /// Layer 2 — the note's own `sw-kind`.
    Frontmatter,
    /// Layer 3 — a configured directory mapping.
    Directory,
    /// No layer applied. Absent means `skill`.
    Default,
}

impl KindSource {
    /// The spelling a report prints, matching the serialized form so a caller
    /// that renders this and a caller that deserializes it cannot disagree.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Override => "override",
            Self::Frontmatter => "frontmatter",
            Self::Directory => "directory",
            Self::Default => "default",
        }
    }
}

/// A kind and the layer that decided it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolvedKind {
    /// The resolved kind.
    pub kind: EntityKind,
    /// The layer that decided the kind.
    pub source: KindSource,
}

/// What the *caller* knows about a note's kind that the note itself does not
/// say. Both layers are the caller's to supply; neither is implemented here.
///
/// Default is "the caller knows nothing", which is what
/// [`VaultFrontmatter::kind`] passes and what makes `sw-kind` the whole story
/// until the other layers exist.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct KindHints {
    /// **Layer 1.** An explicit instruction — "treat this note as a skill" —
    /// from a flag, a prompt, or a conversion that is about to stamp
    /// `sw-kind` into the note. Wins outright: nothing is more explicit than
    /// being told.
    pub requested: Option<EntityKind>,
    /// **Layer 3.** What a configured directory mapping said, already
    /// resolved by the caller against the note's path. `None` when no rule
    /// matched — a note at the root of a skills source has no folder above it
    /// naming a kind.
    ///
    /// [`crate::discover`] supplies this from the folder a note sits in; it is
    /// the reason [`KindSource::Directory`] is reachable at all.
    pub configured: Option<EntityKind>,
}

/// Resolves a note's kind across the layers that can decide it.
///
/// Precedence, highest first:
///
/// | Layer | Source | Implemented here |
/// |---|---|---|
/// | 1 | A caller-supplied override ([`KindHints::requested`]) | no — a parameter |
/// | 2 | `sw-kind` in the note ([`VaultFrontmatter::declared_kind`]) | **yes** |
/// | 3 | A configured directory mapping ([`KindHints::configured`]) | no — a parameter |
/// | 4 | The default, [`EntityKind::Skill`] | yes |
///
/// Layers 1 and 3 are parameters rather than logic: the CLI flag belongs to
/// the surface that offers it, and the directory mapping needs the whole file
/// set to read a folder — [`crate::discover`] holds that and passes the
/// answer. What lives here is the *order*, in one place.
///
/// # A configured directory mapping makes folders load-bearing
///
/// The vault's model is that a declared folder is scaffolding and never a type
/// — a note is whatever another note does with it, and `skills/` is where
/// skills are kept rather than what makes something a skill. Layer 3 breaks
/// that property: under such a configuration, moving a note between folders
/// changes what it publishes as.
///
/// That is acceptable on two conditions, both structural in the table above.
/// It is **opt-in** — absent configuration, no rule matches and nothing
/// changes — and frontmatter **outranks** it, so a note that says what it is
/// is never overruled by where it sits. A vault that stamps `sw-kind` is
/// unaffected by any mapping at all.
///
/// # Why this is infallible
///
/// Every way kind identification can fail is a *parse* failure — `sw-kind`
/// naming a value this build does not know, refused · `unknown-kind` by
/// [`VaultFrontmatter::take_from`] before a resolution is ever attempted — and
/// the precedence above is total, so there is no disagreement left for this
/// function to arbitrate. A layer that can conflict rather than be outranked
/// would change that, and would be the moment to make this fallible.
pub fn resolve_kind(declared: Option<EntityKind>, hints: KindHints) -> ResolvedKind {
    if let Some(kind) = hints.requested {
        return ResolvedKind {
            kind,
            source: KindSource::Override,
        };
    }
    if let Some(kind) = declared {
        return ResolvedKind {
            kind,
            source: KindSource::Frontmatter,
        };
    }
    if let Some(kind) = hints.configured {
        return ResolvedKind {
            kind,
            source: KindSource::Directory,
        };
    }
    ResolvedKind {
        kind: EntityKind::default(),
        source: KindSource::Default,
    }
}

/// Where adoption read a note from, written by adoption and by nothing else.
///
/// Every field is optional and a note carrying none of them is hand-authored
/// ([`Provenance::is_hand_authored`]). It is data in the user's file rather
/// than a lock: a hand-edited value is authoritative, and a wrong one produces
/// a refusal rather than a clobber.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Provenance {
    /// `sw-source` — the path adoption read the skill from.
    pub source: Option<String>,
    /// `sw-format` — the runtime layout it was read in (`claude`, `codex`,
    /// `agents`, …), or `none`.
    pub format: Option<String>,
    /// `sw-source-hash` — hash over the source folder as read. Answers "has
    /// the source moved on".
    pub source_hash: Option<String>,
    /// `sw-adopted-hash` — hash over what adoption wrote. Answers "has the
    /// note been edited since".
    pub adopted_hash: Option<String>,
    /// `sw-adopted-at` — when adoption wrote it.
    pub adopted_at: Option<String>,
    /// `sw-also-at` — other paths the same content was found at.
    pub also_at: Option<Vec<String>>,
}

impl Provenance {
    /// True when adoption never touched this note.
    pub fn is_hand_authored(&self) -> bool {
        self == &Self::default()
    }
}

/// What a container note says about the thing it names — the manifest fields
/// a marketplace or a plugin publishes under.
///
/// Meaningful only on a container. A skill note may spell these keys and they
/// are read the same way, but nothing consults them: a skill's manifest entry
/// is derived from the skill, and there is no second place for it to disagree.
///
/// **Every field is optional and every absence has a default**, resolved by
/// [`crate::export`] rather than here, because the defaults are a property of
/// the manifest dialect being written and not of the note. Reading them is
/// this module's job; deciding what a missing `license` means is not.
///
/// `owner` and `author` are [`Value`] rather than `String` because an author
/// may spell either as `{name, email, url}`, and narrowing them here would
/// refuse a shape the manifest accepts. The converse is not true for `owner`:
/// Claude and Cursor both require an object there, so a bare name written
/// here is normalised on the way into a manifest rather than passed through —
/// see [`crate::export::MarketplaceConfig::owner`].
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ContainerIdentity {
    /// `sw-owner` — the marketplace's owner, free-shaped.
    pub owner: Option<Value>,
    /// `sw-author` — the author a plugin publishes under, free-shaped. On a
    /// marketplace note it is the default for every plugin under it.
    pub author: Option<Value>,
    /// `sw-display-name` — the human-facing name where a dialect carries one
    /// separately from the slug.
    pub display_name: Option<String>,
    /// `sw-license` — an SPDX identifier, unread and passed through.
    pub license: Option<String>,
    /// `sw-keywords`.
    pub keywords: Option<Vec<String>>,
    /// `sw-category` — Codex's plugin category.
    pub category: Option<String>,
    /// `sw-version` — the plugin's own version.
    pub version: Option<String>,
}

impl ContainerIdentity {
    /// True when the note said nothing about its identity, and every manifest
    /// field will come from a default or from configuration.
    pub fn is_silent(&self) -> bool {
        self == &Self::default()
    }
}

/// Everything the `sw-` namespace said about one note, read out of its
/// frontmatter and typed.
///
/// This is deliberately **not** part of [`crate::SkillContent`]. Our keys are
/// machine-local configuration about *this* vault — a source path, a hash, a
/// list of destinations — and a consumer reading them would learn something
/// true about the vault and nothing about the skill in front of it. Keeping
/// them off the type [`crate::projection::project_skill`] renders makes the
/// strip structural: there is no field for them to leak through.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct VaultFrontmatter {
    /// `sw-kind`, exactly as the note declared it — `None` when the key is
    /// absent, which is the ordinary vault.
    ///
    /// Deliberately not pre-defaulted to [`EntityKind::Skill`]: the default
    /// belongs to [`resolve_kind`], one layer down, and folding it in here
    /// would make "the note said skill" and "the note said nothing"
    /// indistinguishable to the layer that has to rank them. Use
    /// [`VaultFrontmatter::kind`] for the resolved answer.
    pub declared_kind: Option<EntityKind>,
    /// `sw-targets`. **Three outcomes, not two:** `None` is absent and means
    /// every destination; `Some(vec![])` is an empty list and means nowhere;
    /// `Some(names)` narrows to those. Collapsing absent into empty would
    /// stop a vault publishing at all, and empty into absent would publish
    /// where the author said not to.
    pub targets: Option<Vec<String>>,
    /// `sw-plugin` — which plugin this note's skill belongs to when a
    /// marketplace groups it. `None` is absent, and absent means *the caller's
    /// configured default plugin* — the default is configuration, not a
    /// property of the note, so it is not folded in here for the same reason
    /// [`VaultFrontmatter::declared_kind`] is not pre-defaulted: the layer
    /// that knows the default has to be able to tell "said nothing" from
    /// "said the default's name". The value is not validated here — what makes
    /// a plugin name legal is the Agent Skills spec's name rule, which belongs to
    /// discovery ([`crate::discover`]) beside the identical rule for skill
    /// names, not to a frontmatter reader that types every vault's notes.
    pub plugin: Option<String>,
    /// `sw-arguments` — what this skill or command's invocation takes,
    /// validated: every name is a slug, every name is unique, no `values`
    /// list is empty, and every `default` is one of its own `values` when
    /// `values` is present. Empty when the key is absent, which is the
    /// ordinary note.
    ///
    /// The one field in this struct that is not purely vault bookkeeping —
    /// [`crate::publish::publish_skill`] and [`crate::export`] carry it onto
    /// [`crate::content::SkillContent::arguments`] rather than dropping it,
    /// because unlike a source path or a destination list it describes the
    /// skill's own contract, which every destination needs to render.
    /// [`crate::content::SkillContent::apply_arguments`] is the one seam that
    /// does the carrying, and it is never called from
    /// [`crate::vault::read_vault_skill`] — this field's raw `sw-arguments`
    /// key still never reaches a destination, only what is derived from it.
    pub arguments: Vec<Argument>,
    /// The six adoption-written keys.
    pub provenance: Provenance,
    /// The manifest fields a container note publishes under. Empty on the
    /// ordinary skill note, which has no manifest of its own.
    pub identity: ContainerIdentity,
    /// `sw-overrides` — what one destination receives that the canonical
    /// model cannot say, keyed by target name and then by that harness's own
    /// key names. Empty when the key is absent, which is the ordinary note.
    ///
    /// Read and shape-checked here; **not** validated here. Neither half of
    /// the validation belongs to a frontmatter reader: folding a target name
    /// onto its destination is [`crate::publish::canonical_target`]'s job,
    /// and deciding whether a harness knows a key is the capability matrix's.
    /// [`crate::publish::overrides_for`] does both, which is the same seam
    /// [`VaultFrontmatter::targets`] is validated at and for the same reason
    /// — a reader that types every vault's notes should not also hold the
    /// destination roster.
    pub overrides: Map<String, Value>,
    /// Keys inside our namespace this build does not model, under their flat
    /// spelling — consumed so they cannot reach a destination, kept so nothing
    /// is lost silently. A caller may warn on a non-empty map; nothing here
    /// does.
    ///
    /// Named for the namespace rather than for `sw`, because which prefix
    /// these keys carry is the vault's to configure.
    pub unknown_ours: Map<String, Value>,
}

impl VaultFrontmatter {
    /// The kind this note publishes as, with no caller hints in play — the
    /// note's own `sw-kind`, or [`EntityKind::Skill`] when it carries none.
    ///
    /// The convenience for callers that have no override and no directory
    /// configuration, which is every caller in this crate. Anything holding
    /// either one calls [`resolve_kind`] directly.
    pub fn kind(&self) -> EntityKind {
        resolve_kind(self.declared_kind, KindHints::default()).kind
    }

    /// Takes the whole of `ns` out of `fields`, leaving only keys that are
    /// genuinely foreign.
    ///
    /// `fields` is the note's frontmatter as a JSON object, and the caller is
    /// expected to have removed nothing from it yet — the shape check counts
    /// keys, so a partly-drained map would misread a mixed note as a clean
    /// one. `path` is only ever used to name the note in a refusal.
    ///
    /// `ns` is the namespace this vault configured, and it must be the same
    /// one the emit-side strip uses ([`crate::projection::project_skill`]).
    /// Two namespaces on one path is the failure this parameter exists to make
    /// visible: a note read under `x` and emitted under `sw` publishes every
    /// `x-` key it declared.
    ///
    /// # Errors
    ///
    /// * `refused: old-key` — under the default namespace, the note carries a
    ///   key of the `tradecraft` CLI's namespace. The message names the key
    ///   and its replacement.
    /// * `refused: mixed-frontmatter-shape` — the note carries the nested
    ///   block *and* at least one flat key of the same namespace.
    /// * `refused: unknown-kind` — the kind key names a value this build does
    ///   not know.
    /// * A content error naming the key and the path when a value inside the
    ///   namespace is the wrong shape.
    pub fn take_from(
        fields: &mut Map<String, Value>,
        path: &Path,
        ns: &Namespace,
    ) -> Result<Self, CoreError> {
        refuse_old_keys(fields, path, ns)?;
        let mut ours = claim(fields, path, ns)?;

        // Every key below is `ns.key(field)` and never a literal, so the drain
        // asks for exactly what `Namespace::is_ours` accepts — see `claim`.
        let kind_key = ns.key("kind");
        let declared_kind = take_string(&mut ours, &kind_key, path)?
            .map(|value| {
                value
                    .parse::<EntityKind>()
                    .map_err(|e| refuse("unknown-kind", path, format!("`{kind_key}`: {e}")))
            })
            .transpose()?;

        let targets = take_string_list(&mut ours, &ns.key("targets"), path)?;
        let plugin = take_string(&mut ours, &ns.key("plugin"), path)?;
        let overrides = take_override_blocks(&mut ours, &ns.key("overrides"), path)?;
        let arguments = take_arguments(&mut ours, &ns.key("arguments"), path)?;

        let provenance = Provenance {
            source: take_string(&mut ours, &ns.key("source"), path)?,
            format: take_string(&mut ours, &ns.key("format"), path)?,
            source_hash: take_string(&mut ours, &ns.key("source-hash"), path)?,
            adopted_hash: take_string(&mut ours, &ns.key("adopted-hash"), path)?,
            adopted_at: take_string(&mut ours, &ns.key("adopted-at"), path)?,
            also_at: take_string_list(&mut ours, &ns.key("also-at"), path)?,
        };

        // Read for every note, consulted only for a container. Taking them
        // here rather than in a container-only reader is what keeps them out
        // of `unknown_ours`: a key this build models is a key it must claim,
        // or a marketplace note's `sw-owner` reads as unmodeled on the one
        // hand and is silently ignored on the other.
        let identity = ContainerIdentity {
            owner: ours.remove(&ns.key("owner")),
            author: ours.remove(&ns.key("author")),
            display_name: take_string(&mut ours, &ns.key("display-name"), path)?,
            license: take_string(&mut ours, &ns.key("license"), path)?,
            keywords: take_string_list(&mut ours, &ns.key("keywords"), path)?,
            category: take_string(&mut ours, &ns.key("category"), path)?,
            version: take_string(&mut ours, &ns.key("version"), path)?,
        };

        Ok(Self {
            declared_kind,
            targets,
            plugin,
            overrides,
            arguments,
            provenance,
            identity,
            // Whatever is left is inside our prefix and unmodeled. It is
            // already out of `fields`, which is the half that matters.
            unknown_ours: ours,
        })
    }
}

/// The `tradecraft` CLI's default stem, before the rename to `sw`.
const OLD_STEM: &str = "tc";

/// Refuses a key in the old default namespace, naming its new spelling.
///
/// Only under the default namespace: a vault that configures `namespace: tc`
/// owns those keys. Read as foreign instead, the old keys would publish.
fn refuse_old_keys(
    fields: &Map<String, Value>,
    path: &Path,
    ns: &Namespace,
) -> Result<(), CoreError> {
    if ns.stem() != Namespace::DEFAULT_STEM {
        return Ok(());
    }
    let old = fields.keys().find_map(|key| {
        let rest = key.strip_prefix(OLD_STEM)?;
        (rest.is_empty() || rest.starts_with('-')).then_some((key, rest))
    });
    match old {
        Some((key, rest)) => Err(refuse(
            "old-key",
            path,
            format!(
                "`{key}` is the old spelling: rename it to `{}{rest}`, or set `namespace: {OLD_STEM}`",
                ns.stem()
            ),
        )),
        None => Ok(()),
    }
}

/// Splits the namespace off `fields` and normalises it onto the flat spelling.
///
/// A nested `sw: {kind: plugin}` comes back as `{"sw-kind": "plugin"}`, which
/// is what makes the two shapes parse identically rather than through two
/// readers that drift.
///
/// # The drain is defined by the predicate
///
/// What moves is spelled `ns.is_ours(key)` and nothing else — the flat sweep
/// is *ours minus the block*, rather than a second `starts_with` that happens
/// to agree with [`Namespace::is_ours`] today. A key the predicate claims and
/// the drain left behind would be published and then stripped; a key the drain
/// took and the predicate disowned would vanish from a note with no refusal.
/// Both are one expression away, so there is only one expression.
fn claim(
    fields: &mut Map<String, Value>,
    path: &Path,
    ns: &Namespace,
) -> Result<Map<String, Value>, CoreError> {
    let block_key = ns.block_key();
    let flat: Vec<String> = fields
        .keys()
        .filter(|k| ns.is_ours(k) && k.as_str() != block_key)
        .cloned()
        .collect();
    let nested = fields.contains_key(block_key);

    // The shape check comes first and is not a reconciliation: it refuses
    // whether or not the two shapes carry the same fields, and whether or not
    // their values agree.
    if nested && !flat.is_empty() {
        return Err(refuse(
            "mixed-frontmatter-shape",
            path,
            format!(
                "the note carries a nested `{block_key}:` block and {}. \
                 Move the flat keys into the block, or remove the block",
                listed(&flat)
            ),
        ));
    }

    if !nested {
        let mut ours = Map::new();
        for key in flat {
            if let Some(value) = fields.remove(&key) {
                ours.insert(key, value);
            }
        }
        return Ok(ours);
    }

    match fields.remove(block_key).unwrap_or(Value::Null) {
        // `sw:` with nothing under it is an empty block, not a broken one.
        Value::Null => Ok(Map::new()),
        Value::Object(map) => Ok(map
            .into_iter()
            .map(|(key, value)| (ns.key(&key), value))
            .collect()),
        other => Err(CoreError::malformed(
            path,
            format!(
                "`{block_key}:` must be a mapping of our fields, not {}",
                type_name(&other)
            ),
        )),
    }
}

/// Removes `key` and returns it as a string, refusing any other shape.
fn take_string(
    ours: &mut Map<String, Value>,
    key: &str,
    path: &Path,
) -> Result<Option<String>, CoreError> {
    match ours.remove(key) {
        None => Ok(None),
        Some(Value::String(value)) => Ok(Some(value)),
        Some(other) => Err(CoreError::malformed(
            path,
            format!(
                "`{key}` must be a string, not {}{}",
                type_name(&other),
                quoting_hint(&other)
            ),
        )),
    }
}

/// Removes `key` and returns it as a list of strings, refusing any other
/// shape — including a bare scalar, which would otherwise be one destination
/// misread as none.
fn take_string_list(
    ours: &mut Map<String, Value>,
    key: &str,
    path: &Path,
) -> Result<Option<Vec<String>>, CoreError> {
    let Some(value) = ours.remove(key) else {
        return Ok(None);
    };
    match value {
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                match item {
                    Value::String(s) => out.push(s),
                    other => {
                        return Err(CoreError::malformed(
                            path,
                            format!(
                                "`{key}` must be a list of strings; one entry is {}",
                                type_name(&other)
                            ),
                        ));
                    }
                }
            }
            Ok(Some(out))
        }
        other => Err(CoreError::malformed(
            path,
            format!(
                "`{key}` must be a list, not {}. \
                 An empty list means nowhere; removing the key means everywhere",
                type_name(&other)
            ),
        )),
    }
}

/// Removes `key` and returns it as a validated list of [`Argument`]s.
///
/// Absent means no arguments — an ordinary note. Every other outcome is
/// either [`CoreError::malformed`] for a wrong *shape* (not a list, an entry
/// not a mapping, a field not the type it must be) or `refused` ·
/// `invalid-arguments` for a value that is the right shape and still cannot
/// be an argument list — see [`validate_arguments`] for those four rules.
///
/// # Errors
///
/// See the function documentation above.
fn take_arguments(
    ours: &mut Map<String, Value>,
    key: &str,
    path: &Path,
) -> Result<Vec<Argument>, CoreError> {
    let Some(value) = ours.remove(key) else {
        return Ok(Vec::new());
    };
    let Value::Array(items) = value else {
        return Err(CoreError::malformed(
            path,
            format!(
                "`{key}` must be a list of argument objects, not {}",
                type_name(&value)
            ),
        ));
    };

    let mut out = Vec::with_capacity(items.len());
    for item in items {
        let Value::Object(mut entry) = item else {
            return Err(CoreError::malformed(
                path,
                format!("`{key}` entries must be mappings, not {}", type_name(&item)),
            ));
        };

        let name = match entry.remove("name") {
            Some(Value::String(s)) => s,
            Some(other) => {
                return Err(CoreError::malformed(
                    path,
                    format!(
                        "`{key}` entry `name` must be a string, not {}",
                        type_name(&other)
                    ),
                ));
            }
            None => {
                return Err(CoreError::malformed(
                    path,
                    format!("a `{key}` entry is missing `name`"),
                ));
            }
        };
        let description = take_entry_string(&mut entry, key, &name, "description", path)?;
        let required = match entry.remove("required") {
            None => false,
            Some(Value::Bool(b)) => b,
            Some(other) => {
                return Err(CoreError::malformed(
                    path,
                    format!(
                        "`{key}` entry `{name}`'s `required` must be a boolean, not {}",
                        type_name(&other)
                    ),
                ));
            }
        };
        let values = match entry.remove("values") {
            None => None,
            Some(Value::Array(items)) => {
                let mut strings = Vec::with_capacity(items.len());
                for item in items {
                    match item {
                        Value::String(s) => strings.push(s),
                        other => {
                            return Err(CoreError::malformed(
                                path,
                                format!(
                                    "`{key}` entry `{name}`'s `values` must be a list of \
                                     strings; one entry is {}",
                                    type_name(&other)
                                ),
                            ));
                        }
                    }
                }
                Some(strings)
            }
            Some(other) => {
                return Err(CoreError::malformed(
                    path,
                    format!(
                        "`{key}` entry `{name}`'s `values` must be a list, not {}",
                        type_name(&other)
                    ),
                ));
            }
        };
        let default = take_entry_string(&mut entry, key, &name, "default", path)?;

        if let Some(unexpected) = entry.keys().next() {
            return Err(CoreError::malformed(
                path,
                format!(
                    "`{key}` entry `{name}` carries `{unexpected}`, which is not one of \
                     `name`, `description`, `required`, `values`, `default`"
                ),
            ));
        }

        out.push(Argument {
            name,
            description,
            required,
            values,
            default,
        });
    }

    validate_arguments(&out, key, path)?;
    Ok(out)
}

/// Removes `key` and returns it as a map of per-target override blocks.
///
/// Absent means no overrides — the ordinary note. Two shapes are refused,
/// both `CoreError::malformed` naming the key: a value that is not a mapping,
/// and a block under a target that is not a mapping either. Neither is a
/// `refused` token, because both are the same wrong-shape class every other
/// typed key in this module raises — a *value* problem, before anything has
/// been asked about destinations.
///
/// The keys inside a block are not inspected at all. They are the harness's
/// own vocabulary, and what they mean is the capability matrix's answer, one
/// layer out.
///
/// # Errors
///
/// See above.
fn take_override_blocks(
    ours: &mut Map<String, Value>,
    key: &str,
    path: &Path,
) -> Result<Map<String, Value>, CoreError> {
    let Some(value) = ours.remove(key) else {
        return Ok(Map::new());
    };
    let Value::Object(blocks) = value else {
        return Err(CoreError::malformed(
            path,
            format!(
                "`{key}` must be a mapping of destination to that harness's own keys, not {}",
                type_name(&value)
            ),
        ));
    };
    for (target, block) in &blocks {
        if !block.is_object() {
            return Err(CoreError::malformed(
                path,
                format!(
                    "`{key}.{target}` must be a mapping of that harness's own keys, not {}",
                    type_name(block)
                ),
            ));
        }
    }
    Ok(blocks)
}

/// `take_string`, scoped to one field of one `sw-arguments` entry, so every
/// entry-level string error names the argument it is about.
fn take_entry_string(
    entry: &mut Map<String, Value>,
    key: &str,
    arg_name: &str,
    field: &str,
    path: &Path,
) -> Result<Option<String>, CoreError> {
    match entry.remove(field) {
        None => Ok(None),
        Some(Value::String(s)) => Ok(Some(s)),
        Some(other) => Err(CoreError::malformed(
            path,
            format!(
                "`{key}` entry `{arg_name}`'s `{field}` must be a string, not {}",
                type_name(&other)
            ),
        )),
    }
}

/// The four rules an `sw-arguments` list must satisfy beyond its shape,
/// checked in this order so the first violation a caller sees is the first
/// one in declaration order that is wrong.
///
/// * Every `name` is a slug: `^[a-z0-9]+(-[a-z0-9]+)*$`, the same language
///   [`agent_adapt::naming::slugify_skill_name`] targets — an argument name
///   becomes `$name` in a Claude Code body and a word in a generated hint,
///   and neither tolerates whitespace or a leading hyphen.
/// * No `values` list is present and empty. `values: []` is not "no enum"
///   — that is what omitting the key means — it is an enum with nothing an
///   author could ever satisfy.
/// * Every `default` is one of its own `values`, when `values` is present.
///   A default outside the enum could never be assumed, so publishing it
///   would show the model a value invocation is not allowed to produce.
/// * Every `name` is unique. Two arguments named `format` would each
///   overwrite `$format` and the other's row in a rendered hint.
///
/// # Errors
///
/// `refused` · `invalid-arguments`, naming the argument and the rule.
fn validate_arguments(arguments: &[Argument], key: &str, path: &Path) -> Result<(), CoreError> {
    let mut seen = std::collections::HashSet::new();
    for arg in arguments {
        if !is_slug(&arg.name) {
            return Err(refuse(
                "invalid-arguments",
                path,
                format!(
                    "`{key}` names `{}`, which is not a slug — it must match \
                     ^[a-z0-9]+(-[a-z0-9]+)*$",
                    arg.name
                ),
            ));
        }
        if let Some(values) = &arg.values
            && values.is_empty()
        {
            return Err(refuse(
                "invalid-arguments",
                path,
                format!(
                    "`{key}` entry `{}`'s `values` is an empty list. Remove `values` for no \
                     enum, or list at least one allowed value",
                    arg.name
                ),
            ));
        }
        if let (Some(values), Some(default)) = (&arg.values, &arg.default)
            && !values.contains(default)
        {
            return Err(refuse(
                "invalid-arguments",
                path,
                format!(
                    "`{key}` entry `{}`'s `default` (`{default}`) is not one of its `values` \
                     ({})",
                    arg.name,
                    values
                        .iter()
                        .map(|v| format!("`{v}`"))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            ));
        }
        if !seen.insert(arg.name.as_str()) {
            return Err(refuse(
                "invalid-arguments",
                path,
                format!(
                    "`{key}` declares `{}` more than once. Names must be unique",
                    arg.name
                ),
            ));
        }
    }
    Ok(())
}

/// `^[a-z0-9]+(-[a-z0-9]+)*$` — the Agent Skills spec's `name` language, and
/// the one an argument's own `name` is held to for the same reason: it
/// becomes a path-free identifier (`$name`, a hint token) wherever it is
/// used, and none of those readers accept whitespace or punctuation.
fn is_slug(s: &str) -> bool {
    !s.is_empty()
        && s.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        })
}

/// Says the quoting rule at the one moment it is actionable: a value we wanted
/// as a string arrived as a number because YAML types a bare scalar by shape.
fn quoting_hint(value: &Value) -> &'static str {
    if value.is_number() || value.is_boolean() {
        " — quote it. A serialiser types a bare scalar by its shape, \
         and a long all-digit hash comes back as a float with the digits gone"
    } else {
        ""
    }
}

fn type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "nothing",
        Value::Bool(_) => "a boolean",
        Value::Number(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "a list",
        Value::Object(_) => "a mapping",
    }
}

/// "flat key `sw-kind`" / "flat keys `sw-kind`, `sw-targets`" — a refusal has
/// to name every offending key, because the fix is to move each one.
fn listed(keys: &[String]) -> String {
    let quoted: Vec<String> = keys.iter().map(|k| format!("`{k}`")).collect();
    let noun = if keys.len() == 1 {
        "flat key"
    } else {
        "flat keys"
    };
    format!("{noun} {}", quoted.join(", "))
}

/// A refusal carrying one of the publish spec's closed-set reason
/// tokens, the note it is about, and the prose that says what to do.
fn refuse(token: &str, path: &Path, message: impl fmt::Display) -> CoreError {
    CoreError::refused(token, format!("{}: {message}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOTE: &str = "/vault/skills/code-review.md";

    /// Frontmatter as `crate::vault` hands it over: a JSON object.
    fn fields(value: Value) -> Map<String, Value> {
        match value {
            Value::Object(map) => map,
            other => panic!("test frontmatter must be a mapping, got {other}"),
        }
    }

    /// The default namespace, which is what every test below uses unless it is
    /// about the configured one.
    fn read(value: Value) -> Result<(VaultFrontmatter, Map<String, Value>), CoreError> {
        read_as(&Namespace::default(), value)
    }

    fn read_as(
        ns: &Namespace,
        value: Value,
    ) -> Result<(VaultFrontmatter, Map<String, Value>), CoreError> {
        let mut map = fields(value);
        let ours = VaultFrontmatter::take_from(&mut map, Path::new(NOTE), ns)?;
        Ok((ours, map))
    }

    #[test]
    fn an_old_tc_key_is_refused_with_its_new_spelling() {
        let old = format!("{OLD_STEM}-kind");
        let err = read(json!({ old.clone(): "plugin" })).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("old-key"), "{message}");
        assert!(
            message.contains(&format!(
                "`{old}` is the old spelling: rename it to `sw-kind`, or set `namespace: {OLD_STEM}`"
            )),
            "{message}"
        );
        assert!(!message.contains('\n'), "{message}");

        let err = read(json!({ OLD_STEM: {"kind": "plugin"} })).unwrap_err();
        assert!(
            err.to_string().contains(&format!(
                "`{OLD_STEM}` is the old spelling: rename it to `sw`, or set `namespace: {OLD_STEM}`"
            )),
            "{err}"
        );

        // A vault that configured the old stem owns those keys.
        let ns = Namespace::new(OLD_STEM).unwrap();
        let (ours, _) = read_as(&ns, json!({ old: "plugin" })).unwrap();
        assert_eq!(ours.kind(), EntityKind::Plugin);
        // A key that only starts with the letters is not the old namespace.
        assert!(read(json!({"tcp": "x"})).is_ok());
    }

    #[test]
    fn overrides_are_read_as_a_map_of_blocks_and_never_reach_annotations() {
        let (ours, rest) = read(json!({
            "description": "d",
            "sw-overrides": {"claude": {"permissionMode": "plan"}},
        }))
        .unwrap();
        assert_eq!(ours.overrides["claude"]["permissionMode"], json!("plan"));
        assert!(!rest.contains_key("sw-overrides"));
    }

    #[test]
    fn an_absent_overrides_key_is_an_empty_map() {
        let (ours, _) = read(json!({"description": "d"})).unwrap();
        assert!(ours.overrides.is_empty());
    }

    #[test]
    fn a_wrong_shaped_overrides_value_is_refused_naming_the_key() {
        for value in [json!("claude"), json!(["claude"]), json!(3)] {
            let err = read(json!({"description": "d", "sw-overrides": value})).unwrap_err();
            let message = err.to_string();
            assert!(
                message.contains("`sw-overrides` must be a mapping"),
                "{message}"
            );
        }
    }

    #[test]
    fn a_wrong_shaped_block_is_refused_naming_its_destination() {
        let err = read(json!({
            "description": "d",
            "sw-overrides": {"claude": "plan"},
        }))
        .unwrap_err();
        let message = err.to_string();
        assert!(message.contains("`sw-overrides.claude`"), "{message}");
    }

    #[test]
    fn an_absent_kind_is_a_skill() {
        let (ours, _) = read(json!({"description": "d"})).unwrap();
        assert_eq!(ours.kind(), EntityKind::Skill);
        assert_eq!(EntityKind::default(), EntityKind::Skill);
        // Absent and "declared skill" stay distinguishable one layer down,
        // which is what lets a directory mapping rank below one and above the
        // other.
        assert_eq!(ours.declared_kind, None);
    }

    #[test]
    fn both_known_kinds_parse() {
        for (spelled, expected) in [("skill", EntityKind::Skill), ("plugin", EntityKind::Plugin)] {
            let (ours, _) = read(json!({ "sw-kind": spelled })).unwrap();
            assert_eq!(ours.declared_kind, Some(expected), "{spelled}");
            assert_eq!(ours.kind(), expected, "{spelled}");
            assert_eq!(expected.as_str(), spelled);
        }
    }

    #[test]
    fn the_kind_layers_rank_override_then_frontmatter_then_directory() {
        // Layer 2 alone — the only layer implemented, and the whole story for
        // every caller today.
        assert_eq!(
            resolve_kind(Some(EntityKind::Plugin), KindHints::default()),
            ResolvedKind {
                kind: EntityKind::Plugin,
                source: KindSource::Frontmatter
            }
        );

        // Layer 1 wins outright, over frontmatter and over a mapping.
        assert_eq!(
            resolve_kind(
                Some(EntityKind::Plugin),
                KindHints {
                    requested: Some(EntityKind::Skill),
                    configured: Some(EntityKind::Plugin),
                }
            ),
            ResolvedKind {
                kind: EntityKind::Skill,
                source: KindSource::Override
            }
        );

        // Layer 3 applies only where the note said nothing — a note that
        // declares its kind is never overruled by where it sits.
        assert_eq!(
            resolve_kind(
                Some(EntityKind::Skill),
                KindHints {
                    requested: None,
                    configured: Some(EntityKind::Plugin),
                }
            ),
            ResolvedKind {
                kind: EntityKind::Skill,
                source: KindSource::Frontmatter
            }
        );
        assert_eq!(
            resolve_kind(
                None,
                KindHints {
                    requested: None,
                    configured: Some(EntityKind::Plugin),
                }
            ),
            ResolvedKind {
                kind: EntityKind::Plugin,
                source: KindSource::Directory
            }
        );

        // Nothing said anything.
        assert_eq!(
            resolve_kind(None, KindHints::default()),
            ResolvedKind {
                kind: EntityKind::Skill,
                source: KindSource::Default
            }
        );
    }

    #[test]
    fn an_unrecognised_kind_is_refused_by_name_never_defaulted() {
        // The typo from the decision, plus a case variant: a default that
        // swallowed either would publish a `SKILL.md` for something that is
        // not a skill.
        for value in ["skil", "Skill", "mcp-server", ""] {
            let err = read(json!({ "sw-kind": value })).unwrap_err();
            let message = err.to_string();
            assert!(message.contains("unknown-kind"), "{message}");
            assert!(message.contains(NOTE), "{message}");
            assert!(message.contains(value), "{message}");
            // The refusal lists what it does know, so the fix is on screen.
            assert!(message.contains("skill"), "{message}");
            assert!(message.contains("plugin"), "{message}");
        }
    }

    #[test]
    fn a_wrong_shaped_kind_is_refused_rather_than_defaulted() {
        let err = read(json!({"sw-kind": ["skill"]})).unwrap_err();
        assert!(err.to_string().contains("sw-kind"), "{err}");
        assert!(err.to_string().contains(NOTE), "{err}");
    }

    #[test]
    fn targets_absent_empty_and_populated_are_three_outcomes() {
        // Absent: every destination.
        let (absent, _) = read(json!({"description": "d"})).unwrap();
        assert_eq!(absent.targets, None);

        // Empty: nowhere. Distinct from absent, and it must stay distinct —
        // reading it as "all" publishes where the author said not to.
        let (empty, _) = read(json!({"sw-targets": []})).unwrap();
        assert_eq!(empty.targets, Some(vec![]));

        // Populated: exactly these.
        let (some, _) = read(json!({"sw-targets": ["claude-code", "portable"]})).unwrap();
        assert_eq!(
            some.targets,
            Some(vec!["claude-code".to_owned(), "portable".to_owned()])
        );

        assert_ne!(absent.targets, empty.targets);
    }

    #[test]
    fn plugin_absent_means_the_callers_default_present_is_typed() {
        // Absent: `None`, and the *caller* supplies the default plugin —
        // folding a default in here would make "said nothing" and "named the
        // default" indistinguishable to the layer that owns the configuration.
        let (absent, _) = read(json!({"description": "d"})).unwrap();
        assert_eq!(absent.plugin, None);

        let (named, foreign) = read(json!({"sw-plugin": "tools"})).unwrap();
        assert_eq!(named.plugin, Some("tools".to_owned()));
        // Consumed, like every key of ours: never an annotation.
        assert!(!foreign.contains_key("sw-plugin"));

        // The key follows the configured stem, as every key of ours does.
        let (ours, foreign) = read_as(&x(), json!({"x-plugin": "tools"})).unwrap();
        assert_eq!(ours.plugin, Some("tools".to_owned()));
        assert!(!foreign.contains_key("x-plugin"));
        // And under the default stem, `x-plugin` is somebody else's key.
        let (ours, foreign) = read(json!({"x-plugin": "tools"})).unwrap();
        assert_eq!(ours.plugin, None);
        assert_eq!(foreign["x-plugin"], json!("tools"));
    }

    #[test]
    fn a_wrong_shaped_plugin_is_refused_never_read_as_the_default() {
        // The same rule as every modeled key of ours: absent and
        // present-but-wrong must not share an outcome. A list here read as
        // "no plugin, so the default" would group a skill into a plugin the
        // author never named.
        let err = read(json!({"sw-plugin": ["tools"]})).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("sw-plugin"), "{message}");
        assert!(message.contains(NOTE), "{message}");

        // A bare number gets the quoting rule, same as the hashes.
        let err = read(json!({"sw-plugin": 2026})).unwrap_err();
        assert!(err.to_string().contains("quote it"), "{err}");
    }

    #[test]
    fn a_scalar_targets_is_refused_not_read_as_everywhere() {
        // The dangerous shape: one destination that would silently become all
        // of them.
        let err = read(json!({"sw-targets": "claude-code"})).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("sw-targets"), "{message}");
        assert!(message.contains("must be a list"), "{message}");

        // A list with a non-string in it is refused whole, not partly lifted.
        let err = read(json!({"sw-targets": ["claude-code", 3]})).unwrap_err();
        assert!(err.to_string().contains("sw-targets"), "{err}");
    }

    #[test]
    fn every_provenance_key_round_trips_into_the_struct() {
        let (ours, foreign) = read(json!({
            "description": "d",
            "sw-source": "~/.claude/skills/review",
            "sw-format": "claude",
            "sw-source-hash": "3f9a",
            "sw-adopted-hash": "b17c",
            "sw-adopted-at": "2026-08-11T09:00:00Z",
            "sw-also-at": ["~/.codex/skills/review", "~/other/review"],
        }))
        .unwrap();

        assert_eq!(
            ours.provenance.source.as_deref(),
            Some("~/.claude/skills/review")
        );
        assert_eq!(ours.provenance.format.as_deref(), Some("claude"));
        assert_eq!(ours.provenance.source_hash.as_deref(), Some("3f9a"));
        assert_eq!(ours.provenance.adopted_hash.as_deref(), Some("b17c"));
        assert_eq!(
            ours.provenance.adopted_at.as_deref(),
            Some("2026-08-11T09:00:00Z")
        );
        assert_eq!(
            ours.provenance.also_at,
            Some(vec![
                "~/.codex/skills/review".to_owned(),
                "~/other/review".to_owned()
            ])
        );
        assert!(!ours.provenance.is_hand_authored());
        // Not one of them was left behind for `annotations`.
        assert_eq!(foreign.keys().collect::<Vec<_>>(), vec!["description"]);
    }

    #[test]
    fn a_note_with_no_provenance_is_hand_authored() {
        let (ours, _) = read(json!({"description": "d", "sw-kind": "skill"})).unwrap();
        assert!(ours.provenance.is_hand_authored());
        assert_eq!(Provenance::default(), ours.provenance);
    }

    #[test]
    fn an_unquoted_all_digit_hash_is_refused_with_the_quoting_rule() {
        // The float trap, caught rather than stored: by the time YAML has
        // typed `1234…` as a number the digest is already gone, so reading it
        // back as a hash would be reading a corrupted one.
        let err = read(json!({"sw-source-hash": 1.2345678901234568e39})).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("sw-source-hash"), "{message}");
        assert!(message.contains("quote it"), "{message}");
    }

    #[test]
    fn a_nested_block_parses_identically_to_the_flat_form() {
        let flat = read(json!({
            "description": "d",
            "sw-kind": "plugin",
            "sw-targets": ["claude-code"],
            "sw-plugin": "tools",
            "sw-source": "/src",
            "sw-format": "claude",
            "sw-source-hash": "3f9a",
            "sw-adopted-hash": "b17c",
            "sw-adopted-at": "2026-08-11",
            "sw-also-at": ["/elsewhere"],
        }))
        .unwrap();

        let nested = read(json!({
            "description": "d",
            "sw": {
                "kind": "plugin",
                "targets": ["claude-code"],
                "plugin": "tools",
                "source": "/src",
                "format": "claude",
                "source-hash": "3f9a",
                "adopted-hash": "b17c",
                "adopted-at": "2026-08-11",
                "also-at": ["/elsewhere"],
            },
        }))
        .unwrap();

        assert_eq!(flat, nested);
        assert_eq!(nested.0.declared_kind, Some(EntityKind::Plugin));
        assert_eq!(nested.0.plugin, Some("tools".to_owned()));
        // The block itself is consumed too, in either direction.
        assert!(!nested.1.contains_key("sw"));
    }

    #[test]
    fn an_empty_nested_block_reads_as_the_defaults() {
        let (ours, foreign) = read(json!({"description": "d", "sw": null})).unwrap();
        assert_eq!(ours, VaultFrontmatter::default());
        assert!(!foreign.contains_key("sw"));

        let (ours, _) = read(json!({"sw": {}})).unwrap();
        assert_eq!(ours, VaultFrontmatter::default());
    }

    #[test]
    fn a_nested_block_that_is_not_a_mapping_is_refused() {
        let err = read(json!({"sw": "skill"})).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("must be a mapping"), "{message}");
        assert!(message.contains(NOTE), "{message}");
    }

    #[test]
    fn both_shapes_on_one_note_is_refused_naming_the_block_and_the_keys() {
        let err = read(json!({
            "description": "d",
            "sw": {"kind": "skill"},
            "sw-targets": ["claude-code"],
            "sw-kind": "skill",
        }))
        .unwrap_err();
        let message = err.to_string();

        assert!(message.contains("mixed-frontmatter-shape"), "{message}");
        assert!(message.contains(NOTE), "{message}");
        assert!(message.contains("`sw:`"), "{message}");
        assert!(message.contains("`sw-kind`"), "{message}");
        assert!(message.contains("`sw-targets`"), "{message}");
        // Both ways out are named.
        assert!(message.contains("Move the flat keys"), "{message}");
        assert!(message.contains("remove the block"), "{message}");
    }

    #[test]
    fn mixing_is_refused_even_when_the_two_shapes_agree() {
        // No reconciliation: agreement is not a licence, because deciding what
        // *agree* means across shapes is the judgement call this avoids.
        let err = read(json!({
            "sw": {"kind": "plugin"},
            "sw-kind": "plugin",
        }))
        .unwrap_err();
        assert!(err.to_string().contains("mixed-frontmatter-shape"), "{err}");

        // And when they carry disjoint fields.
        let err = read(json!({
            "sw": {"kind": "plugin"},
            "sw-source": "/src",
        }))
        .unwrap_err();
        assert!(err.to_string().contains("mixed-frontmatter-shape"), "{err}");
    }

    #[test]
    fn an_unmodeled_ap_key_is_consumed_and_kept_rather_than_refused() {
        // The namespace is claimed wholesale, so a key we do not model yet is
        // still ours: out of the map that becomes `annotations`, and into
        // `unknown_ours` where a caller can see it.
        let (ours, foreign) = read(json!({
            "description": "d",
            "sw-future-field": "value",
            "sw-nested-thing": {"a": 1},
        }))
        .unwrap();

        assert_eq!(ours.unknown_ours["sw-future-field"], json!("value"));
        assert_eq!(ours.unknown_ours["sw-nested-thing"], json!({"a": 1}));
        assert!(!foreign.contains_key("sw-future-field"));
        assert!(!foreign.contains_key("sw-nested-thing"));
        // An unmodeled key is not a wrong-shaped modeled one: no shape rule
        // applies to a field we have no shape for.
        assert_eq!(ours.declared_kind, None);
    }

    #[test]
    fn an_unmodeled_key_in_the_nested_block_is_kept_under_its_flat_spelling() {
        let (ours, _) = read(json!({"sw": {"future-field": "value"}})).unwrap();
        assert_eq!(ours.unknown_ours["sw-future-field"], json!("value"));
    }

    #[test]
    fn foreign_keys_are_left_exactly_where_they_were() {
        let (_, foreign) = read(json!({
            "description": "d",
            "license": "MIT",
            "tags": ["review"],
            "metadata": {"author": "kelly"},
            // Near-misses: neither is inside the namespace.
            "apex": "not ours",
            "kind": "not ours either",
        }))
        .unwrap();

        assert_eq!(foreign["license"], json!("MIT"));
        assert_eq!(foreign["tags"], json!(["review"]));
        assert_eq!(foreign["metadata"], json!({"author": "kelly"}));
        assert_eq!(foreign["apex"], json!("not ours"));
        assert_eq!(foreign["kind"], json!("not ours either"));
        assert_eq!(foreign.len(), 6);
    }

    #[test]
    fn the_predicate_is_the_prefix_and_the_block() {
        let ns = Namespace::default();
        assert!(ns.is_ours("sw-kind"));
        assert!(ns.is_ours("sw-anything-at-all"));
        assert!(ns.is_ours("sw"));
        assert!(!ns.is_ours("apex"));
        assert!(!ns.is_ours("kind"));
        assert!(!ns.is_ours("targets"));
        assert!(!ns.is_ours("TC-KIND"), "the prefix is not case-folded");
    }

    // --- a configured namespace ---------------------------------------------

    /// A vault that configured `x`, which is a stem with nothing in common
    /// with the default — so a test cannot pass by accident.
    fn x() -> Namespace {
        Namespace::new("x").unwrap()
    }

    #[test]
    fn a_configured_stem_parses_its_own_keys_exactly_as_the_default_does() {
        let (ours, foreign) = read_as(
            &x(),
            json!({
                "description": "d",
                "x-kind": "plugin",
                "x-targets": ["claude-code"],
                "x-source": "/src/review",
                "x-format": "claude",
                "x-source-hash": "3f9a",
                "x-adopted-hash": "b17c",
                "x-adopted-at": "2026-08-11",
                "x-also-at": ["/elsewhere"],
                "x-not-modeled-yet": "keep me",
            }),
        )
        .unwrap();

        assert_eq!(ours.declared_kind, Some(EntityKind::Plugin));
        assert_eq!(ours.targets, Some(vec!["claude-code".to_owned()]));
        assert_eq!(ours.provenance.source.as_deref(), Some("/src/review"));
        assert_eq!(ours.provenance.also_at, Some(vec!["/elsewhere".to_owned()]));
        assert_eq!(ours.unknown_ours["x-not-modeled-yet"], json!("keep me"));
        assert_eq!(foreign.keys().collect::<Vec<_>>(), vec!["description"]);

        // Every refusal follows the stem too, naming the key the note carries
        // rather than one it does not.
        let err = read_as(&x(), json!({"x-kind": "skil"})).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("unknown-kind"), "{message}");
        assert!(message.contains("`x-kind`"), "{message}");
        assert!(!message.contains("sw-kind"), "{message}");
    }

    #[test]
    fn in_a_configured_vault_the_default_prefix_is_a_foreign_annotation() {
        // The airtight half of the strip, at the read: `x-` is drained, and
        // `sw-kind` is somebody else's key — carried, not claimed, not typed.
        let (ours, foreign) = read_as(
            &x(),
            json!({
                "description": "d",
                "x-kind": "plugin",
                "sw-kind": "skill",
                "sw-targets": ["claude-code"],
                "sw": {"kind": "skill"},
            }),
        )
        .unwrap();

        assert_eq!(ours.declared_kind, Some(EntityKind::Plugin));
        assert!(ours.unknown_ours.is_empty());
        assert_eq!(foreign["sw-kind"], json!("skill"));
        assert_eq!(foreign["sw-targets"], json!(["claude-code"]));
        assert_eq!(foreign["sw"], json!({"kind": "skill"}));
        assert!(!foreign.contains_key("x-kind"));

        // And the reverse, which is the same bug seen from the other side: in
        // the ordinary vault, a configured vault's keys are foreign.
        let (ours, foreign) = read(json!({"description": "d", "x-kind": "plugin"})).unwrap();
        assert_eq!(ours.declared_kind, None);
        assert_eq!(foreign["x-kind"], json!("plugin"));
    }

    #[test]
    fn the_nested_block_and_the_mixed_shape_refusal_both_follow_the_stem() {
        // The block is the stem, so a configured vault's nested shape parses
        // identically to its flat one — the same property the default has.
        let flat = read_as(&x(), json!({"x-kind": "plugin", "x-source": "/src"})).unwrap();
        let nested = read_as(&x(), json!({"x": {"kind": "plugin", "source": "/src"}})).unwrap();
        assert_eq!(flat, nested);
        assert_eq!(nested.0.declared_kind, Some(EntityKind::Plugin));

        // Mixing is refused between `x-` and `x:`, and the refusal names them.
        let err = read_as(&x(), json!({"x": {"kind": "skill"}, "x-targets": []})).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("mixed-frontmatter-shape"), "{message}");
        assert!(message.contains("`x:`"), "{message}");
        assert!(message.contains("`x-targets`"), "{message}");

        // But `x:` beside `sw-kind` is not a mixed note. `sw-` is not a shape
        // of ours in this vault; it is a key somebody else owns, and refusing
        // it would refuse a note this vault has every right to hold.
        let (ours, foreign) =
            read_as(&x(), json!({"x": {"kind": "plugin"}, "sw-kind": "skill"})).unwrap();
        assert_eq!(ours.declared_kind, Some(EntityKind::Plugin));
        assert_eq!(foreign["sw-kind"], json!("skill"));

        // Symmetrically, `sw:` beside `x-kind` is not mixed either.
        let (ours, foreign) =
            read_as(&x(), json!({"sw": {"kind": "skill"}, "x-kind": "plugin"})).unwrap();
        assert_eq!(ours.declared_kind, Some(EntityKind::Plugin));
        assert_eq!(foreign["sw"], json!({"kind": "skill"}));
    }

    #[test]
    fn the_predicate_agrees_with_what_the_drain_actually_takes() {
        // The bug [`take_from`]'s doc warns against: `is_ours` and `take_from`
        // disagreeing on a key.
        //
        // So: for every key on the way in, "did the drain take it" must equal
        // "does the predicate claim it" — checked under both namespaces, on
        // the same battery of keys, with one shape at a time because carrying
        // both is itself a refusal.
        let battery = |block: &str| {
            json!({
                "description": "d",
                "name": "n",
                "allowed-tools": ["Read"],
                "sw-kind": "skill",
                "sw-not-modeled-yet": "v",
                "x-kind": "skill",
                "x-not-modeled-yet": "v",
                "apex": "near miss",
                "xylophone": "near miss",
                "kind": "no prefix at all",
                "TC-KIND": "not case-folded",
                block: {"kind": "skill"},
            })
        };

        for (ns, block) in [(Namespace::default(), "x"), (x(), "sw")] {
            // The block key belongs to the *other* namespace each time, so a
            // nested block that is not ours has to stay foreign as well.
            let before = fields(battery(block));
            let mut after = before.clone();
            VaultFrontmatter::take_from(&mut after, Path::new(NOTE), &ns).unwrap();

            for key in before.keys() {
                assert_eq!(
                    !after.contains_key(key),
                    ns.is_ours(key),
                    "`{key}` under `{}`: the drain and the predicate disagree",
                    ns.prefix()
                );
            }
            // Nothing was invented, and nothing survived with a changed value.
            for (key, value) in &after {
                assert_eq!(before.get(key), Some(value), "`{key}` was rewritten");
            }
        }

        // And the nested shape, where the drain removes one key and the
        // predicate has to claim exactly that one.
        for (ns, block) in [(Namespace::default(), "sw"), (x(), "x")] {
            let before = fields(json!({ "description": "d", block: {"kind": "skill"} }));
            let mut after = before.clone();
            let ours = VaultFrontmatter::take_from(&mut after, Path::new(NOTE), &ns).unwrap();

            assert_eq!(ours.declared_kind, Some(EntityKind::Skill));
            for key in before.keys() {
                assert_eq!(!after.contains_key(key), ns.is_ours(key), "`{key}`");
            }
        }
    }

    #[test]
    fn absent_arguments_is_an_empty_list() {
        let (ours, _) = read(json!({"description": "d"})).unwrap();
        assert_eq!(ours.arguments, Vec::new());
    }

    #[test]
    fn a_minimal_argument_round_trips() {
        let (ours, foreign) = read(json!({
            "description": "d",
            "sw-arguments": [{"name": "pr-number"}],
        }))
        .unwrap();
        assert_eq!(
            ours.arguments,
            vec![Argument {
                name: "pr-number".into(),
                description: None,
                required: false,
                values: None,
                default: None,
            }]
        );
        assert!(
            !foreign.contains_key("sw-arguments"),
            "consumed like every key of ours"
        );
    }

    #[test]
    fn every_field_on_an_argument_round_trips() {
        let (ours, _) = read(json!({
            "description": "d",
            "sw-arguments": [{
                "name": "format",
                "description": "Output format",
                "required": true,
                "values": ["markdown", "json"],
                "default": "markdown",
            }],
        }))
        .unwrap();
        assert_eq!(
            ours.arguments,
            vec![Argument {
                name: "format".into(),
                description: Some("Output format".into()),
                required: true,
                values: Some(vec!["markdown".into(), "json".into()]),
                default: Some("markdown".into()),
            }]
        );
    }

    #[test]
    fn several_arguments_keep_declaration_order() {
        let (ours, _) = read(json!({
            "description": "d",
            "sw-arguments": [{"name": "first"}, {"name": "second"}, {"name": "third"}],
        }))
        .unwrap();
        let names: Vec<&str> = ours.arguments.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, vec!["first", "second", "third"]);
    }

    #[test]
    fn arguments_not_a_list_is_malformed() {
        let err = read(json!({"description": "d", "sw-arguments": "pr-number"})).unwrap_err();
        assert!(err.to_string().contains("sw-arguments"), "{err}");
        assert!(
            err.to_string().contains("list of argument objects"),
            "{err}"
        );
    }

    #[test]
    fn an_entry_not_a_mapping_is_malformed() {
        let err = read(json!({"description": "d", "sw-arguments": ["pr-number"]})).unwrap_err();
        assert!(err.to_string().contains("mappings"), "{err}");
    }

    #[test]
    fn an_entry_missing_name_is_malformed() {
        let err =
            read(json!({"description": "d", "sw-arguments": [{"description": "d"}]})).unwrap_err();
        assert!(err.to_string().contains("missing `name`"), "{err}");
    }

    #[test]
    fn an_unrecognised_key_on_an_entry_is_malformed() {
        let err = read(json!({
            "description": "d",
            "sw-arguments": [{"name": "a", "descripton": "typo"}],
        }))
        .unwrap_err();
        assert!(err.to_string().contains("descripton"), "{err}");
    }

    #[test]
    fn a_name_that_is_not_a_slug_is_refused() {
        for bad in [
            "PR Number",
            "pr_number",
            "-leading",
            "trailing-",
            "",
            "a--b",
        ] {
            let err = read(json!({
                "description": "d",
                "sw-arguments": [{"name": bad}],
            }))
            .unwrap_err();
            let message = err.to_string();
            assert!(message.contains("invalid-arguments"), "{bad}: {message}");
            assert!(message.contains("not a slug"), "{bad}: {message}");
        }
    }

    #[test]
    fn an_empty_values_list_is_refused() {
        let err = read(json!({
            "description": "d",
            "sw-arguments": [{"name": "format", "values": []}],
        }))
        .unwrap_err();
        let message = err.to_string();
        assert!(message.contains("invalid-arguments"), "{message}");
        assert!(message.contains("empty list"), "{message}");
    }

    #[test]
    fn a_default_outside_values_is_refused() {
        let err = read(json!({
            "description": "d",
            "sw-arguments": [{
                "name": "format",
                "values": ["markdown", "json"],
                "default": "yaml",
            }],
        }))
        .unwrap_err();
        let message = err.to_string();
        assert!(message.contains("invalid-arguments"), "{message}");
        assert!(message.contains("`default`"), "{message}");
        assert!(message.contains("yaml"), "{message}");
    }

    #[test]
    fn a_default_matching_one_of_values_is_accepted() {
        let (ours, _) = read(json!({
            "description": "d",
            "sw-arguments": [{
                "name": "format",
                "values": ["markdown", "json"],
                "default": "json",
            }],
        }))
        .unwrap();
        assert_eq!(ours.arguments[0].default.as_deref(), Some("json"));
    }

    #[test]
    fn a_duplicate_name_is_refused() {
        let err = read(json!({
            "description": "d",
            "sw-arguments": [{"name": "format"}, {"name": "format"}],
        }))
        .unwrap_err();
        let message = err.to_string();
        assert!(message.contains("invalid-arguments"), "{message}");
        assert!(message.contains("more than once"), "{message}");
    }

    #[test]
    fn arguments_follow_the_configured_stem_like_every_key_of_ours() {
        let (ours, foreign) = read_as(
            &x(),
            json!({"description": "d", "x-arguments": [{"name": "pr-number"}]}),
        )
        .unwrap();
        assert_eq!(ours.arguments.len(), 1);
        assert!(!foreign.contains_key("x-arguments"));

        // And under the default stem, `x-arguments` is somebody else's key.
        let (ours, foreign) = read(json!({"x-arguments": [{"name": "pr-number"}]})).unwrap();
        assert!(ours.arguments.is_empty());
        assert!(foreign.contains_key("x-arguments"));
    }
}

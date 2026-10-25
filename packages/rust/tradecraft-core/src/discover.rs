//! Discovery — every publishable note under a skills root, found and vetted.
//!
//! The scan every marketplace verb stands on:
//! `build` renders what this returns, `check` compares it, `status` lists it.
//! The rules here are the definition of *publishable*, so a note this module
//! refuses is refused everywhere at once rather than differently per verb.
//!
//! # This is not [`crate::scan`]
//!
//! The corpus scan walks arbitrary registered roots looking for **published**
//! `SKILL.md` files, never fails, and lists broken skills so a user can find
//! them. This walks one curated tree of **vault notes**, and it refuses:
//! a skills root feeds a publish, and a scan that shrugged past a duplicate
//! name or a symlink would surface the problem as a wrong marketplace instead
//! of a sentence naming the note.
//!
//! # The shapes
//!
//! Where a note sits decides what it is. A kind folder ([`KIND_DIRS`]) names
//! what it holds, and each thing it holds is a note or a folder with its note
//! inside:
//!
//! | Path | Read as |
//! |---|---|
//! | `<kind-dir>/<name>.md` | a component of that kind |
//! | `<kind-dir>/<name>/<name>.md` | the same, carrying the files beside it |
//! | `skills/<name>/SKILL.md` | a skill carrying files, named by its folder |
//!
//! Containers repeat the pattern one level down, so
//! `marketplaces/<m>/plugins/<p>/skills/<s>.md` is the full shape. A note
//! that is not under a kind folder is a resource or the author's own writing.
//!
//! This is layer 3 of the kind decision's four: a note's own `ap-kind`
//! outranks whatever the folder said. Every component reports which layer
//! answered, so a note that overruled its folder is visible as having done
//! so.
//!
//! # What *declared* means
//!
//! A component declares `description`. That key alone is the opt-in: a note
//! without it — prose, a bundle resource, a draft — is skipped without
//! comment, and that silence is what lets resources live beside their entry
//! note. `name` is optional and defaults to the filename, slugified, which is
//! the answer [`crate::vault::read_vault_skill`] already gives a single-note
//! publish.
//!
//! `name` without `description` also opts in: the note is admitted with
//! [`MISSING_DESCRIPTION`] and named in [`DiscoveryReport::warnings`].
//! Defaulting the description for a note with neither key would make every
//! note in the tree a component. A note that declares a description but sits
//! at no shape is refused, and told where a component can live — dropping it
//! silently is the failure this reader exists to avoid.
//!
//! # Every kind, not only skills
//!
//! The scan returns plugins, commands and agents alongside skills, because a
//! workbench has to list a command and say what it is. The marketplace render
//! is unaffected: [`crate::export`] filters to [`EntityKind::Skill`] before it
//! renders; [`crate::publish`] takes each kind by its own route.
//!
//! # Validation
//!
//! The skills-spec name rule (≤64, `^[a-z0-9]+(-[a-z0-9]+)*$`) for component
//! and plugin names, the 1024-character description cap, the 500-character
//! compatibility cap, the `<name>/<name>.md` bundle rule, bundle overlap
//! refused, symlinks refused.
//! Beyond those:
//!
//! * **A declared `name` need not match the filename.** The filename decides
//!   the name when frontmatter declares none; when frontmatter declares one, it
//!   wins — the same answer [`crate::publish`] gives. Two components still
//!   cannot publish onto one directory: that is the uniqueness key below.
//!
//! * **Names are unique per plugin and kind**, not across the whole scan: a
//!   plugin may hold both a `review` command and a `review` skill, which are
//!   two directories. What still cannot happen is two components publishing
//!   onto one.
//!
//! * **Targets validate against [`KNOWN_TARGETS`]** — the names this
//!   build publishes to — and the key is `ap-targets` read through
//!   [`VaultFrontmatter`], not a bare `skill-targets`. With that key comes the
//!   core's contract: absent means every destination, an empty list means
//!   nowhere, and a scalar is refused rather than comma-split — the shape rules
//!   [`crate::frontmatter`] already enforces on every read.
//! * **An unknown `ap-kind` is refused.** That is [`crate::frontmatter`]'s rule
//!   arriving with the reader: a typo that quietly unpublished a note is the
//!   outcome the closed kind vocabulary exists to prevent.
//! * **An empty or wrong-shaped `ap-plugin` is refused.** An absent key and a
//!   present-but-wrong key must not share an outcome; delete the key to mean
//!   the default.
//! * **[`slugify`] folds ASCII only**, with no NFKD normalisation: `Café.md`
//!   cannot carry `name: cafe`, and the fix is to name the file in the name's
//!   own alphabet. Unicode normalisation tables are a dependency this crate
//!   does not otherwise need.
//!
//! # Deterministic, like every report in this crate
//!
//! Directory entries are sorted before descent, results are sorted by name,
//! and nothing reads a clock or iterates a hash map — two runs over one tree
//! return byte-identical results, which is what lets `check` compare a
//! marketplace against a fresh discovery at all.
//!
//! # Symlinks are refused, as far as the host can see them
//!
//! A link inside a skills source reads as inside the tree and resolves
//! outside it; a bundle copied file-by-file would silently flatten it into
//! whatever it pointed at. The walk asks [`Vfs::is_symlink`] about every
//! entry and refuses `unsafe-path` on the first hit. On a host whose `Vfs`
//! cannot see links — [`crate::MemVfs`], the wasm bridge over a host object
//! without link methods — the method's
//! default answers `false` and the refusal cannot fire; that is the honest
//! floor, the same one [`Vfs::canonicalize`]'s lexical default sets for the
//! publish guard.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::CoreError;
use crate::frontmatter::{
    ContainerIdentity, EntityKind, KindHints, KindSource, VaultFrontmatter, resolve_kind,
};
use crate::namespace::Namespace;
use crate::publish::KNOWN_TARGETS;
use crate::skill::{forward_slashed, read_utf8, split_frontmatter};
use crate::vault::frontmatter_map;
use crate::vfs::Vfs;

/// One component, as discovery hands it to the verbs.
///
/// `targets` keeps the three-outcome `ap-targets` reading instead of being
/// expanded to an explicit all-targets list, so the layer that knows what
/// "every destination" means today is the one that decides it.
// No `Eq`: `identity` carries free-shaped JSON for the two manifest fields
// whose dialects allow an object, and `serde_json::Value` is only `PartialEq`
// because it can hold a float. Nothing keys a map or a set on a whole
// component — uniqueness is keyed on `(marketplace, plugin, kind, name)`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DiscoveredComponent {
    /// The frontmatter `name`, already validated against the Agent Skills spec.
    pub name: String,
    /// The frontmatter `description`, ≤1024 characters, or
    /// [`MISSING_DESCRIPTION`] when the note wrote none.
    pub description: String,
    /// `description` is [`MISSING_DESCRIPTION`], not the note's own.
    #[serde(default)]
    pub description_filled: bool,
    /// What this component is, resolved across the layers that can decide it.
    pub kind: EntityKind,
    /// Which layer produced [`Self::kind`], straight from
    /// [`crate::frontmatter::resolve_kind`].
    pub kind_source: KindSource,
    /// What the structure said this was, before frontmatter was read. `None`
    /// where structure said nothing — a component at the root has no folder
    /// above it naming a kind.
    ///
    /// Kept beside the resolved value rather than discarded so a caller can
    /// tell "the folder and the note agree" from "the note overruled the
    /// folder".
    pub folder_kind: Option<EntityKind>,
    /// `ap-targets` exactly as [`VaultFrontmatter::targets`] read it, every
    /// name checked against [`KNOWN_TARGETS`]. `None` is absent — every
    /// destination; `Some(vec![])` is nowhere.
    pub targets: Option<Vec<String>>,
    /// The plugin holding this component. `None` is a bare component, sitting
    /// at the root and belonging to no plugin.
    ///
    /// The containing folder decides it and `ap-plugin` overrules it. Where a
    /// marketplace needs every skill under *some* plugin directory,
    /// [`crate::export`] supplies the configured default — that is a
    /// publication concern, not a fact about the vault.
    pub plugin: Option<String>,
    /// The plugin the folder put it in, before `ap-plugin` was read.
    pub folder_plugin: Option<String>,
    /// The marketplace this belongs to — the directory holding the `plugins/`
    /// folder it sits under. `None` only for a marketplace's own note.
    ///
    /// Structural, with no frontmatter counterpart. `ap-kind` and `ap-plugin`
    /// exist because a note may reasonably disagree with where it sits about
    /// *what* it is or *which pack* it joins; disagreeing about which
    /// distribution it ships in is a move, not an annotation, and a key that
    /// let a note claim another marketplace would let it claim one whose
    /// directory does not exist.
    pub marketplace: Option<String>,
    /// Absolute path of the entry note.
    pub entry_path: PathBuf,
    /// The directory this component owns — everything under it ships with a
    /// skill. `None` for a lone note, which travels alone.
    pub bundle_root: Option<PathBuf>,
    /// Files this component owns, relative to [`Self::bundle_root`] and
    /// forward-slashed, sorted.
    ///
    /// Ownership is *deepest* directory wins, so a plugin holding
    /// `skills/code-review/scripts/check.py` does not claim it —
    /// `code-review` does. Without that rule a plugin reads as a flat dump of
    /// its own subtree.
    pub resources: Vec<String>,
    /// The entry's path relative to the vault root, forward-slashed — the
    /// spelling reports and provenance markers print.
    pub vault_relative_path: String,
    /// A hook note's routing and payload, as a reader of the tree needs them:
    /// `None` on every other kind.
    ///
    /// Carried here because a hook's file name says nothing about what fires
    /// it — a lister that only had the name would have to open each note to
    /// tell one hook from another.
    #[serde(default)]
    pub hook: Option<DiscoveredHook>,
    /// The manifest fields this note publishes under, read from its own
    /// frontmatter.
    ///
    /// Carried for every kind and consulted for two: a marketplace note names
    /// the distribution, a plugin note names the pack. A skill's is silent in
    /// every vault worth having, because a skill's manifest entry is derived
    /// from the skill and a second spelling of it could only disagree.
    ///
    /// Surfaced here rather than left in the note because the scan is the only
    /// pass that reads a container note at all — [`crate::export`] renders
    /// from what discovery hands it and never opens a file of its own.
    pub identity: ContainerIdentity,
}

/// What a hook note routes on and what it runs, summarised for a listing.
///
/// A summary, not the projection: [`crate::projection::to_adapt_hook`] stays
/// the authority on what a hook renders to and on every refusal. This reads
/// the same keys with none of the refusals, because a tree has to draw a
/// half-written hook too.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveredHook {
    /// `event` — what fires the hook. `None` where the note names none, which
    /// the projection refuses and a listing still has to show.
    pub event: Option<String>,
    /// `matcher` — pipe-delimited tool names. `None` matches every tool.
    pub matcher: Option<String>,
    /// `type`, defaulted to `command` exactly as the projection defaults it.
    /// An unrecognised spelling is carried verbatim; naming it a typo is the
    /// projection's job.
    pub hook_type: String,
    /// The `command`, `prompt` or `url` this hook runs, whichever its type
    /// licenses — the key when the note writes one, otherwise the body's
    /// first non-empty line, which is where a `command` or `prompt` hook may
    /// instead put it. `None` for `mcp_tool` and `agent`, which carry their
    /// payload elsewhere.
    pub payload: Option<String>,
}

/// What one scan found, and what it could not read.
///
/// Two lists rather than a `Result`, because a vault is a shared tree and a
/// note nobody else owns must not decide whether everybody else's publish
/// runs. Every caller reads both: the components are the roster, and
/// [`Self::skipped`] is the part of the vault this answer does not cover.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DiscoveryReport {
    /// Every publishable note, sorted by name.
    pub components: Vec<DiscoveredComponent>,
    /// Every note the scan could not read, in path order.
    pub skipped: Vec<SkippedNote>,
    /// Notes admitted with something filled in for them, in path order.
    #[serde(default)]
    pub warnings: Vec<DiscoveryWarning>,
}

/// The description a component gets when its note names itself but writes no
/// `description`. [`DiscoveryReport::warnings`] names every note it stands in
/// for; `marketplace.require_descriptions` refuses the build instead.
pub const MISSING_DESCRIPTION: &str = "No description provided.";

/// The warning reason naming a note published with [`MISSING_DESCRIPTION`].
pub const MISSING_DESCRIPTION_REASON: &str = "missing-description";

/// One note the scan admitted, with what it filled in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveryWarning {
    /// Vault-relative and forward-slashed, as [`SkippedNote::path`].
    pub path: String,
    /// A closed-set token: `missing-description` from the scan;
    /// [`crate::export`] adds `missing-version` for a plugin.
    pub reason: String,
    /// Extra detail for a person to read.
    pub detail: String,
}

/// One note the scan could not read, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkippedNote {
    /// The note's path relative to the vault root, forward-slashed — the same
    /// spelling every other report prints.
    pub path: String,
    /// A closed-set reason token. The refusals that already carry one keep it
    /// (`unknown-target`, `unknown-kind`); everything else — frontmatter that
    /// will not parse, a name the Agent Skills spec does not admit, an unreadable file —
    /// is `unreadable-note`, the vocabulary's entry for "this note does not
    /// parse", which had none before.
    pub reason: String,
    /// The sentence naming what is wrong, as the error stated it.
    pub detail: String,
    /// The pack this note would have joined: its own `ap-plugin` where the
    /// read got far enough to see that key, else the plugin folder holding
    /// it.
    ///
    /// A pack publish checks its own members against this. The publish spec forbids
    /// installing a subset silently, and a member declaring `ap-plugin` from
    /// outside the pack's folder is still a member — so the declared key is
    /// consulted first and the folder is the floor beneath it. `None` where
    /// neither answers: the note joins no pack, and no pack is blocked.
    pub plugin: Option<String>,
}

impl SkippedNote {
    fn new(vault_root: &Path, entry_path: &Path, plugin: Option<String>, err: &CoreError) -> Self {
        let detail = err.to_string();
        // `CoreError::refused` puts the token first, `<token>: <prose>`. Every
        // other error is a content problem with no token of its own.
        // A rail that predates the vocabulary carries prose alone, so the
        // prefix only counts as a token when it is shaped like one.
        let reason = match err {
            CoreError::Refused(message) => message
                .split_once(": ")
                .map(|(token, _)| token)
                .filter(|token| {
                    !token.is_empty()
                        && token
                            .bytes()
                            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
                })
                .unwrap_or("unreadable-note")
                .to_owned(),
            _ => "unreadable-note".to_owned(),
        };
        Self {
            path: entry_path
                .strip_prefix(vault_root)
                .map(forward_slashed)
                .unwrap_or_else(|_| entry_path.display().to_string()),
            reason,
            detail,
            plugin,
        }
    }
}

/// Walks `content_root` (the vault root when `None`) and returns every
/// publishable note, sorted by name.
///
/// `ns` is the vault's frontmatter namespace, the same value every other
/// reader takes — a note whose `ap-targets` this scan validated must be the
/// note whose `ap-targets` the publish reads, or the two disagree about where
/// it goes.
///
/// The content root must lie inside the vault. A root outside it has no
/// vault-relative spelling for its notes, and a provenance marker naming `../`
/// paths would point at files the vault does not own.
///
/// # A bad note stops itself, not the scan
///
/// Everything wrong with *one* note — an illegal name, an over-long
/// description, an `ap-targets` this build does
/// not know, a declared note at no recognised shape, frontmatter that will
/// not parse — lands in [`DiscoveryReport::skipped`] and the walk carries on.
/// One person's half-written draft must not block everybody else's publish.
/// A `name` with no `description` is not wrong enough to skip: the note is
/// admitted with [`MISSING_DESCRIPTION`] and named in
/// [`DiscoveryReport::warnings`].
///
/// What stays run-level is what is *not* a fact about one note: a duplicate
/// name and a bundle overlap are two-note diagnoses that have to name both
/// parties, and a symlink is a safety rail that fires before a note is read.
///
/// # Errors
///
/// * [`CoreError::RootNotFound`] — the content root does not exist.
/// * `refused: unsafe-path` — a symlink anywhere in the source.
/// * `refused: path-collision` — a duplicate skill name, or a bundle that
///   contains another skill's entry.
pub fn discover_components(
    vfs: &dyn Vfs,
    vault_root: &Path,
    content_root: Option<&Path>,
    ns: &Namespace,
) -> Result<DiscoveryReport, CoreError> {
    let root = content_root
        .map(Path::to_path_buf)
        .unwrap_or_else(|| vault_root.to_path_buf());
    if !vfs.exists(&root) {
        return Err(CoreError::RootNotFound(root));
    }

    let mut files = Vec::new();
    walk(vfs, &root, &mut files)?;

    // Structure first, over the whole file set: a note's shape depends on what
    // sits beside it, so no single path can be classified on its own.
    let placed = place(&root, &files);

    let mut discovered = Vec::new();
    let mut skipped = Vec::new();
    let mut warnings = Vec::new();
    for entry_path in &files {
        let Some(placement) = placed.get(entry_path) else {
            // Outside every marketplace this is simply the author's own vault,
            // and a note there is not a malformed component however it is
            // shaped. Only inside a marketplace is a declared note at an
            // unrecognised path a mistake worth naming.
            if under_a_kind_folder(&root, entry_path)
                && let Err(err) = refuse_stray(vfs, &root, entry_path, ns)
            {
                // A stray sits at no recognised shape, so it is a member of
                // nothing and blocks no pack.
                skipped.push(SkippedNote::new(vault_root, entry_path, None, &err));
            }
            continue;
        };
        match read_source(vfs, vault_root, entry_path, placement, &placed, &files, ns) {
            Ok(Some(component)) => {
                if component.description_filled {
                    warnings.push(DiscoveryWarning {
                        path: component.vault_relative_path.clone(),
                        reason: MISSING_DESCRIPTION_REASON.to_owned(),
                        detail: format!(
                            "`{}` has a `name` and no `description`; published with \
                             \"{MISSING_DESCRIPTION}\"",
                            component.name
                        ),
                    });
                }
                discovered.push(component);
            }
            Ok(None) => {}
            Err(err) => {
                // Where the note said which pack it belongs to, that answer
                // decides — a member declaring `ap-plugin` from outside the
                // pack's folder is still a member, and a pack that shipped
                // without it would be a silent subset.
                let plugin =
                    declared_plugin(vfs, entry_path, ns).or_else(|| placement.plugin.clone());
                skipped.push(SkippedNote::new(vault_root, entry_path, plugin, &err));
            }
        }
    }

    // Duplicates before overlaps, both across the whole scan: each is a
    // two-note diagnosis, and it has to name both notes — which is why these
    // run after collection rather than inside the walk.
    //
    // Uniqueness is per (marketplace, plugin, kind, name), not per name.
    // Global uniqueness was right when a skill was the only kind and every
    // skill landed in one flat marketplace directory. It is wrong now: a
    // plugin's `review` command and its `review` skill are two directories,
    // and two plugins may each hold a `review`. What still cannot happen is
    // two components publishing onto one directory, which is exactly this key.
    type PublishKey<'a> = (Option<&'a str>, Option<&'a str>, EntityKind, &'a str);
    let mut by_key: BTreeMap<PublishKey, &DiscoveredComponent> = BTreeMap::new();
    for component in &discovered {
        let key = (
            component.marketplace.as_deref(),
            component.plugin.as_deref(),
            component.kind,
            component.name.as_str(),
        );
        if let Some(first) = by_key.get(&key) {
            return Err(CoreError::refused(
                "path-collision",
                format!(
                    "duplicate {} name `{}` in {}: {}, {} — two components cannot publish onto \
                     one directory",
                    component.kind.as_str(),
                    component.name,
                    component
                        .plugin
                        .as_deref()
                        .map_or_else(|| "no plugin".to_owned(), |p| format!("plugin `{p}`")),
                    first.vault_relative_path,
                    component.vault_relative_path
                ),
            ));
        }
        by_key.insert(key, component);
    }
    for outer in &discovered {
        // A container's directory holds the level below it by design, so that
        // is not an overlap. The invariant this protects is a *shipping* one:
        // everything under a skill's own directory travels with it, so an
        // entry inside another entry's would publish twice.
        if outer.kind.holds_components() {
            continue;
        }
        let Some(bundle) = outer.bundle_root.as_deref() else {
            continue;
        };
        for inner in &discovered {
            if inner.entry_path != outer.entry_path && inner.entry_path.starts_with(bundle) {
                return Err(CoreError::refused(
                    "path-collision",
                    format!(
                        "component bundles cannot overlap: {} contains {} — everything under a \
                         bundle ships with it, so an inner component would publish twice",
                        outer.vault_relative_path, inner.vault_relative_path
                    ),
                ));
            }
        }
    }

    // Keys are unique by the check above, so this order is total.
    discovered.sort_by(|a, b| {
        (&a.name, a.kind.as_str(), &a.plugin).cmp(&(&b.name, b.kind.as_str(), &b.plugin))
    });
    // `skipped` and `warnings` are already in path order: `walk` sorts every
    // directory before it descends, and nothing has reordered the file list
    // since.
    Ok(DiscoveryReport {
        components: discovered,
        skipped,
        warnings,
    })
}

/// A note at no recognised shape, which declares itself a component anyway.
///
/// Silence is right for the ordinary case: resources live beside their entry
/// and declare nothing, and a scan that commented on every one of them would
/// be unusable. But a note carrying a `description` is a note somebody
/// authored to be published, and dropping it without a word is the failure
/// mode this whole reader exists to avoid. Name it, and say where it would
/// have to sit.
fn refuse_stray(
    vfs: &dyn Vfs,
    skills_root: &Path,
    entry_path: &Path,
    ns: &Namespace,
) -> Result<(), CoreError> {
    let markdown = entry_path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md"));
    if !markdown {
        return Ok(());
    }
    let source = read_utf8(vfs, entry_path)?;
    let (frontmatter, _body) = split_frontmatter(&source);
    let mut fields = frontmatter_map(frontmatter, entry_path)?;
    // Drained for its refusals — an unknown `ap-kind` on a stray note is still
    // a typo worth naming, and it names itself better than the shape does.
    VaultFrontmatter::take_from(&mut fields, entry_path, ns)?;

    if trimmed_string(&fields, "description").is_none() {
        return Ok(());
    }

    let dirs: Vec<&str> = KIND_DIRS.iter().map(|(dir, _)| *dir).collect();
    let relative = entry_path
        .strip_prefix(skills_root)
        .map(forward_slashed)
        .unwrap_or_else(|_| entry_path.display().to_string());
    Err(CoreError::malformed(
        entry_path,
        format!(
            "`{relative}` declares a `description` but sits where no component can \
             be read. A component is `<name>.md` or `<name>/<name>.md` directly inside a kind \
             folder (`{}`), and a skill may use `<name>/SKILL.md`. A kind folder sits at the \
             root or inside whatever the folder above it holds — \
             `marketplaces/<name>/plugins/<name>/skills/<name>.md` is the full shape",
            dirs.join("`, `")
        ),
    ))
}

/// The folder a plugin puts each kind in.
///
/// This map IS the structural rule. A plugin's own layout says what each of
/// its folders holds, so nothing inside has to declare a kind — and a reader
/// that knows the map can name a component the author never annotated.
///
/// Order is the order a tree lists them, which is the order
/// [`EntityKind::KNOWN`] does not use: `KNOWN` sorts alphabetically for
/// refusal messages, this is the layout.
pub const KIND_DIRS: &[(&str, EntityKind)] = &[
    ("marketplaces", EntityKind::Marketplace),
    ("plugins", EntityKind::Plugin),
    ("skills", EntityKind::Skill),
    ("commands", EntityKind::Command),
    ("agents", EntityKind::Agent),
    ("hooks", EntityKind::Hook),
];

/// What the folders say about one note, without scanning the whole vault.
///
/// Every field is `None` where structure said nothing, and none of them is a
/// default: this is the *structural* half of the answer, which a caller ranks
/// against the note's own frontmatter ([`crate::frontmatter::resolve_kind`]
/// for the kind, `ap-plugin` over [`Self::plugin`] for the pack).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FolderPlacement {
    /// The kind folder above the note. `None` means none is, so the note's own
    /// `ap-kind` — or the default — decides. Never a claim that it is a skill.
    pub kind: Option<EntityKind>,
    /// The marketplace whose tree this sits in. `None` for a component
    /// promoted above every marketplace, and for a marketplace's own note.
    pub marketplace: Option<String>,
    /// The plugin directory holding it, before `ap-plugin` is read.
    pub plugin: Option<String>,
}

/// What structure says one note is, without scanning the whole vault.
///
/// The same rule [`discover_components`] applies, for a caller holding a
/// single path — [`crate::publish`] is one, because a publish is handed one
/// note and must not guess `skill` for a note the folders already named
/// something else; a workbench reading one note for a detail view is another,
/// and it needs the two levels above as well or its detail screen contradicts
/// its own tree.
///
/// It *is* that rule, not a second reading of it: the kind folder above a note
/// names the note, so `classify` answers this from the path alone.
pub fn folder_placement(content_root: &Path, entry: &Path) -> FolderPlacement {
    let Ok(rest) = entry.strip_prefix(content_root) else {
        return FolderPlacement::default();
    };
    let parts: Vec<String> = rest
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    match classify(content_root, &parts) {
        None => FolderPlacement::default(),
        Some(placement) => FolderPlacement {
            kind: placement.kind,
            marketplace: placement.marketplace,
            plugin: placement.plugin,
        },
    }
}

/// Just the kind, for the callers that rank only that.
///
/// Expressed through [`folder_placement`] rather than beside it: two functions
/// reading the same structure are two chances to read it differently.
pub fn folder_kind(content_root: &Path, entry: &Path) -> Option<EntityKind> {
    folder_placement(content_root, entry).kind
}

/// Does this path pass through a kind folder at all?
///
/// The scan's standing to complain: inside one, a declared note at an
/// unrecognised path is a mistake worth naming; outside one the vault is
/// simply the author's.
fn under_a_kind_folder(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root).is_ok_and(|rest| {
        rest.iter()
            .any(|part| kind_dir(&part.to_string_lossy()).is_some())
    })
}

/// The kind a folder name declares, or `None` for any other folder.
fn kind_dir(name: &str) -> Option<EntityKind> {
    KIND_DIRS
        .iter()
        .find(|(dir, _)| *dir == name)
        .map(|(_, kind)| *kind)
}

/// Where structure puts a note, before any frontmatter is read.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Placement {
    name: String,
    /// What structure says this is, or `None` where structure says nothing.
    kind: Option<EntityKind>,
    /// The marketplace this sits in. `None` for a marketplace itself, and for
    /// a component whose kind folders start at the content root.
    marketplace: Option<String>,
    plugin: Option<String>,
    /// The directory this component owns, or `None` for a lone file.
    dir: Option<PathBuf>,
}

/// Reads the paths as components, using structure alone.
///
/// The shapes are the module docs' table; everything else is a resource
/// belonging to whichever component directory contains it. The plugin's own
/// note is the `<name>/<name>.md` shape; what separates it from a bare
/// component is only whether a kind folder sits beside it.
///
/// # The rule cannot name a bare component's kind
///
/// Nothing sits above `<name>.md` at the root to say what it is, so
/// [`Placement::kind`] is `None` and the note's own `ap-kind` — or the
/// default — decides. A directory at the root holding files but no kind
/// folder has the same problem, and it is the rule's weak point: a plugin
/// with no components yet is shaped exactly like a bare component that
/// carries resources.
fn place(root: &Path, files: &[PathBuf]) -> BTreeMap<PathBuf, Placement> {
    let mut placed = BTreeMap::new();
    for path in files {
        let Ok(rest) = path.strip_prefix(root) else {
            continue;
        };
        let parts: Vec<String> = rest
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        if let Some(placement) = classify(root, &parts) {
            placed.insert(path.clone(), placement);
        }
    }
    placed
}

/// One path, read as the alternation the tree is.
///
/// Every level is spelled the same way — a kind folder naming what it holds,
/// then the thing it holds — so this is a loop rather than one arm per depth,
/// and a level added to [`KIND_DIRS`] needs no code here at all:
///
/// ```text
/// marketplaces/acme/plugins/core/skills/review/review.md
///  \_________/ \__/ \_____/ \__/ \____/ \____/ \_______/
///     kind      name   kind  name  kind   name    entry
/// ```
///
/// A kind folder names its contents, so a container's kind is *read* rather
/// than inferred from what it holds — which is what makes promotion work.
/// `skills/` at the root, inside a marketplace, or inside a plugin is one
/// folder meaning one thing; only how widely the skill is shared changes.
///
/// Two terminal shapes, the two every level already used:
///
/// * `<kind>/<name>.md` — a component that travels alone.
/// * `<kind>/<name>/<name>.md` — a component that owns its directory, and so
///   carries what is inside it. For a plugin or a marketplace, what is inside
///   it is the next level down. A skill's entry may also be
///   `<name>/SKILL.md`, named by its folder.
///
/// `None` for anything else, which is most of a vault.
fn classify(root: &Path, parts: &[String]) -> Option<Placement> {
    // The containers passed through on the way in, so a component can name the
    // plugin and the marketplace it belongs to however deep it sits.
    let mut chain: Vec<(EntityKind, String)> = Vec::new();
    let mut dir = root.to_path_buf();
    let mut i = 0;

    while i + 1 < parts.len() {
        let kind = kind_dir(&parts[i])?;
        let name = &parts[i + 1];

        // `<kind>/<name>.md` — the entry travels alone.
        if i + 2 == parts.len() {
            return Some(placement(md_stem(name)?.to_owned(), kind, &chain, None));
        }
        // `<kind>/<name>/<name>.md` — the entry owns the directory it is in.
        if i + 3 == parts.len() && is_entry(&parts[i + 2], name, kind) {
            let owned = dir.join(&parts[i]).join(name);
            return Some(placement(name.clone(), kind, &chain, Some(owned)));
        }

        // Neither: descend through this container into the next kind folder.
        chain.push((kind, name.clone()));
        dir = dir.join(&parts[i]).join(name);
        i += 2;
    }
    None
}

/// The entry file a skill may use in place of `<name>.md`, named by its folder.
pub const SKILL_ENTRY: &str = "SKILL.md";

/// Is `file` the entry note of the folder `name`, for a component of `kind`?
fn is_entry(file: &str, name: &str, kind: EntityKind) -> bool {
    md_stem(file) == Some(name) || (kind == EntityKind::Skill && is_skill_entry(file))
}

/// `SKILL.md`, case-insensitively, as `md_stem` reads every other note.
pub fn is_skill_entry(file: &str) -> bool {
    file.eq_ignore_ascii_case(SKILL_ENTRY)
}

/// The stem of a `.md` filename, case-insensitively. `README.MD` is a note
/// like any other.
fn md_stem(name: &str) -> Option<&str> {
    name.strip_suffix(".md").or_else(|| {
        name.rfind('.')
            .filter(|i| name[i + 1..].eq_ignore_ascii_case("md"))
            .map(|i| &name[..i])
    })
}

/// A classified entry, with its ancestry read off the chain it sits under.
fn placement(
    name: String,
    kind: EntityKind,
    chain: &[(EntityKind, String)],
    dir: Option<PathBuf>,
) -> Placement {
    let nearest = |want: EntityKind| {
        chain
            .iter()
            .rev()
            .find(|(k, _)| *k == want)
            .map(|(_, n)| n.clone())
    };
    Placement {
        name,
        kind: Some(kind),
        // The NEAREST enclosing one of each: a skill promoted to its
        // marketplace names that marketplace and no plugin; one inside a
        // plugin names both.
        marketplace: nearest(EntityKind::Marketplace),
        plugin: nearest(EntityKind::Plugin),
        dir,
    }
}

/// Files each component owns, deepest directory wins.
///
/// A path belongs to the innermost component directory containing it, and no
/// entry note is ever a resource. Without the depth rule a plugin claims every
/// file beneath it, including the notes and resources of the components it
/// holds.
fn owned_resources(
    files: &[PathBuf],
    placed: &BTreeMap<PathBuf, Placement>,
    dir: &Path,
) -> Vec<String> {
    let mut deeper: Vec<&Path> = placed
        .values()
        .filter_map(|p| p.dir.as_deref())
        .filter(|d| *d != dir && d.starts_with(dir))
        .collect();
    deeper.sort_by_key(|d| std::cmp::Reverse(d.as_os_str().len()));

    let mut out: Vec<String> = files
        .iter()
        .filter(|path| path.starts_with(dir))
        .filter(|path| !placed.contains_key(*path))
        .filter(|path| !deeper.iter().any(|d| path.starts_with(d)))
        .filter_map(|path| path.strip_prefix(dir).ok().map(forward_slashed))
        .collect();
    out.sort();
    out
}

/// Collects every file under `dir`, in sorted order, refusing symlinks.
///
/// Unlike [`crate::scan`]'s walker this one propagates read failures and has
/// no depth bound: a skills source is a curated tree feeding a publish, an
/// unreadable corner of it must not silently under-publish, and there is no
/// cycle to bound — [`Vfs::read_dir`] reports a symlinked directory as a
/// non-directory, and this walk refuses it before that could matter.
fn walk(vfs: &dyn Vfs, dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), CoreError> {
    let mut entries = vfs.read_dir(dir)?;
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    for entry in entries {
        // Finder droppings, not content. The one name skipped by spelling.
        if entry.name == ".DS_Store" {
            continue;
        }
        // The trash folder holds notes `delete` moved out of the tree — not
        // content, and their old shapes no longer resolve to a valid
        // placement now that they sit under a dot-directory, so walking in
        // would surface them as unreadable strays instead of leaving them
        // alone.
        if entry.is_dir && entry.name == crate::authoring::TRASH_DIR {
            continue;
        }
        let path = dir.join(&entry.name);
        if vfs.is_symlink(&path) {
            return Err(CoreError::refused(
                "unsafe-path",
                format!(
                    "{}: a symlink in a skills source — it reads as inside the tree and \
                     resolves outside it; replace it with the real file or directory",
                    path.display()
                ),
            ));
        }
        if entry.is_dir {
            walk(vfs, &path, out)?;
        } else {
            out.push(path);
        }
    }
    Ok(())
}

/// Reads one note at a recognised shape and decides: a component (`Some`),
/// not a candidate (`None`), or wrong enough to stop the scan (`Err`).
fn read_source(
    vfs: &dyn Vfs,
    vault_root: &Path,
    entry_path: &Path,
    placement: &Placement,
    placed: &BTreeMap<PathBuf, Placement>,
    files: &[PathBuf],
    ns: &Namespace,
) -> Result<Option<DiscoveredComponent>, CoreError> {
    let source = read_utf8(vfs, entry_path)?;
    let (frontmatter, body) = split_frontmatter(&source);
    let mut fields = frontmatter_map(frontmatter, entry_path)?;
    let ours = VaultFrontmatter::take_from(&mut fields, entry_path, ns)?;

    // Structure is layer 3, the note is layer 2, and `resolve_kind` owns the
    // ranking. Feeding it hints rather than deciding here is what keeps one
    // precedence in the codebase: a second surface working it out again is a
    // second surface getting it subtly different.
    //
    // This is the first production caller to supply a non-default hint, so it
    // is the first time `KindSource::Directory` can be returned at all.
    let resolved = resolve_kind(
        ours.declared_kind,
        KindHints {
            requested: None,
            configured: placement.kind,
        },
    );

    let name = trimmed_string(&fields, "name");
    let description = trimmed_string(&fields, "description");
    let (name, description, description_filled) = match (name, description) {
        // `description` is the opt-in, and `name` follows the filename when
        // the note does not declare one — the same answer
        // `read_vault_skill` gives a single-note publish, from the same
        // function.
        (name, Some(description)) => (
            name.unwrap_or_else(|| default_name(entry_path)),
            description,
            false,
        ),
        // Neither: an ordinary note sharing the tree. The common case, and
        // the silence that lets bundle resources live beside their entry.
        (None, None) => return Ok(None),
        // A `name` alone still opts in. The caller reports the filler.
        (Some(name), None) => (name, MISSING_DESCRIPTION.to_owned(), true),
    };

    validate_name(&name, "component name", entry_path)?;
    if let Some(refusal) = description_refusal(&description) {
        return Err(CoreError::malformed(entry_path, refusal));
    }

    // The Agent Skills spec's other hard cap, refused in the same shape and in the same
    // place: at the read, where the author can act on it, rather than in the
    // renderer, whose only response would be to emit something wrong.
    if let Some(compatibility) = trimmed_string(&fields, "compatibility")
        && let Some(refusal) = compatibility_refusal(&compatibility)
    {
        return Err(CoreError::malformed(entry_path, refusal));
    }

    // The shape already decided what this note owns; `place` refused every
    // other arrangement before the note was opened.
    let bundle_root = placement.dir.clone();
    let resources = bundle_root
        .as_deref()
        .map(|dir| owned_resources(files, placed, dir))
        .unwrap_or_default();

    // The folder puts a component in its plugin and `ap-plugin` overrules it —
    // the same ranking the kind follows, for the same reason: a note that says
    // where it belongs is never overruled by where it sits.
    let folder_plugin = placement.plugin.clone();
    let plugin = ours.plugin.clone().or_else(|| folder_plugin.clone());
    // Whichever side supplied it, the plugin becomes a marketplace directory
    // name, so a bad one fails here — on the note that carries it, rather than
    // at the far end of a publish.
    if let Some(plugin) = plugin.as_deref() {
        validate_name(plugin, "plugin name", entry_path)?;
    }

    if let Some(declared) = ours.targets.as_deref() {
        let unknown: Vec<&str> = declared
            .iter()
            .map(String::as_str)
            .filter(|name| !KNOWN_TARGETS.contains(name))
            .collect();
        if !unknown.is_empty() {
            return Err(CoreError::refused(
                "unknown-target",
                format!(
                    "{}: `{}` names {}, which this build does not know (known: {})",
                    entry_path.display(),
                    ns.key("targets"),
                    quoted(&unknown),
                    KNOWN_TARGETS.join(", ")
                ),
            ));
        }
    }

    let vault_relative_path = entry_path
        .strip_prefix(vault_root)
        .map(forward_slashed)
        .map_err(|_| CoreError::PathEscapesRoot(entry_path.to_path_buf()))?;

    Ok(Some(DiscoveredComponent {
        name,
        description,
        description_filled,
        kind: resolved.kind,
        kind_source: resolved.source,
        folder_kind: placement.kind,
        targets: ours.targets,
        plugin,
        folder_plugin,
        marketplace: placement.marketplace.clone(),
        entry_path: entry_path.to_path_buf(),
        bundle_root,
        resources,
        vault_relative_path,
        identity: ours.identity,
        hook: (resolved.kind == EntityKind::Hook).then(|| read_hook(&fields, body)),
    }))
}

/// One hook note's routing and payload off its own frontmatter and body.
fn read_hook(fields: &Map<String, Value>, body: &str) -> DiscoveredHook {
    let hook_type = trimmed_string(fields, "type").unwrap_or_else(|| DEFAULT_HOOK_TYPE.to_owned());
    // The body is the payload for the two types that have one to write, and
    // its first line is as much of a script as a row can show.
    let from_body = || {
        body.lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .map(str::to_owned)
    };
    let payload = match hook_type.as_str() {
        "command" => trimmed_string(fields, "command").or_else(from_body),
        "prompt" => trimmed_string(fields, "prompt").or_else(from_body),
        "http" => trimmed_string(fields, "url"),
        _ => None,
    };
    DiscoveredHook {
        event: trimmed_string(fields, "event"),
        matcher: trimmed_string(fields, "matcher"),
        hook_type,
        payload,
    }
}

/// What a hook note's absent `type` means, matching the projection's default.
const DEFAULT_HOOK_TYPE: &str = "command";

/// A field as discovery reads it: a non-empty string, trimmed. Any other
/// shape is absence, consistent with
/// [`crate::vault`]'s rule that a wrong-shaped modeled key falls back rather
/// than being consumed.
fn trimmed_string(fields: &Map<String, Value>, key: &str) -> Option<String> {
    fields
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// Maximum length of a component or plugin `name`, per the Agent Skills
/// spec. Matches `agent_adapt::naming::SKILL_NAME_MAX_LEN`; the two must
/// agree, since a name this scan admits is one `slugify_skill_name` must
/// also be able to produce.
pub const NAME_MAX_LEN: usize = 64;

/// Maximum length of a `description`, per the Agent Skills spec.
pub const DESCRIPTION_MAX_LEN: usize = 1024;

/// Maximum length of a `compatibility` note, per the Agent Skills spec.
pub const COMPATIBILITY_MAX_LEN: usize = 500;

/// Why `value` is not a `what` the Agent Skills spec admits — the name rule
/// `^[a-z0-9]+(-[a-z0-9]+)*$`, at most [`NAME_MAX_LEN`] characters, spelled
/// as segment checks rather than a regex dependency — or `None` when it is.
///
/// Separate from `validate_name` and public, because a caller composing a
/// note that does not exist yet has no path to name in a [`CoreError`]: it
/// wants the prose to put beside a field. The scan wants the error. Both
/// read the rule from here, so the two cannot drift.
pub fn name_refusal(value: &str, what: &str) -> Option<String> {
    let legal = !value.is_empty()
        && value.len() <= NAME_MAX_LEN
        && value.split('-').all(|segment| {
            !segment.is_empty()
                && segment
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        });
    (!legal).then(|| {
        format!(
            "`{value}` is not a {what} the Agent Skills spec admits: 1–{NAME_MAX_LEN} characters of \
             `a-z`, `0-9`, and `-`, with no leading, trailing, or doubled hyphen"
        )
    })
}

/// Why `value` is not a `description` the Agent Skills spec admits, or `None`.
/// Characters, not bytes — the Agent Skills spec's cap counts characters.
pub fn description_refusal(value: &str) -> Option<String> {
    let described = value.chars().count();
    (described > DESCRIPTION_MAX_LEN).then(|| {
        format!("the description is {described} characters; the Agent Skills spec caps it at {DESCRIPTION_MAX_LEN}")
    })
}

/// Why `value` is not a `compatibility` note the Agent Skills spec admits, or
/// `None`. Counted like [`description_refusal`]'s.
pub fn compatibility_refusal(value: &str) -> Option<String> {
    let stated = value.chars().count();
    (stated > COMPATIBILITY_MAX_LEN).then(|| {
        format!("the compatibility is {stated} characters; the Agent Skills spec caps it at {COMPATIBILITY_MAX_LEN}")
    })
}

/// [`name_refusal`] as the scan's own error, against the note carrying the
/// name.
///
/// `pub(crate)` for [`crate::adopt`]: what adoption writes must satisfy this
/// scan, so it validates with the same rule rather than a copy that drifts.
pub(crate) fn validate_name(value: &str, what: &str, path: &Path) -> Result<(), CoreError> {
    match name_refusal(value, what) {
        Some(message) => Err(CoreError::malformed(path, message)),
        None => Ok(()),
    }
}

/// The pack a note names for itself, read tolerantly: the `ap-plugin` key
/// alone, and `None` for anything that will not parse that far.
///
/// The scan needs this on the failure path, where [`read_source`] gave up
/// before it could say where the note belongs. A pack must not install a
/// subset silently, so a member the scan could not read has to be
/// attributable to its pack even when it sits outside that pack's folder.
fn declared_plugin(vfs: &dyn Vfs, entry_path: &Path, ns: &Namespace) -> Option<String> {
    let source = read_utf8(vfs, entry_path).ok()?;
    let (frontmatter, _body) = split_frontmatter(&source);
    let mut fields = frontmatter_map(frontmatter, entry_path).ok()?;
    VaultFrontmatter::take_from(&mut fields, entry_path, ns)
        .ok()?
        .plugin
}

/// The name a note publishes under when its frontmatter declares none: the
/// filename, slugified — or for a `SKILL.md`, its folder's name.
///
/// One derivation for both readers. [`crate::vault::read_vault_skill`] calls
/// it for a single-note publish and `read_source` calls it for a scan, so
/// the two cannot answer differently about the same file. Slugified rather
/// than raw, because `validate_name` runs on the result: a stem with a
/// capital or a space would otherwise default straight into a refusal.
pub fn default_name(path: &Path) -> String {
    // A `SKILL.md` entry is named by the folder it owns.
    let named = match path.file_name().and_then(|f| f.to_str()) {
        Some(file) if is_skill_entry(file) => path.parent().and_then(|p| p.file_name()),
        _ => path.file_stem(),
    };
    slugify(named.and_then(|s| s.to_str()).unwrap_or_default())
}

/// The slug, ASCII half: lowercase, every run of anything else one
/// `-`, trimmed. `Workflow Checklist` → `workflow-checklist`. See the module
/// doc for the deliberate NFKD divergence.
///
/// Public because deriving a name is not only adoption's problem. Any caller
/// that *authors* a note — [`crate::adopt`], an editor composing a new one —
/// has to produce the name and the filename this scan will later check
/// against each other, and the only way that check cannot drift is for one
/// function to answer it for everybody.
pub fn slugify(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut pending_separator = false;
    for c in value.chars() {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if pending_separator && !out.is_empty() {
                out.push('-');
            }
            pending_separator = false;
            out.push(c);
        } else {
            pending_separator = true;
        }
    }
    out
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
    use crate::vfs::{MemVfs, NativeVfs};

    fn ap() -> Namespace {
        Namespace::default()
    }

    /// An empty vault holding one marketplace directory and nothing else.
    fn vault() -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/plugins"))
            .unwrap();
        vfs
    }

    fn write(vfs: &dyn Vfs, rel: &str, content: &str) {
        let path = Path::new("/vault").join(rel);
        vfs.create_dir_all(path.parent().unwrap()).unwrap();
        vfs.write_file(&path, content.as_bytes()).unwrap();
    }

    /// Source frontmatter using the `ap-targets` and `ap-plugin` keys. An empty
    /// target list here means "omit the key".
    fn source(name: &str, targets: &[&str], plugin: Option<&str>) -> String {
        let mut out =
            format!("---\nname: {name}\ndescription: Use this skill to test {name} exports.\n");
        if !targets.is_empty() {
            out.push_str("ap-targets:\n");
            for target in targets {
                out.push_str(&format!("  - {target}\n"));
            }
        }
        if let Some(plugin) = plugin {
            out.push_str(&format!("ap-plugin: {plugin}\n"));
        }
        out.push_str("---\n\n# Body\n");
        out
    }

    fn scan(vfs: &dyn Vfs) -> Result<DiscoveryReport, CoreError> {
        discover_components(vfs, Path::new("/vault"), None, &ap())
    }

    /// The per-note assertions' shorthand: a scan that skipped anything reads
    /// as a failure here, carrying the skipped note's own sentence, so a case
    /// asserting a note is refused says so at the grain it cares about. The
    /// isolation itself is asserted through [`scan`].
    fn discover(vfs: &dyn Vfs) -> Result<Vec<DiscoveredComponent>, CoreError> {
        let report = scan(vfs)?;
        match report.skipped.first() {
            Some(skipped) => Err(CoreError::Refused(format!(
                "{}: {}",
                skipped.reason, skipped.detail
            ))),
            None => Ok(report.components),
        }
    }

    /// A hook's row has to say what fires it and what it runs; the file name
    /// says neither.
    #[test]
    fn a_hook_note_carries_its_event_matcher_and_command() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/review/hooks/lint-on-write.md",
            "---\nname: lint-on-write\ndescription: Lints what was just written.\nevent: PostToolUse\nmatcher: Edit|Write\ncommand: just lint\n---\n",
        );

        let found = discover(&vfs).unwrap();

        let hook = found[0].hook.as_ref().unwrap();
        assert_eq!(hook.event.as_deref(), Some("PostToolUse"));
        assert_eq!(hook.matcher.as_deref(), Some("Edit|Write"));
        assert_eq!(hook.hook_type, "command");
        assert_eq!(hook.payload.as_deref(), Some("just lint"));
    }

    /// The body is where a `command` hook may write its script instead, and
    /// its first line is as much of one as a row can show.
    #[test]
    fn a_hook_with_no_command_key_reads_its_payload_off_the_body() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/review/hooks/format.md",
            "---\nname: format\ndescription: Formats the file.\nevent: PostToolUse\n---\n\nbun run format\n",
        );

        let hook = discover(&vfs).unwrap()[0].hook.clone().unwrap();

        assert_eq!(hook.payload.as_deref(), Some("bun run format"));
    }

    /// The projection refuses an event-less hook; discovery still has to
    /// report it, because a tree that dropped it would hide the mistake.
    #[test]
    fn a_hook_missing_its_event_is_still_discovered() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/review/hooks/nothing.md",
            "---\nname: nothing\ndescription: Fires on nothing.\ncommand: just lint\n---\n",
        );

        let hook = discover(&vfs).unwrap()[0].hook.clone().unwrap();

        assert!(hook.event.is_none());
        assert_eq!(hook.payload.as_deref(), Some("just lint"));
    }

    /// Only hooks carry the summary — every other kind reads as it did.
    #[test]
    fn a_skill_carries_no_hook_summary() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/review.md",
            &source("review", &[], None),
        );

        assert!(discover(&vfs).unwrap()[0].hook.is_none());
    }

    /// The committed fixture vault (`tests/fixtures/agent-skills-vault`).
    #[test]
    fn the_committed_fixture_discovers_as_one_bundled_skill() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/workflow-checklist/workflow-checklist.md",
            "---\nname: workflow-checklist\ndescription: A fixture skill for testing bundle export.\nap-targets:\n  - codex\n  - claude\n---\n\n# Workflow Checklist\n\n![[references/steps]]\n",
        );
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/workflow-checklist/references/steps.md",
            "# Steps\n\n1. Understand the requested outcome.\n2. Validate the result.\n",
        );

        let found = discover(&vfs).unwrap();
        assert_eq!(found.len(), 1, "the resource note must not publish");
        let skill = &found[0];
        assert_eq!(skill.name, "workflow-checklist");
        assert_eq!(
            skill.description,
            "A fixture skill for testing bundle export."
        );
        assert_eq!(
            skill.targets,
            Some(vec!["codex".to_owned(), "claude".to_owned()])
        );
        // Inside `skills/`, so the folder names the kind and the note says
        // nothing; inside `plugins/tools/`, so the folder names the plugin.
        assert_eq!(skill.kind, EntityKind::Skill);
        assert_eq!(skill.kind_source, KindSource::Directory);
        assert_eq!(skill.folder_kind, Some(EntityKind::Skill));
        assert_eq!(skill.plugin.as_deref(), Some("tools"));
        assert_eq!(skill.marketplace.as_deref(), Some("house"));
        assert_eq!(skill.resources, vec!["references/steps.md".to_owned()]);
        assert_eq!(
            skill.entry_path,
            PathBuf::from(
                "/vault/marketplaces/house/plugins/tools/skills/workflow-checklist/workflow-checklist.md"
            )
        );
        assert_eq!(
            skill.bundle_root,
            Some(PathBuf::from(
                "/vault/marketplaces/house/plugins/tools/skills/workflow-checklist"
            ))
        );
        assert_eq!(
            skill.vault_relative_path,
            "marketplaces/house/plugins/tools/skills/workflow-checklist/workflow-checklist.md"
        );
    }

    #[test]
    fn a_note_at_the_root_is_bare_unless_its_frontmatter_names_a_plugin() {
        // No folder above a root note says anything, so membership is the
        // note's to declare or to leave empty. Nothing is defaulted here: a
        // marketplace needs every skill under some plugin directory, and
        // `export` is where that default belongs.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/foo.md",
            &source("foo", &["codex", "claude"], Some("alpha")),
        );
        write(
            &vfs,
            "marketplaces/house/skills/bar.md",
            &source("bar", &["codex"], Some("beta")),
        );
        write(
            &vfs,
            "marketplaces/house/skills/baz.md",
            &source("baz", &[], None),
        );

        let found = discover(&vfs).unwrap();
        let plugins: Vec<(&str, Option<&str>)> = found
            .iter()
            .map(|s| (s.name.as_str(), s.plugin.as_deref()))
            .collect();
        assert_eq!(
            plugins,
            vec![("bar", Some("beta")), ("baz", None), ("foo", Some("alpha"))]
        );
        assert!(found.iter().all(|s| s.bundle_root.is_none()));
        assert!(found.iter().all(|s| s.folder_plugin.is_none()));
        // Absent `ap-targets` stays absent — every destination, decided by
        // the caller that knows what "every" means, not expanded here.
        assert_eq!(found[1].targets, None);
    }

    /// The five shapes, in one vault, read as one roster.
    /// Promotion: the same `skills/` folder at three levels, and the level it
    /// sits at is how widely the skill is shared. Peers are left alone.
    #[test]
    fn a_kind_folder_means_the_same_thing_at_every_level_it_sits_at() {
        let vfs = vault();
        // Shared by everything: outside any marketplace.
        write(
            &vfs,
            "skills/house-style.md",
            &source("house-style", &[], None),
        );
        // Shared by one marketplace's plugins.
        write(
            &vfs,
            "marketplaces/acme/skills/tone.md",
            &source("tone", &[], None),
        );
        // Used by one plugin.
        write(
            &vfs,
            "marketplaces/acme/plugins/core/skills/review.md",
            &source("review", &[], None),
        );
        // A peer directory: no kind folder anywhere in its path, so the notes
        // in it are the author's own and are neither scanned nor refused.
        write(&vfs, "references/notes.md", &source("notes", &[], None));

        let found = discover(&vfs).unwrap();
        let rows: Vec<(&str, Option<&str>, Option<&str>)> = found
            .iter()
            .map(|c| {
                (
                    c.name.as_str(),
                    c.marketplace.as_deref(),
                    c.plugin.as_deref(),
                )
            })
            .collect();
        assert_eq!(
            rows,
            vec![
                ("house-style", None, None),
                ("review", Some("acme"), Some("core")),
                ("tone", Some("acme"), None),
            ],
            "one folder, three scopes — and the peer note is not a component"
        );
        assert!(found.iter().all(|c| c.kind == EntityKind::Skill));
    }

    #[test]
    fn structure_names_the_kind_and_the_plugin() {
        let vfs = vault();
        // A plugin: a root directory holding a kind folder.
        write(
            &vfs,
            "marketplaces/house/plugins/core/core.md",
            &source("core", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/core/README.md",
            "Notes for maintainers.\n",
        );
        // Its skill, carrying a file.
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/code-review/code-review.md",
            &source("code-review", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/code-review/check.py",
            "#!/x\n",
        );
        // Its skill, travelling alone.
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/release-notes.md",
            &source("release-notes", &["claude"], None),
        );
        // A kind this build cannot publish, named by its folder alone.
        write(
            &vfs,
            "marketplaces/house/plugins/core/commands/review.md",
            &source("review", &[], None),
        );
        // A skill PROMOTED to the marketplace: shared by every plugin under
        // it, and belonging to none of them. The same `skills/` folder,
        // one level up.
        write(
            &vfs,
            "marketplaces/house/skills/spike-notes.md",
            &source("spike-notes", &[], None),
        );

        let found = discover(&vfs).unwrap();
        let rows: Vec<(&str, EntityKind, Option<&str>, KindSource)> = found
            .iter()
            .map(|c| (c.name.as_str(), c.kind, c.plugin.as_deref(), c.kind_source))
            .collect();
        assert_eq!(
            rows,
            vec![
                (
                    "code-review",
                    EntityKind::Skill,
                    Some("core"),
                    KindSource::Directory
                ),
                ("core", EntityKind::Plugin, None, KindSource::Directory),
                (
                    "release-notes",
                    EntityKind::Skill,
                    Some("core"),
                    KindSource::Directory
                ),
                (
                    "review",
                    EntityKind::Command,
                    Some("core"),
                    KindSource::Directory
                ),
                // Promoted: named by `skills/` like the rest, in no plugin.
                (
                    "spike-notes",
                    EntityKind::Skill,
                    None,
                    KindSource::Directory
                ),
            ]
        );
        assert!(
            found
                .iter()
                .all(|c| c.marketplace.as_deref() == Some("house")),
            "every one of them is in the same marketplace, at three different levels"
        );

        // Ownership is deepest-directory-wins: the plugin keeps its own file
        // and claims nothing belonging to the components beneath it.
        let by = |name: &str| found.iter().find(|c| c.name == name).unwrap();
        assert_eq!(by("core").resources, vec!["README.md".to_owned()]);
        assert_eq!(by("code-review").resources, vec!["check.py".to_owned()]);
        assert!(by("release-notes").resources.is_empty());
    }
    /// The kind folder above a note names it, at whatever level it sits, and
    /// `ap-kind` still outranks the folder.
    #[test]
    fn the_kind_folder_above_a_note_names_it_and_the_note_may_overrule() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/onboarding/onboarding.md",
            &source("onboarding", &[], None),
        );
        let found = discover(&vfs).unwrap();
        assert_eq!(
            found[0].kind,
            EntityKind::Plugin,
            "`plugins/` names what it holds"
        );
        assert_eq!(found[0].folder_kind, Some(EntityKind::Plugin));
        assert_eq!(found[0].kind_source, KindSource::Directory);
        assert_eq!(found[0].marketplace.as_deref(), Some("house"));

        // The same file, overruled by its own frontmatter. It did not move.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/onboarding/onboarding.md",
            "---\nname: onboarding\ndescription: d\nap-kind: skill\n---\nb\n",
        );
        let found = discover(&vfs).unwrap();
        assert_eq!(found[0].kind, EntityKind::Skill);
        assert_eq!(found[0].kind_source, KindSource::Frontmatter);
        assert_eq!(
            found[0].folder_kind,
            Some(EntityKind::Plugin),
            "the folder it overruled is still reported"
        );
    }

    /// AC-1 and AC-2: `hooks/` names what it holds, so a hook note needs no
    /// `ap-kind`; a note that declares one anyway is read the same way, and
    /// says which layer answered.
    #[test]
    fn a_hooks_folder_names_a_hook_and_the_note_need_not() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/core/hooks/lint-on-write.md",
            "---\nname: lint-on-write\ndescription: d\nevent: PreToolUse\n---\njust lint\n",
        );
        let found = discover(&vfs).unwrap();
        let hook = found.iter().find(|c| c.name == "lint-on-write").unwrap();
        assert_eq!(hook.kind, EntityKind::Hook);
        assert_eq!(hook.kind_source, KindSource::Directory);
        assert_eq!(hook.plugin.as_deref(), Some("core"));

        // The same note, declaring what it already is: one kind, a different
        // layer, and the report says which.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/core/hooks/lint-on-write.md",
            "---\nname: lint-on-write\ndescription: d\nap-kind: hook\nevent: PreToolUse\n---\njust lint\n",
        );
        let found = discover(&vfs).unwrap();
        let hook = found.iter().find(|c| c.name == "lint-on-write").unwrap();
        assert_eq!(hook.kind, EntityKind::Hook);
        assert_eq!(hook.kind_source, KindSource::Frontmatter);
    }

    /// A hook promoted out of any `hooks/` folder still declares itself —
    /// AC-1's other half, where nothing above the note names it.
    #[test]
    fn a_note_declaring_ap_kind_hook_anywhere_is_a_hook() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/odd-hook.md",
            "---\nname: odd-hook\ndescription: d\nap-kind: hook\nevent: Stop\n---\njust go\n",
        );
        let found = discover(&vfs).unwrap();
        let hook = found.iter().find(|c| c.name == "odd-hook").unwrap();
        assert_eq!(hook.kind, EntityKind::Hook);
        assert_eq!(hook.kind_source, KindSource::Frontmatter);
        assert_eq!(hook.folder_kind, Some(EntityKind::Skill));
    }

    /// Frontmatter outranks the folder — the condition the kind decision put
    /// on turning the directory layer on at all.
    #[test]
    fn a_note_overrules_the_folder_it_sits_in_and_says_it_did() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/alpha/alpha.md",
            &source("alpha", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/alpha/skills/checklist.md",
            "---\nname: checklist\ndescription: d\nap-plugin: core\n---\nb\n",
        );
        // A command folder holding a note that says it is a skill.
        write(
            &vfs,
            "marketplaces/house/plugins/alpha/commands/oddity.md",
            "---\nname: oddity\ndescription: d\nap-kind: skill\n---\nb\n",
        );

        let found = discover(&vfs).unwrap();
        let checklist = found.iter().find(|c| c.name == "checklist").unwrap();
        assert_eq!(checklist.plugin.as_deref(), Some("core"), "the note wins");
        assert_eq!(
            checklist.folder_plugin.as_deref(),
            Some("alpha"),
            "and the folder it overruled is still reported"
        );

        let oddity = found.iter().find(|c| c.name == "oddity").unwrap();
        assert_eq!(oddity.kind, EntityKind::Skill);
        assert_eq!(oddity.kind_source, KindSource::Frontmatter);
        assert_eq!(oddity.folder_kind, Some(EntityKind::Command));
    }

    /// A note that declares itself but sits where no shape can read it is
    /// named, not dropped. Silence is for resources, which declare nothing.
    #[test]
    fn a_declared_note_at_an_unreadable_path_is_refused_with_the_shapes() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/core/core.md",
            &source("core", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/a/a.md",
            &source("a", &[], None),
        );
        // Two levels below a kind folder, under a directory that is not its
        // own name.
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/a/extra/stray.md",
            &source("stray", &[], None),
        );

        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("stray.md"), "{err}");
        assert!(
            err.contains("marketplaces/<name>/plugins/<name>/skills/"),
            "{err}"
        );

        // The same file, declaring nothing, is an ordinary resource.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/core/core.md",
            &source("core", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/a/a.md",
            &source("a", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/a/extra/note.md",
            "# prose\n",
        );
        let found = discover(&vfs).unwrap();
        let a = found.iter().find(|c| c.name == "a").unwrap();
        assert_eq!(a.resources, vec!["extra/note.md".to_owned()]);
    }

    /// The stray rule follows the opt-in, so a `description` alone is enough
    /// to be named. A resource still declares neither key and stays silent —
    /// which is what keeps the widened opt-in from commenting on every file
    /// beside an entry note.
    #[test]
    fn a_stray_carrying_a_description_alone_is_refused_with_the_shapes() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/a/a.md",
            &source("a", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/core/skills/a/extra/stray.md",
            "---\ndescription: half a draft\n---\nb\n",
        );

        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("stray.md"), "{err}");
        assert!(err.contains("no component can be read"), "{err}");
    }

    #[test]
    fn notes_that_declare_nothing_are_skipped_not_refused() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/notes.md",
            "# Just prose, no frontmatter\n",
        );
        write(
            &vfs,
            "marketplaces/house/skills/draft.md",
            "---\ntags:\n  - idea\n---\nA draft.\n",
        );
        // Not markdown, not an entry.
        write(&vfs, "marketplaces/house/plugins/tool.sh", "#!/bin/sh\n");

        assert!(discover(&vfs).unwrap().is_empty());
    }

    #[test]
    fn an_unknown_kind_is_refused_not_silently_skipped() {
        // The frontmatter contract refuses a `kind` it does not know, and
        // discovery inherits the reader — a typo must not quietly unpublish.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/typo.md",
            "---\nname: typo\ndescription: d\nap-kind: skil\n---\nb\n",
        );
        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("unknown-kind"), "{err}");
        assert!(
            err.contains("/vault/marketplaces/house/skills/typo.md"),
            "{err}"
        );
    }

    #[test]
    fn a_description_alone_is_a_component_named_after_its_file() {
        // The opt-in is `description`. The name follows the filename, which is
        // the answer a single-note publish of the same note gives.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/Release Notes.md",
            "---\ndescription: d\n---\nb\n",
        );
        let found = discover(&vfs).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "release-notes");
    }

    #[test]
    fn a_name_with_no_description_is_admitted_with_the_filler_and_a_warning() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/mute.md",
            "---\nname: mute\n---\nb\n",
        );
        // Whitespace is absence.
        write(
            &vfs,
            "marketplaces/house/skills/blank.md",
            "---\nname: blank\ndescription: \"  \"\n---\nb\n",
        );
        let report = scan(&vfs).unwrap();
        assert!(report.skipped.is_empty(), "{:?}", report.skipped);
        let filled: Vec<(&str, &str, bool)> = report
            .components
            .iter()
            .map(|c| {
                (
                    c.name.as_str(),
                    c.description.as_str(),
                    c.description_filled,
                )
            })
            .collect();
        assert_eq!(
            filled,
            [
                ("blank", MISSING_DESCRIPTION, true),
                ("mute", MISSING_DESCRIPTION, true)
            ]
        );
        let warned: Vec<(&str, &str)> = report
            .warnings
            .iter()
            .map(|w| (w.path.as_str(), w.reason.as_str()))
            .collect();
        assert_eq!(
            warned,
            [
                ("marketplaces/house/skills/blank.md", "missing-description"),
                ("marketplaces/house/skills/mute.md", "missing-description")
            ]
        );
    }

    #[test]
    fn a_described_note_carries_no_warning() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/said.md",
            "---\nname: said\ndescription: d\n---\nb\n",
        );
        let report = scan(&vfs).unwrap();
        assert!(!report.components[0].description_filled);
        assert!(report.warnings.is_empty());
    }

    #[test]
    fn the_skills_spec_name_rule_is_enforced() {
        for bad in ["Upper", "-lead", "trail-", "no--doubles", "under_score"] {
            let vfs = vault();
            write(
                &vfs,
                "marketplaces/house/skills/x.md",
                &format!("---\nname: {bad}\ndescription: d\n---\nb\n"),
            );
            let err = discover(&vfs).unwrap_err().to_string();
            assert!(err.contains("Agent Skills spec"), "{bad}: {err}");
            assert!(
                err.contains("/vault/marketplaces/house/skills/x.md"),
                "{bad}: {err}"
            );
        }

        // 64 is the cap, not one under it.
        let cap = "a".repeat(64);
        let vfs = vault();
        write(
            &vfs,
            &format!("marketplaces/house/skills/{cap}.md"),
            &format!("---\nname: {cap}\ndescription: d\n---\nb\n"),
        );
        assert_eq!(discover(&vfs).unwrap().len(), 1);

        let over = "a".repeat(65);
        let vfs = vault();
        write(
            &vfs,
            &format!("marketplaces/house/skills/{over}.md"),
            &format!("---\nname: {over}\ndescription: d\n---\nb\n"),
        );
        assert!(discover(&vfs).is_err());
    }

    #[test]
    fn the_description_cap_is_1024_characters() {
        let cap = "d".repeat(1024);
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/talk.md",
            &format!("---\nname: talk\ndescription: {cap}\n---\nb\n"),
        );
        assert_eq!(discover(&vfs).unwrap().len(), 1);

        let over = "d".repeat(1025);
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/talk.md",
            &format!("---\nname: talk\ndescription: {over}\n---\nb\n"),
        );
        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("1024"), "{err}");
    }

    #[test]
    fn the_compatibility_cap_is_500_characters() {
        let cap = "c".repeat(500);
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/talk.md",
            &format!("---\nname: talk\ndescription: d\ncompatibility: {cap}\n---\nb\n"),
        );
        assert_eq!(discover(&vfs).unwrap().len(), 1);

        let over = "c".repeat(501);
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/talk.md",
            &format!("---\nname: talk\ndescription: d\ncompatibility: {over}\n---\nb\n"),
        );
        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("compatibility"), "{err}");
        assert!(err.contains("501"), "{err}");
        assert!(err.contains("500"), "{err}");
    }

    #[test]
    fn a_declared_name_need_not_match_the_filename() {
        // The slug is what lets an Obsidian-titled note publish under its
        // kebab-case name without renaming the file.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/Workflow Checklist.md",
            "---\nname: workflow-checklist\ndescription: d\n---\nb\n",
        );
        assert_eq!(discover(&vfs).unwrap()[0].name, "workflow-checklist");

        // A declared name unrelated to the stem is the note's own answer, and
        // it is the answer a publish of that note has always given.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/other.md",
            "---\nname: different\ndescription: d\n---\nb\n",
        );
        assert_eq!(discover(&vfs).unwrap()[0].name, "different");
    }

    #[test]
    fn one_unreadable_note_does_not_stop_the_scan() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/good-one.md",
            &source("good-one", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/skills/good-two.md",
            &source("good-two", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/skills/draft.md",
            "---\nname: Not A Legal Name\ndescription: d\n---\nb\n",
        );

        let report = scan(&vfs).unwrap();

        let names: Vec<&str> = report.components.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["good-one", "good-two"]);
        assert_eq!(report.skipped.len(), 1);
        let skipped = &report.skipped[0];
        assert_eq!(skipped.path, "marketplaces/house/skills/draft.md");
        assert_eq!(skipped.reason, "unreadable-note");
        assert!(skipped.detail.contains("Agent Skills spec"), "{skipped:?}");
    }

    #[test]
    fn a_skipped_note_carries_the_token_its_refusal_already_had() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/aimed.md",
            "---\nname: aimed\ndescription: d\nap-targets: [nowhere]\n---\nb\n",
        );

        let report = scan(&vfs).unwrap();

        assert!(report.components.is_empty());
        assert_eq!(report.skipped[0].reason, "unknown-target");
    }

    #[test]
    fn a_skipped_note_reports_the_pack_it_belongs_to() {
        // The folder is the floor.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/draft.md",
            "---\nname: Not A Legal Name\ndescription: d\n---\nb\n",
        );

        let report = scan(&vfs).unwrap();

        assert_eq!(report.skipped[0].plugin.as_deref(), Some("tools"));

        // The note's own `ap-plugin` outranks it, and reaches a pack whose
        // folder does not hold the note at all. Without this a pack ships a
        // silent subset over a member nobody can read.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/draft.md",
            "---\nname: Not A Legal Name\ndescription: d\nap-plugin: tools\n---\nb\n",
        );

        let report = scan(&vfs).unwrap();

        assert_eq!(report.skipped[0].plugin.as_deref(), Some("tools"));
    }

    #[test]
    fn a_duplicate_name_is_refused_naming_both_notes() {
        // Legal on its own, either way: a lone `foo.md` and a `foo/foo.md`
        // that carries files both spell the name right. In one `skills/`
        // folder they claim one published directory.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/foo.md",
            &source("foo", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/foo/foo.md",
            &source("foo", &[], None),
        );

        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("path-collision"), "{err}");
        assert!(err.contains("skills/foo/foo.md"), "{err}");
        assert!(err.contains("skills/foo.md"), "{err}");
    }

    /// The shape rule reaches this case before the overlap check does.
    ///
    /// A component nested inside another's bundle has no shape that reads, so
    /// it is refused for sitting nowhere rather than for overlapping. The
    /// overlap check survives as a guard on `bundle_root`'s meaning — what
    /// ships with a skill must not contain another entry — and the two
    /// refusals say the same thing to the author either way.
    #[test]
    fn a_component_inside_another_components_bundle_is_refused() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/outer/outer.md",
            &source("outer", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/outer/inner/inner.md",
            &source("inner", &[], None),
        );

        let err = discover(&vfs).unwrap_err().to_string();
        assert!(
            err.contains("marketplaces/house/plugins/outer/inner/inner.md"),
            "{err}"
        );
        assert!(err.contains("no component can be read"), "{err}");
    }

    /// Outside a kind folder, a `SKILL.md` or a `<name>/<name>.md` is the
    /// author's own writing, not a component.
    #[test]
    fn an_entry_shape_outside_a_kind_folder_is_not_a_component() {
        let vfs = vault();
        write(&vfs, "notes/notes.md", &source("notes", &[], None));
        write(&vfs, "drafts/idea/SKILL.md", &source("idea", &[], None));
        let report = scan(&vfs).unwrap();
        assert!(report.components.is_empty(), "{:?}", report.components);
        assert!(report.skipped.is_empty(), "{:?}", report.skipped);
    }

    /// A `SKILL.md` entry takes its folder's name when it declares none, and
    /// owns its folder like `<name>/<name>.md` does.
    #[test]
    fn a_skill_md_entry_is_named_by_its_folder() {
        let vfs = vault();
        write(
            &vfs,
            "skills/code-review/SKILL.md",
            "---\ndescription: Reviews code.\n---\n",
        );
        write(&vfs, "skills/code-review/check.py", "#!/x\n");
        // Only a skill takes `SKILL.md`: a plugin's entry is `<name>/<name>.md`.
        write(&vfs, "plugins/tools/SKILL.md", &source("tools", &[], None));

        let report = scan(&vfs).unwrap();
        let rows: Vec<(&str, EntityKind)> = report
            .components
            .iter()
            .map(|c| (c.name.as_str(), c.kind))
            .collect();
        assert_eq!(rows, [("code-review", EntityKind::Skill)]);
        assert_eq!(report.components[0].resources, ["check.py"]);
        // It declares itself, so it is refused as a stray rather than dropped.
        let skipped: Vec<&str> = report.skipped.iter().map(|n| n.path.as_str()).collect();
        assert_eq!(skipped, ["plugins/tools/SKILL.md"]);
    }

    #[test]
    fn targets_validate_against_the_cores_known_set() {
        // The decision's named divergence: the whole known set, not `codex`/`claude`.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/wide.md",
            &source("wide", &["antigravity", "portable", "amp"], None),
        );
        assert_eq!(
            discover(&vfs).unwrap()[0].targets,
            Some(vec![
                "antigravity".to_owned(),
                "portable".to_owned(),
                "amp".to_owned()
            ])
        );

        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/typo.md",
            &source("typo", &["emacs"], None),
        );
        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("unknown-target"), "{err}");
        assert!(err.contains("emacs"), "{err}");
        assert!(
            err.contains("/vault/marketplaces/house/skills/typo.md"),
            "{err}"
        );
        // The fix is on screen.
        assert!(err.contains("claude-code"), "{err}");
    }

    #[test]
    fn targets_keep_the_cores_three_outcomes() {
        // Absent means every destination and empty means nowhere — the core's
        // `ap-targets` contract. A scalar is refused, never comma-split.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/keen.md",
            &source("keen", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/skills/mute.md",
            "---\nname: mute\ndescription: d\nap-targets: []\n---\nb\n",
        );
        let found = discover(&vfs).unwrap();
        assert_eq!(found[0].targets, None);
        assert_eq!(found[1].targets, Some(vec![]));

        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/scalar.md",
            "---\nname: scalar\ndescription: d\nap-targets: codex, claude\n---\nb\n",
        );
        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("must be a list"), "{err}");
    }

    #[test]
    fn the_plugin_name_is_validated_wherever_it_came_from() {
        // From the note...
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/x.md",
            "---\nname: x\ndescription: d\nap-plugin: Bad Name\n---\nb\n",
        );
        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("plugin name"), "{err}");
        assert!(err.contains("Bad Name"), "{err}");

        // ...and from the folder, which is now the other place it comes from.
        // A directory name that cannot be a marketplace directory fails on the
        // first component under it, not at the far end of a publish.
        // No plugin note here: its own `name` would fail the component rule
        // first, and what is under test is the folder as a *source* of the
        // plugin fact.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/plugins/Bad Name/skills/y.md",
            &source("y", &[], None),
        );
        let err = discover(&vfs).unwrap_err().to_string();
        assert!(err.contains("plugin name"), "{err}");
        assert!(err.contains("Bad Name"), "{err}");
    }

    #[test]
    fn an_empty_plugin_key_is_refused_not_read_as_the_default() {
        // Absent and present-but-wrong must not share an outcome: delete the
        // key to mean the default.
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/x.md",
            "---\nname: x\ndescription: d\nap-plugin: \"\"\n---\nb\n",
        );
        assert!(discover(&vfs).is_err());
    }

    #[test]
    fn results_are_sorted_by_name_whatever_the_walk_found_first() {
        let vfs = vault();
        write(
            &vfs,
            "marketplaces/house/skills/zulu.md",
            &source("zulu", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/alpha/alpha.md",
            &source("alpha", &[], None),
        );
        write(
            &vfs,
            "marketplaces/house/skills/mike.md",
            &source("mike", &[], None),
        );

        let names: Vec<String> = discover(&vfs)
            .unwrap()
            .into_iter()
            .map(|s| s.name)
            .collect();
        assert_eq!(names, vec!["alpha", "mike", "zulu"]);
    }

    /// The path-only reading, for the callers holding one note and no scan.
    #[test]
    fn folder_placement_names_every_level_a_path_passes_through() {
        let root = Path::new("/vault");
        let deep = folder_placement(
            root,
            Path::new("/vault/marketplaces/house/plugins/core/skills/review/review.md"),
        );
        assert_eq!(deep.kind, Some(EntityKind::Skill));
        assert_eq!(deep.marketplace.as_deref(), Some("house"));
        assert_eq!(deep.plugin.as_deref(), Some("core"));

        // A command, which the note itself never declared. This is the case
        // the detail screen used to render as `skill (default)`.
        let command = folder_placement(root, Path::new("/vault/plugins/core/commands/ship.md"));
        assert_eq!(command.kind, Some(EntityKind::Command));
        assert_eq!(command.marketplace, None, "no marketplace level above it");
        assert_eq!(command.plugin.as_deref(), Some("core"));

        // A marketplace's own note belongs to no marketplace — it is one.
        let market = folder_placement(root, Path::new("/vault/marketplaces/house/house.md"));
        assert_eq!(market.kind, Some(EntityKind::Marketplace));
        assert_eq!(market.marketplace, None);

        // Outside any kind folder, structure says nothing at all — which is
        // not the same as saying `skill`.
        assert_eq!(
            folder_placement(root, Path::new("/vault/elsewhere/note.md")),
            FolderPlacement::default()
        );
        // And a path that is not under the root at all is the same silence
        // rather than a panic.
        assert_eq!(
            folder_placement(root, Path::new("/somewhere/else.md")),
            FolderPlacement::default()
        );
    }

    /// Where the scan starts, and what a component belongs to when the
    /// levels above it are missing.
    #[test]
    fn the_root_is_the_vault_and_a_missing_configured_root_is_an_error() {
        let vfs = vault();
        // Promoted out of every plugin, still inside its marketplace: the
        // kind folder names it, and the levels above it name the rest.
        write(
            &vfs,
            "marketplaces/house/skills/demo.md",
            &source("demo", &[], None),
        );
        // A peer directory: it holds no kind folder, so nothing in it is
        // scanned or refused. This is where shared notes live.
        write(&vfs, "elsewhere/hidden.md", &source("hidden", &[], None));

        let found = discover(&vfs).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "demo");
        assert_eq!(found[0].marketplace.as_deref(), Some("house"));
        assert_eq!(found[0].plugin, None, "promoted above every plugin");

        // The same rule with the top two levels absent: a vault whose root
        // holds `plugins/` is one unnamed marketplace.
        let bare = MemVfs::new();
        write(
            &bare,
            "plugins/core/skills/demo.md",
            &source("demo", &[], None),
        );
        let found = discover(&bare).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].marketplace, None);
        assert_eq!(found[0].plugin.as_deref(), Some("core"));

        // A configured root replaces the vault as the place the scan starts,
        // and vault-relative paths are still spelled from the vault root.
        write(
            &vfs,
            "elsewhere/plugins/hidden/skills/note.md",
            &source("note", &[], None),
        );
        let found = discover_components(
            &vfs,
            Path::new("/vault"),
            Some(Path::new("/vault/elsewhere")),
            &ap(),
        )
        .unwrap()
        .components;
        assert_eq!(found[0].name, "note");
        assert_eq!(found[0].plugin.as_deref(), Some("hidden"));
        assert_eq!(
            found[0].vault_relative_path,
            "elsewhere/plugins/hidden/skills/note.md"
        );

        let err = discover_components(
            &vfs,
            Path::new("/vault"),
            Some(Path::new("/vault/absent")),
            &ap(),
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::RootNotFound(_)), "{err}");
    }

    /// The one discovery rule [`MemVfs`] cannot exercise: it has no links.
    #[cfg(unix)]
    #[test]
    fn a_symlink_in_the_skills_source_is_refused_on_a_real_filesystem() {
        let dir = tempfile::tempdir().unwrap();
        let plugins = dir.path().join("plugins");
        std::fs::create_dir_all(plugins.join("demo")).unwrap();
        std::fs::write(
            plugins.join("demo/demo.md"),
            "---\nname: demo\ndescription: d\n---\nb\n",
        )
        .unwrap();

        // Sound before any link arrives.
        let found = discover_components(&NativeVfs, dir.path(), None, &Namespace::default())
            .unwrap()
            .components;
        assert_eq!(found.len(), 1);

        // A linked directory is refused by name...
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, plugins.join("linked")).unwrap();
        let err = discover_components(&NativeVfs, dir.path(), None, &Namespace::default())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unsafe-path"), "{err}");
        assert!(err.contains("linked"), "{err}");
        std::fs::remove_file(plugins.join("linked")).unwrap();

        // ...and so is a linked file, wherever in the tree it sits.
        std::fs::write(dir.path().join("real.md"), "outside the source\n").unwrap();
        std::os::unix::fs::symlink(dir.path().join("real.md"), plugins.join("demo/stray.md"))
            .unwrap();
        let err = discover_components(&NativeVfs, dir.path(), None, &Namespace::default())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unsafe-path"), "{err}");
        assert!(err.contains("stray.md"), "{err}");
    }

    /// `.trash` holds what `delete` moved out of the tree. The walk must not
    /// descend into it — a trashed note's old shape no longer resolves to a
    /// valid placement and would otherwise surface as an unreadable stray.
    #[test]
    fn a_trash_directory_is_never_walked() {
        let vfs = vault();
        write(
            &vfs,
            ".trash/marketplaces/house/plugins/review/skills/old/old.md",
            &source("old", &[], None),
        );

        let found = discover(&vfs).unwrap();

        assert!(found.is_empty(), "{found:?}");
    }
}

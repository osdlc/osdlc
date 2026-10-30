//! The decision plane for authoring a vault: where a note goes, what it is
//! called, what it would collide with, and what its frontmatter says.
//!
//! Every function here decides and returns an [`AuthoringOp`]. None of them
//! writes: the host executes the plan, because only the host has the
//! vocabulary a write needs — content-addressed reads, etags, a trash folder,
//! a link-rewriting rename. This module has a `&dyn Vfs` and nothing else, so
//! it compiles for `wasm32-unknown-unknown` and answers the same way on every
//! host.
//!
//! The placement rules, the naming rules and the refusals are the ones the
//! vault's own discovery scan enforces — asked here, before the note exists,
//! by running that scan over a scratch [`MemVfs`] holding exactly the one
//! composed file ([`scratch_scan`]). Restating the rules would be a second
//! answer to the same question; running them cannot drift.

use std::collections::BTreeSet;
use std::path::Path;

use serde::{Deserialize, Serialize};
use yaml_splice::edit_frontmatter;
use yaml_splice::parse::parse_mapping;

use crate::discover::{
    DiscoveredComponent, KIND_DIRS, discover_components, folder_placement, name_refusal, slugify,
};
use crate::error::CoreError;
use crate::frontmatter::EntityKind;
use crate::namespace::Namespace;
use crate::vault::read_vault_skill;
use crate::vfs::{MemVfs, Vfs};

/// Where an authored note sits, as the author named it. Every level is
/// optional and an empty string is not an answer — see `named`.
///
/// The neutral shape of a host's own placement wire type: the levels a path
/// is derived from, and nothing a transport cares about.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Placement {
    /// The marketplace folder, when named.
    pub marketplace: Option<String>,
    /// The plugin folder, when named.
    pub plugin: Option<String>,
    /// The kind, spelled by name. Mutually exclusive with [`Self::folder`].
    pub kind: Option<String>,
    /// A plain folder of the author's own, for a note that has no kind.
    pub folder: Option<String>,
}

/// One frontmatter key set to a value, or removed when `value` is `None`.
///
/// No serde: [`yaml_splice::Value`] is not serde-aware, and teaching it to be
/// would put a wire concern in a pure YAML editor.
#[derive(Debug, Clone, PartialEq)]
pub struct FieldEdit {
    /// The frontmatter key.
    pub key: String,
    /// The new value, or `None` to remove the key.
    pub value: Option<yaml_splice::Value>,
}

impl FieldEdit {
    /// An edit that sets `key` to `value`.
    pub fn set(key: impl Into<String>, value: yaml_splice::Value) -> Self {
        Self {
            key: key.into(),
            value: Some(value),
        }
    }

    /// An edit that removes `key`.
    pub fn remove(key: impl Into<String>) -> Self {
        Self {
            key: key.into(),
            value: None,
        }
    }
}

/// What a host has to do to carry out one authoring decision.
///
/// Paths are vault-relative and `/`-separated, the same spelling the vault's
/// scan and the notes' own wikilinks use. Nothing here names an etag, a trash
/// entry or a CAS token: those are the host's, and a plan that carried them
/// could not be computed in a browser.
#[derive(Debug, Clone, PartialEq)]
pub enum AuthoringOp {
    /// Write `bytes` at `path`, then make each `scaffold` directory.
    Create {
        /// Vault-relative path of the new note.
        path: String,
        /// Full text of the new note.
        bytes: String,
        /// Directories to create after the write.
        scaffold: Vec<String>,
    },
    /// Move `from` to `to` — the whole bundle folder when `bundle` — then
    /// apply `frontmatter` to the note at `to`.
    Rename {
        /// Current vault-relative path.
        from: String,
        /// New vault-relative path.
        to: String,
        /// Whether the note's whole bundle folder moves.
        bundle: bool,
        /// Frontmatter edits to apply to the note at `to`.
        frontmatter: Vec<FieldEdit>,
    },
    /// The same move, to a placement rather than to a name.
    Move {
        /// Current vault-relative path.
        from: String,
        /// New vault-relative path.
        to: String,
        /// Whether the note's whole bundle folder moves.
        bundle: bool,
        /// Frontmatter edits to apply to the note at `to`.
        frontmatter: Vec<FieldEdit>,
    },
    /// Trash every path, into `trash_dir`.
    Delete {
        /// Vault-relative paths to trash.
        paths: Vec<String>,
        /// The vault-relative folder the paths move into.
        trash_dir: String,
    },
    /// Move into another kind's folder, restate the kind, and make the member
    /// folders a container kind holds.
    ConvertKind {
        /// Current vault-relative path.
        from: String,
        /// New vault-relative path.
        to: String,
        /// Whether the note's whole bundle folder moves.
        bundle: bool,
        /// Frontmatter edits to apply to the note at `to`.
        frontmatter: Vec<FieldEdit>,
        /// Member directories to create.
        scaffold: Vec<String>,
    },
    /// Rename a plugin: its folder, its own `name`, and every member whose
    /// explicit `sw-plugin` named the old slug.
    ///
    /// `members` is keyed on the member's path in the OLD tree, since that is
    /// where a host reads their etags before anything moves; rebase each onto
    /// `dir_to` after the folder lands.
    RenamePlugin {
        /// Path of the plugin note before the rename.
        from: String,
        /// Path of the plugin note after the rename.
        to: String,
        /// The plugin folder before the rename.
        dir_from: String,
        /// The plugin folder after the rename.
        dir_to: String,
        /// Frontmatter edits to apply to the plugin note.
        frontmatter: Vec<FieldEdit>,
        /// Each member's path in the old tree, with its frontmatter edits.
        members: Vec<(String, Vec<FieldEdit>)>,
    },
}

/// The vault-relative folder a delete moves its paths into.
pub const TRASH_DIR: &str = ".trash";

/// The plugin an un-keyed note groups into. Configuration, not a property of
/// the note — stated once here so a host can explain where a row's `plugin`
/// value came from.
pub const DEFAULT_PLUGIN: &str = "core";

/// The vault-relative directory discovery scans —
/// [`discover_components`] with `skills_root: None`, spelled out.
pub const SKILLS_ROOT: &str = "plugins";

/// The folder marketplaces are looked for in, under the content root.
pub const MARKETPLACES_DIR: &str = "marketplaces";

/// Where a newly authored skill lands when the request does not say.
///
/// A component's marketplace and plugin are decided by the folders holding it,
/// and [`derive_create`] derives the path rather than taking one — so a create
/// with no placement has to pick, and it picks the defaults.
const DEFAULT_MARKETPLACE: &str = "default";

/// Frontmatter keys no conversion removes: both are the note's identity, and
/// every kind carries them.
const UNDROPPABLE_KEYS: &[&str] = &["name", "description"];

/// Why a name with nothing sluggable in it is refused, stated once. `what` is
/// the level being named — a component name, a plugin name, a note name — so
/// the refusal says which one had nothing to slug.
pub fn nameless(what: &str) -> String {
    format!("a {what} needs at least one letter or digit, so a filename can be slugged from it")
}

/// Refusals a container placement can produce, spelled once so the prose does
/// not pick up the indentation a wrapped string literal would.
const MARKETPLACE_NESTED: &str =
    "a marketplace is not authored inside a marketplace — its own name is the folder it makes";

const PLUGIN_NESTED: &str =
    "a plugin is not authored inside a plugin — its own name is the folder it makes";

/// The scratch vault [`scratch_scan`] builds its one file under. Named so a
/// refusal's prose can have it stripped back off: it is not a path anybody
/// has, and showing it to an author would be showing them a lie.
pub const SCRATCH_ROOT: &str = "/vault";

/// A placement level as the author named it, or `None` where they named
/// nothing: an empty string is not an answer.
fn named(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

/// The vault-relative folder a created note is written into.
///
/// Every placement level names one folder, so each must be a single non-empty
/// segment. The kind maps through [`KIND_DIRS`]; container kinds take
/// `container_dir`, which names the folder the note itself makes.
pub fn new_note_dir(placement: Option<&Placement>) -> Result<String, String> {
    let Some(placement) = placement else {
        return Ok(format!(
            "{MARKETPLACES_DIR}/{DEFAULT_MARKETPLACE}/{SKILLS_ROOT}/{DEFAULT_PLUGIN}/skills"
        ));
    };
    let segment = |level: &str, name: Option<&str>| -> Result<Option<String>, String> {
        match name.map(str::trim) {
            None => Ok(None),
            Some("") => Err(format!("the {level} is named, but named nothing")),
            Some(name) if name.contains(['/', '\\']) || name == "." || name == ".." => {
                Err(format!("`{name}` is not one folder name for the {level}"))
            }
            Some(name) => Ok(Some(name.to_owned())),
        }
    };
    // A kind and a plain folder are two different derivations, so naming both
    // is not a placement with a preference — it is two placements, and picking
    // one would write the note somewhere the author did not ask for.
    let kind = match (named(&placement.kind), named(&placement.folder)) {
        (Some(_), Some(_)) => {
            return Err(
                "a placement names a kind or a plain folder, never both — a plain note has no kind"
                    .to_owned(),
            );
        }
        (None, None) => {
            return Err("the placement names neither a kind nor a folder".to_owned());
        }
        (None, Some(folder)) => return plain_note_dir(folder, placement, &segment),
        (Some(kind), None) => kind,
    };
    let kind = kind
        .parse::<EntityKind>()
        .map_err(|e| format!("the placement's kind: {e}"))?;
    // A container is authored as its folder's own note rather than placed
    // inside a kind folder, so its directory is the level it will sit at and
    // the folder is named for it by the bundling rule.
    if kind.holds_components() {
        return container_dir(kind, placement, &segment);
    }

    let Some((kind_dir, _)) = KIND_DIRS.iter().find(|(_, k)| *k == kind) else {
        return Err(format!(
            "no folder holds a {} — the kind directories are {}",
            kind.as_str(),
            KIND_DIRS
                .iter()
                .map(|(dir, _)| *dir)
                .collect::<Vec<_>>()
                .join(", ")
        ));
    };
    let mut dir = placement_prefix(placement, &segment)?;
    dir.push_str(kind_dir);
    Ok(dir)
}

/// The marketplace and plugin levels of a placement, as the folder prefix
/// every derived directory starts with. Empty when the placement names
/// neither.
fn placement_prefix(
    placement: &Placement,
    segment: &impl Fn(&str, Option<&str>) -> Result<Option<String>, String>,
) -> Result<String, String> {
    let mut dir = String::new();
    if let Some(market) = segment("marketplace", placement.marketplace.as_deref())? {
        dir.push_str(MARKETPLACES_DIR);
        dir.push('/');
        dir.push_str(&market);
        dir.push('/');
    }
    if let Some(plugin) = segment("plugin", placement.plugin.as_deref())? {
        dir.push_str(SKILLS_ROOT);
        dir.push('/');
        dir.push_str(&plugin);
        dir.push('/');
    }
    Ok(dir)
}

/// Where a plain note goes: the same levels a component's placement names,
/// then a folder of the author's own instead of a kind folder.
///
/// The folder is filing and nothing else. Discovery reads a note's kind off
/// the kind folder above it, so a plain note has to sit outside every one of
/// them — and a note with neither `name` nor `description` is skipped by the
/// scan wherever it sits, which is what makes `roles/` a peer resource rather than a component
/// the scan then refuses to classify. Naming a kind folder here is refused
/// rather than allowed-and-ignored: the author asking for `skills/` means
/// something by it, and it is not what would happen.
fn plain_note_dir(
    folder: &str,
    placement: &Placement,
    segment: &impl Fn(&str, Option<&str>) -> Result<Option<String>, String>,
) -> Result<String, String> {
    let folder = segment("folder", Some(folder))?
        .ok_or_else(|| "the folder is named, but named nothing".to_owned())?;
    if let Some((dir, kind)) = KIND_DIRS.iter().find(|(dir, _)| *dir == folder) {
        return Err(format!(
            "`{dir}` is the folder a {} lands in — a plain note names a folder of its own",
            kind.as_str()
        ));
    }
    let mut dir = placement_prefix(placement, segment)?;
    dir.push_str(&folder);
    Ok(dir)
}

/// Where a container note's own folder goes.
///
/// A marketplace sits directly under the marketplaces root; a plugin sits
/// under one marketplace's plugins root, so it needs the marketplace named and
/// says so rather than guessing at one. Neither may name a level below itself:
/// a marketplace inside a plugin is not a shape the reader can resolve, and
/// accepting it would write a note nothing ever finds.
fn container_dir(
    kind: EntityKind,
    placement: &Placement,
    segment: &impl Fn(&str, Option<&str>) -> Result<Option<String>, String>,
) -> Result<String, String> {
    match kind {
        EntityKind::Marketplace => {
            if segment("plugin", placement.plugin.as_deref())?.is_some() {
                return Err("a marketplace is not authored inside a plugin".to_owned());
            }
            if segment("marketplace", placement.marketplace.as_deref())?.is_some() {
                return Err(MARKETPLACE_NESTED.to_owned());
            }
            Ok(MARKETPLACES_DIR.to_owned())
        }
        EntityKind::Plugin => {
            let market =
                segment("marketplace", placement.marketplace.as_deref())?.ok_or_else(|| {
                    "a plugin is authored inside a marketplace, so the placement has to name one"
                        .to_owned()
                })?;
            if segment("plugin", placement.plugin.as_deref())?.is_some() {
                return Err(PLUGIN_NESTED.to_owned());
            }
            Ok(format!("{MARKETPLACES_DIR}/{market}/{SKILLS_ROOT}"))
        }
        other => Err(format!("{} holds no components", other.as_str())),
    }
}

/// Why `slug` cannot be a `what`: nothing sluggable in the name it came from,
/// or a slug the skills-spec grammar refuses. `None` means it is usable.
///
/// A rename composes no note, so the cap is checked here too — otherwise an
/// over-long name refuses the vault's next scan instead of the rename.
pub fn slug_refusal(slug: &str, what: &str) -> Option<String> {
    if slug.is_empty() {
        return Some(nameless(what));
    }
    name_refusal(slug, what)
}

/// The note a create would author: its derived path, and the edits as they
/// would actually be written.
///
/// The path is derived rather than accepted because the scan requires the
/// filename to slugify to the note's `name` (`<slug>.md`, or
/// `<slug>/<slug>.md` for a bundle). Slugging the name and building both the
/// path and the `name` edit from that one value makes the two agree by
/// construction — there is no second spelling to keep in sync, in this module
/// or in any client. The directory above the filename comes from the
/// placement ([`new_note_dir`]).
///
/// `Err` is the refusal, in the words a draft shows while the author types:
/// a name with nothing to slug, or a placement naming what no folder can be.
pub fn derive_create(
    placement: Option<&Placement>,
    name: &str,
    bundled: bool,
    fields: &[FieldEdit],
) -> Result<(String, Vec<FieldEdit>), String> {
    let slug = slugify(name);
    if let Some(refusal) = slug_refusal(&slug, "component name") {
        return Err(refusal);
    }
    let dir = new_note_dir(placement)?;
    // A container note names its folder, so it is bundled whatever the request
    // said: `marketplaces/house.md` is a note the reader would find as a loose
    // component rather than as a marketplace.
    let path = if bundled || placement_kind(placement).is_some_and(EntityKind::holds_components) {
        format!("{dir}/{slug}/{slug}.md")
    } else {
        format!("{dir}/{slug}.md")
    };
    Ok((path, with_name(fields, &slug)))
}

/// The directory a component bundle's entry note names, when `entry` is
/// shaped `<dir>/<dir>.md` or `<dir>/SKILL.md`. The shape and nothing else:
/// the plans here decide what moves, never how a host moves it.
pub fn bundle_dir(entry: &str) -> Option<&str> {
    let (dir, file) = entry.rsplit_once('/')?;
    if crate::discover::is_skill_entry(file) {
        return Some(dir);
    }
    if !entry.ends_with(".md") {
        return None;
    }
    let stem = &file[..file.len() - 3];
    let dir_name = dir.rsplit('/').next().unwrap_or(dir);
    (dir_name == stem).then_some(dir)
}

/// The entry file a bundle named `name` gets as a `to_kind`: `SKILL.md` stays
/// `SKILL.md` while it is still a skill, and anything else is `<name>.md` —
/// only a skill may use `SKILL.md`, so a skill converted to another kind must
/// take its folder's name or discovery cannot read it back.
fn bundle_entry_file(entry: &str, name: &str, to_kind: EntityKind) -> String {
    let file = entry.rsplit('/').next().unwrap_or(entry);
    if to_kind == EntityKind::Skill && crate::discover::is_skill_entry(file) {
        file.to_owned()
    } else {
        format!("{name}.md")
    }
}

/// The entry's own row in the vault's current scan, when discovery lists it.
/// `None` for a note discovery skips or cannot read — none of the ops below
/// can safely reason about a component they cannot resolve.
pub fn find_component(
    vfs: &dyn Vfs,
    vault_dir: &Path,
    entry: &str,
    ns: &Namespace,
) -> Option<DiscoveredComponent> {
    discover_components(vfs, vault_dir, None, ns)
        .ok()?
        .components
        .into_iter()
        .find(|c| c.vault_relative_path == entry)
}

/// The destination a rename to `slug` implies: the same directory for a
/// single-file component, or `<parent>/<slug>/<slug>.md` for a bundle — its
/// directory renamed to match, exactly as its own file must. A `SKILL.md`
/// entry keeps its filename; only its folder is renamed.
pub fn rename_destination(entry: &str, slug: &str) -> String {
    match bundle_dir(entry) {
        Some(dir) => {
            // A rename keeps the kind, and only a skill has a `SKILL.md`.
            let file = bundle_entry_file(entry, slug, EntityKind::Skill);
            match dir.rsplit_once('/') {
                Some((parent, _)) => format!("{parent}/{slug}/{file}"),
                None => format!("{slug}/{file}"),
            }
        }
        None => match entry.rsplit_once('/') {
            Some((dir, _)) => format!("{dir}/{slug}.md"),
            None => format!("{slug}.md"),
        },
    }
}

/// The destination a move to `placement` implies, derived the way
/// [`derive_create`] derives a create's path: the kind folder comes from
/// `kind` — the component's OWN resolved kind, since a move cannot change
/// what a note is — never from the placement. A bundle keeps its own folder
/// name; a lone note keeps its own filename.
pub fn move_destination(
    entry: &str,
    kind: EntityKind,
    marketplace: Option<&str>,
    plugin: Option<&str>,
) -> Result<String, String> {
    let dir = new_note_dir(Some(&Placement {
        marketplace: marketplace.map(str::to_owned),
        plugin: plugin.map(str::to_owned),
        kind: Some(kind.as_str().to_owned()),
        folder: None,
    }))?;
    Ok(match bundle_dir(entry) {
        Some(from_dir) => {
            let name = from_dir.rsplit('/').next().unwrap_or(from_dir);
            format!("{dir}/{name}/{}", bundle_entry_file(entry, name, kind))
        }
        None => {
            let leaf = entry.rsplit('/').next().unwrap_or(entry);
            format!("{dir}/{leaf}")
        }
    })
}

/// Every markdown note still inside a container's own folder besides its
/// entry note — what [`plan_delete_component`] refuses to discard silently.
/// Walked directly rather than through [`discover_components`]: this only
/// needs to know "is anything else in here", not each member's resolved key.
pub fn container_members(vfs: &dyn Vfs, vault_dir: &Path, dir: &str, entry: &str) -> Vec<String> {
    let mut members = Vec::new();
    walk_markdown(vfs, &vault_dir.join(dir), vault_dir, entry, &mut members);
    members.sort();
    members
}

fn walk_markdown(
    vfs: &dyn Vfs,
    current: &Path,
    vault_dir: &Path,
    entry: &str,
    out: &mut Vec<String>,
) {
    let Ok(entries) = vfs.read_dir(current) else {
        return;
    };
    for item in entries {
        let path = current.join(&item.name);
        if item.is_dir {
            walk_markdown(vfs, &path, vault_dir, entry, out);
        } else if path.extension().is_some_and(|ext| ext == "md")
            && let Ok(rel) = path.strip_prefix(vault_dir)
        {
            let rel = rel.to_string_lossy().replace('\\', "/");
            if rel != entry {
                out.push(rel);
            }
        }
    }
}

/// The marketplace directory a component publishes onto — the four values
/// that decide it, and the whole of a component's identity at publish time.
#[derive(Debug, Clone, Copy)]
pub struct PublishKey<'a> {
    /// The marketplace folder, when there is one.
    pub marketplace: Option<&'a str>,
    /// The plugin folder, when there is one.
    pub plugin: Option<&'a str>,
    /// The kind of component.
    pub kind: EntityKind,
    /// The component's name.
    pub name: &'a str,
}

/// Another component already publishing onto `(marketplace, plugin, kind,
/// name)`, at a path other than `excluding`. The key is passed by value, so a
/// rename or move can ask without having composed a component.
pub fn key_collision(
    vfs: &dyn Vfs,
    vault_dir: &Path,
    ns: &Namespace,
    key: &PublishKey<'_>,
    excluding: &str,
) -> Option<String> {
    let PublishKey {
        marketplace,
        plugin,
        kind,
        name,
    } = *key;
    discover_components(vfs, vault_dir, None, ns)
        .ok()?
        .components
        .into_iter()
        .find(|s| {
            s.marketplace.as_deref() == marketplace
                && s.plugin.as_deref() == plugin
                && s.kind == kind
                && s.name == name
                && s.vault_relative_path != excluding
        })
        .map(|other| {
            format!(
                "`{name}` is already the name of {} — two components cannot publish onto one \
                 marketplace directory",
                other.vault_relative_path
            )
        })
}

/// Whether renaming `entry` to `to` (final component name `slug`) would
/// collide with another component's `(marketplace, plugin, kind, name)` key.
/// A host's own move has no notion of a publish key, so this is asked again
/// at apply time rather than trusted from a preview that may be stale by the
/// time the button is pressed.
pub fn rename_collision(
    vfs: &dyn Vfs,
    vault_dir: &Path,
    ns: &Namespace,
    entry: &str,
    to: &str,
    slug: &str,
) -> Option<String> {
    let ours = find_component(vfs, vault_dir, entry, ns)?;
    let placement = folder_placement(vault_dir, &vault_dir.join(to));
    // The publish key carries the RESOLVED plugin, and `sw-plugin` overrules
    // the folder. A rename touches no frontmatter, so an overridden note
    // keeps its override and the folder's plugin is not its bucket; a note
    // that takes its plugin from the folder follows the destination, which is
    // how renaming a plugin's own directory moves it into its new bucket.
    let plugin = if ours.plugin == ours.folder_plugin {
        placement.plugin
    } else {
        ours.plugin.clone()
    };
    key_collision(
        vfs,
        vault_dir,
        ns,
        &PublishKey {
            marketplace: placement.marketplace.as_deref(),
            plugin: plugin.as_deref(),
            kind: ours.kind,
            name: slug,
        },
        entry,
    )
}

/// The name a component's own file or folder carries: the bundle folder's
/// leaf for a bundle, the filename's stem for a lone note.
fn component_slug(entry: &str) -> &str {
    match bundle_dir(entry) {
        Some(dir) => dir.rsplit('/').next().unwrap_or(dir),
        None => {
            let leaf = entry.rsplit('/').next().unwrap_or(entry);
            leaf.strip_suffix(".md").unwrap_or(leaf)
        }
    }
}

/// The (marketplace, plugin) folders a conversion to `to_kind` puts the note
/// under, given the ones it sits in now.
///
/// A leaf keeps both: the note stays where it is and only its kind folder
/// changes. A container sits at the level ABOVE the one its members do, so
/// each drops the levels below it — converting to a plugin makes the note a
/// sibling of the plugin it was in, converting to a marketplace takes it out
/// of the marketplace it was in. Converting AWAY from a container needs no
/// arm of its own: a container note's own placement already omits the level
/// it names, so its members' level is not one it can stay at.
fn convert_placement(
    to_kind: EntityKind,
    marketplace: Option<&str>,
    plugin: Option<&str>,
) -> (Option<String>, Option<String>) {
    match to_kind {
        EntityKind::Marketplace => (None, None),
        EntityKind::Plugin => (marketplace.map(str::to_owned), None),
        _ => (marketplace.map(str::to_owned), plugin.map(str::to_owned)),
    }
}

/// The destination converting `entry` to `to_kind` implies — the
/// kind-directory sibling of [`move_destination`], which it delegates to for
/// every leaf kind.
///
/// The one shape a move never produces: a container is authored as its own
/// folder's note (`<name>/<name>.md`) whatever shape the note has now, so a
/// lone file converting to `plugin` or `marketplace` gains a folder.
pub fn convert_kind_destination(
    entry: &str,
    to_kind: EntityKind,
    marketplace: Option<&str>,
    plugin: Option<&str>,
) -> Result<String, String> {
    if !to_kind.holds_components() {
        return move_destination(entry, to_kind, marketplace, plugin);
    }
    let dir = new_note_dir(Some(&Placement {
        marketplace: marketplace.map(str::to_owned),
        plugin: plugin.map(str::to_owned),
        kind: Some(to_kind.as_str().to_owned()),
        folder: None,
    }))?;
    let name = component_slug(entry);
    Ok(format!("{dir}/{name}/{name}.md"))
}

/// The member folders a container of `kind` holds, read off [`KIND_DIRS`] so
/// the scaffold and the scan cannot disagree on what a plugin's folders are
/// called. Empty for every kind that holds nothing.
fn container_scaffold_dirs(kind: EntityKind) -> Vec<&'static str> {
    match kind {
        EntityKind::Marketplace => KIND_DIRS
            .iter()
            .filter(|(_, k)| *k == EntityKind::Plugin)
            .map(|(dir, _)| *dir)
            .collect(),
        EntityKind::Plugin => KIND_DIRS
            .iter()
            .filter(|(_, k)| !k.holds_components())
            .map(|(dir, _)| *dir)
            .collect(),
        _ => Vec::new(),
    }
}

/// How the core's discovery would judge this note, before it exists.
///
/// A real discovery pass over a scratch in-memory vault holding exactly this
/// one file at exactly this one vault-relative path. The path carries the real
/// folder levels, so a listed component comes back with its key already
/// resolved.
///
/// Being *skipped* by discovery is not the same as being refused by it, and
/// the difference is a whole kind of note. `read_source` gates on the kind
/// before it checks anything else, so a note declaring `sw-kind: plugin` comes
/// back as a silent skip — the component list is not where it belongs, and its
/// name never has to agree with its filename. The reader
/// ([`read_vault_skill`]) is what judges those notes, and it is asked here so
/// the form can offer `plugin` as a kind and have the write accept it.
pub fn scratch_scan(source: &str, rel_path: &str, ns: &Namespace) -> ScratchVerdict {
    match scratch_vault(source, rel_path) {
        Ok((vfs, abs)) => scan_scratch(&vfs, &abs, rel_path, ns),
        Err(refusal) => ScratchVerdict::Refused(refusal),
    }
}

/// [`scratch_scan`] over a scratch vault the caller keeps.
fn scan_scratch(vfs: &MemVfs, abs: &Path, rel_path: &str, ns: &Namespace) -> ScratchVerdict {
    let root = Path::new(SCRATCH_ROOT);
    match discover_components(vfs, root, None, ns) {
        Ok(mut found) if found.components.len() == 1 => {
            ScratchVerdict::Listed(Box::new(found.components.remove(0)))
        }
        Ok(_) => match read_vault_skill(vfs, abs, ns) {
            Ok(note) if note.frontmatter.kind() != EntityKind::Skill => ScratchVerdict::Skipped,
            Ok(_) => ScratchVerdict::Refused(format!(
                "the composed note is not one the vault's scan would list at `{rel_path}`"
            )),
            Err(e) => ScratchVerdict::Refused(e.to_string()),
        },
        Err(e) => ScratchVerdict::Refused(e.to_string()),
    }
}

/// A scratch in-memory vault holding `source` at `rel_path`, and that file's
/// absolute path in it.
fn scratch_vault(source: &str, rel_path: &str) -> Result<(MemVfs, std::path::PathBuf), String> {
    let vfs = MemVfs::new();
    let root = Path::new(SCRATCH_ROOT);
    let abs = root.join(rel_path);
    vfs.create_dir_all(abs.parent().unwrap_or(root))
        .and_then(|()| vfs.write_file(&abs, source.as_bytes()))
        .map_err(|e| e.to_string())?;
    Ok((vfs, abs))
}

/// Why the hook renderer would refuse this hook note, if it would.
///
/// Discovery lists a hook with no `event` or no payload; only the render at
/// publish refuses it. A write asks the renderer so the refusal comes at the
/// save. The scan and the draft preview do not: a form validates and previews
/// on every keystroke, and asks for `event` only on a later step.
fn hook_refusal(vfs: &MemVfs, abs: &Path, ns: &Namespace) -> Option<String> {
    let note = match read_vault_skill(vfs, abs, ns) {
        Ok(note) => note,
        Err(e) => return Some(e.to_string()),
    };
    crate::projection::to_adapt_hook(&note.projection, None)
        .err()
        .map(|e| e.to_string())
}

/// The note already holding this publish key, if another one is.
///
/// Uniqueness is per (marketplace, plugin, kind, name) — the directory a
/// component publishes onto — not per name: a `review` skill in one plugin
/// beside a `review` skill in another is two directories, and legal. Worth
/// its own check because discovery refuses the *whole* scan on a collision:
/// a note that introduced one would empty the list for every other note in
/// the vault, and the author would be reading a refusal about two paths
/// rather than about the thing they just did.
///
/// A vault whose scan is already refusing answers `None` — the check cannot
/// run, and the note being authored may well be the fix.
pub fn duplicate_key(
    vfs: &dyn Vfs,
    vault_dir: &Path,
    ours: &DiscoveredComponent,
    ns: &Namespace,
) -> Option<String> {
    key_collision(
        vfs,
        vault_dir,
        ns,
        &PublishKey {
            marketplace: ours.marketplace.as_deref(),
            plugin: ours.plugin.as_deref(),
            kind: ours.kind,
            name: &ours.name,
        },
        &ours.vault_relative_path,
    )
}

/// Why this note would be refused: by the scratch scan, by the hook renderer
/// (`hook_refusal`), or by the publish key it would collide with in the real
/// vault. `None` means writable.
pub fn refusal_for(
    vfs: &dyn Vfs,
    source: &str,
    rel_path: &str,
    vault_dir: &Path,
    ns: &Namespace,
) -> Option<String> {
    refusal(vfs, source, rel_path, vault_dir, ns, true)
}

/// [`refusal_for`] without the hook renderer: what a draft preview shows. A
/// draft is previewed while the author is still typing, before the step that
/// asks for a hook's `event`.
pub fn draft_refusal_for(
    vfs: &dyn Vfs,
    source: &str,
    rel_path: &str,
    vault_dir: &Path,
    ns: &Namespace,
) -> Option<String> {
    refusal(vfs, source, rel_path, vault_dir, ns, false)
}

fn refusal(
    vfs: &dyn Vfs,
    source: &str,
    rel_path: &str,
    vault_dir: &Path,
    ns: &Namespace,
    render_hooks: bool,
) -> Option<String> {
    let (scratch, abs) = match scratch_vault(source, rel_path) {
        Ok(kept) => kept,
        Err(refusal) => return Some(refusal),
    };
    match scan_scratch(&scratch, &abs, rel_path, ns) {
        ScratchVerdict::Refused(refusal) => Some(refusal),
        ScratchVerdict::Skipped => None,
        ScratchVerdict::Listed(ours) => {
            if render_hooks
                && ours.kind == EntityKind::Hook
                && let Some(refusal) = hook_refusal(&scratch, &abs, ns)
            {
                return Some(refusal);
            }
            duplicate_key(vfs, vault_dir, &ours, ns)
        }
    }
}

/// The complete note text a request would produce.
///
/// `existing` is the file as it sits on disk for a rewrite, `None` for a new
/// note. A note with no frontmatter block — or an empty one — is seeded with a
/// throwaway `name: ''` so the document root is the mapping the edit needs;
/// the first edit overwrites that value, so the seed never survives.
///
/// `split` and `edit_frontmatter` agree on split form — the last line
/// unterminated — so the block `edit_frontmatter` returns is exactly what
/// `compose` expects, with no newline bookkeeping of our own.
pub fn compose_note(
    existing: Option<&str>,
    fields: &[FieldEdit],
    body: &str,
) -> Result<String, CoreError> {
    let split = existing.map(frontmatter_lossless::split);
    let mut shape = split.as_ref().map_or_else(
        || frontmatter_lossless::new_shape(frontmatter_lossless::NewShapeOptions::default()),
        |s| s.shape,
    );
    let (yaml, seeded) = match split.as_ref().and_then(|s| s.yaml) {
        Some(yaml) if !yaml.trim().is_empty() => (yaml.to_owned(), false),
        _ => ("name: ''".to_owned(), true),
    };
    // An adjacent-fence empty block (`---\n---`) records `close_sep: false`,
    // because it had no separator byte to restore. Filling that block gives it
    // content, and content needs the separator back — without this the closing
    // fence is written onto the end of the last key.
    if seeded {
        shape.close_sep = true;
    }

    let outcome = edit_frontmatter(&yaml, &splice_edits(fields)).map_err(|e| {
        CoreError::refused(
            "frontmatter-edit",
            format!("frontmatter could not be edited: {e}"),
        )
    })?;
    let block = String::from_utf8(outcome.bytes).map_err(|e| {
        CoreError::refused(
            "frontmatter-encoding",
            format!("edited frontmatter is not UTF-8: {e}"),
        )
    })?;
    Ok(frontmatter_lossless::compose(Some(&block), body, shape))
}

/// How the scratch discovery pass judged one composed note.
#[derive(Debug)]
pub enum ScratchVerdict {
    /// The scan lists it, and the component carries the resolved
    /// (marketplace, plugin, kind, name) the folders and frontmatter decided.
    Listed(Box<DiscoveredComponent>),
    /// Legitimately skipped — a container note the component list is not for.
    Skipped,
    /// The scan refuses it, in the core's own words.
    Refused(String),
}

/// Where a conversion lands and the member folders it creates.
struct ConvertTarget {
    to: String,
    /// Member folders the conversion creates, vault-relative.
    scaffold: Vec<String>,
}

/// [`ConvertTarget`], or the refusal that stops the conversion. Asked by a
/// preview and again by the apply, the same discipline [`rename_collision`]
/// states for its own check.
fn convert_target(
    vfs: &dyn Vfs,
    vault_dir: &Path,
    ns: &Namespace,
    entry: &str,
    to_kind: EntityKind,
) -> Result<ConvertTarget, String> {
    let Some(component) = find_component(vfs, vault_dir, entry, ns) else {
        return Err(format!(
            "`{entry}` is not a component the vault's scan lists"
        ));
    };
    if component.kind == to_kind {
        return Err(format!("`{entry}` is already a {}", to_kind.as_str()));
    }
    // The hook kind is out of this action's vocabulary: a hook's event and
    // matcher have no counterpart in another kind, and nothing here would
    // know what to do with them.
    if component.kind == EntityKind::Hook || to_kind == EntityKind::Hook {
        return Err("converting to or from `hook` is not offered here".to_owned());
    }
    // Converting away from a container would orphan what it holds: the
    // members are grouped by the folder, and the folder stops being a
    // container the moment its note stops naming one.
    if component.kind.holds_components()
        && let Some(dir) = bundle_dir(entry)
    {
        let members = container_members(vfs, vault_dir, dir, entry);
        if !members.is_empty() {
            return Err(format!(
                "`{entry}` still holds {}: {}",
                if members.len() == 1 {
                    "a component"
                } else {
                    "components"
                },
                members.join(", "),
            ));
        }
    }

    let (to_market, to_plugin) = convert_placement(
        to_kind,
        component.marketplace.as_deref(),
        component.folder_plugin.as_deref(),
    );
    let to = convert_kind_destination(entry, to_kind, to_market.as_deref(), to_plugin.as_deref())?;

    // The key the destination publishes onto. A conversion that keeps the
    // plugin level keeps whatever `sw-plugin` resolved to; one that drops it
    // publishes at the level the folders now put the note.
    let key_plugin = to_plugin.as_ref().and_then(|_| component.plugin.clone());
    if let Some(refusal) = key_collision(
        vfs,
        vault_dir,
        ns,
        &PublishKey {
            marketplace: to_market.as_deref(),
            plugin: key_plugin.as_deref(),
            kind: to_kind,
            name: &component.name,
        },
        entry,
    ) {
        return Err(refusal);
    }

    let scaffold = match bundle_dir(&to) {
        Some(container_dir) => container_scaffold_dirs(to_kind)
            .into_iter()
            .map(|d| format!("{container_dir}/{d}"))
            .collect(),
        None => Vec::new(),
    };
    Ok(ConvertTarget { to, scaffold })
}

/// The kind a placement names, when it names one this crate knows.
fn placement_kind(placement: Option<&Placement>) -> Option<EntityKind> {
    placement
        .and_then(|p| p.kind.as_deref())
        .and_then(|kind| kind.trim().parse::<EntityKind>().ok())
}

/// The member folders a newly created container gets, vault-relative.
fn create_scaffold(path: &str, kind: Option<EntityKind>) -> Vec<String> {
    let (Some(dir), Some(kind)) = (bundle_dir(path), kind) else {
        return Vec::new();
    };
    container_scaffold_dirs(kind)
        .into_iter()
        .map(|d| format!("{dir}/{d}"))
        .collect()
}

/// Every member note whose explicit `sw-plugin` key names `plugin_slug`
/// outright — the set a plugin rename must rewrite. Read from the OLD tree,
/// before anything moves.
fn stale_plugin_key_members(
    vfs: &dyn Vfs,
    vault_dir: &Path,
    dir: &str,
    entry: &str,
    plugin_slug: &str,
    ns: &Namespace,
) -> Vec<String> {
    container_members(vfs, vault_dir, dir, entry)
        .into_iter()
        .filter(|member| {
            read_vault_skill(vfs, &vault_dir.join(member), ns)
                .is_ok_and(|note| note.frontmatter.plugin.as_deref() == Some(plugin_slug))
        })
        .collect()
}

/// [`FieldEdit`] in the editor's own vocabulary. Total: `None` is a removal,
/// and nothing here can produce the `Rename` this module never asks for.
pub fn splice_edits(edits: &[FieldEdit]) -> Vec<yaml_splice::FieldEdit> {
    edits
        .iter()
        .map(|edit| match &edit.value {
            Some(value) => yaml_splice::FieldEdit::Set {
                key: edit.key.clone(),
                value: value.clone(),
            },
            None => yaml_splice::FieldEdit::Remove {
                key: edit.key.clone(),
            },
        })
        .collect()
}

/// `edits` with `name` forced to `slug`, appended at the front when the
/// caller named no `name` at all.
fn with_name(edits: &[FieldEdit], slug: &str) -> Vec<FieldEdit> {
    let mut edits = edits.to_vec();
    let named = FieldEdit::set("name", yaml_splice::Value::Str(slug.to_owned()));
    match edits.iter_mut().find(|e| e.key == "name") {
        Some(existing) => *existing = named,
        None => edits.insert(0, named),
    }
    edits
}

/// One frontmatter key's raw value, read out of `source` as a string.
///
/// `None` for no frontmatter block and for a key the frontmatter does not
/// have. Exists so a caller can read one raw, unmodeled key — an
/// author-managed `sw-version`, say — without this crate modeling that key
/// as a typed field.
pub fn read_field(source: &str, key: &str) -> Result<Option<String>, CoreError> {
    let yaml = match frontmatter_lossless::split(source).yaml {
        Some(yaml) if !yaml.trim().is_empty() => yaml,
        _ => return Ok(None),
    };
    let mapping = parse_mapping(yaml).map_err(|e| {
        CoreError::refused(
            "frontmatter-read",
            format!("frontmatter could not be read: {e}"),
        )
    })?;
    Ok(mapping.get(key).map(|value| value.to_string()))
}

/// The note as it would be written to disk, frontmatter spliced and body kept.
///
/// See [`compose_note`] for the seeding rule; this is that function with the
/// body read back off `source`, which is what a host applying an op's
/// `frontmatter` list to an existing note needs.
pub fn apply_field_edits(source: &str, edits: &[FieldEdit]) -> Result<String, CoreError> {
    compose_note(
        Some(source),
        edits,
        frontmatter_lossless::split(source).body,
    )
}

// ── The plans ───────────────────────────────────────────────────────────────

/// The note a create is asked for: where it goes, what it is called, and
/// what it says.
#[derive(Debug, Clone)]
pub struct NewNote<'a> {
    /// Where the author put it, or `None` for the default placement.
    pub placement: Option<&'a Placement>,
    /// The name as typed; the filename is slugged from it.
    pub name: &'a str,
    /// Author it as `<slug>/<slug>.md` with a folder of its own. A container
    /// kind is bundled whatever this says.
    pub bundled: bool,
    /// The frontmatter, complete rather than a patch. A `name` edit here is
    /// overwritten with the slug.
    pub fields: &'a [FieldEdit],
    /// Everything below the frontmatter block.
    pub body: &'a str,
}

/// Write a new note: its derived path, its composed bytes, and the member
/// folders a container kind gets.
///
/// The path is derived rather than accepted because the vault's scan requires
/// the filename to slugify to the note's `name` (`<slug>.md`, or
/// `<slug>/<slug>.md` for a bundle). Slugging the name and building both the
/// path and the `name` edit from that one value makes the two agree by
/// construction.
///
/// `Err` is the refusal, in the words a draft shows while the author types: a
/// name with nothing to slug, a placement naming what no folder can be, or a
/// note the vault's own scan would reject once written.
pub fn plan_create_note(
    vfs: &dyn Vfs,
    vault: &Path,
    ns: &Namespace,
    note: &NewNote<'_>,
) -> Result<AuthoringOp, String> {
    let (path, edits) = derive_create(note.placement, note.name, note.bundled, note.fields)?;
    let bytes = compose_note(None, &edits, note.body).map_err(|e| e.to_string())?;
    if let Some(refusal) = refusal_for(vfs, &bytes, &path, vault, ns) {
        return Err(refusal);
    }
    let scaffold = create_scaffold(&path, placement_kind(note.placement));
    Ok(AuthoringOp::Create {
        path,
        bytes,
        scaffold,
    })
}

/// Rename a component: move the note (and, for a bundle, its folder), then
/// set `name` to the new slug.
pub fn plan_rename_component(
    vfs: &dyn Vfs,
    vault: &Path,
    ns: &Namespace,
    entry: &str,
    new_name: &str,
) -> Result<AuthoringOp, String> {
    let slug = slugify(new_name);
    if let Some(refusal) = slug_refusal(&slug, "component name") {
        return Err(refusal);
    }
    let to = rename_destination(entry, &slug);
    if let Some(refusal) = rename_collision(vfs, vault, ns, entry, &to, &slug) {
        return Err(refusal);
    }
    Ok(AuthoringOp::Rename {
        from: entry.to_owned(),
        to,
        bundle: bundle_dir(entry).is_some(),
        frontmatter: vec![FieldEdit::set("name", yaml_splice::Value::Str(slug))],
    })
}

/// Move a component to a new placement.
///
/// **The rule:** a move always REMOVES an explicit `sw-plugin` key when the
/// note carries one — never sets or rewrites it, whatever `plugin` is. The
/// physical folder now correctly names the destination (that is what the move
/// does), so an explicit key left behind is stale by construction: it named
/// where the note WAS grouped, and the folder alone decides where it is
/// grouped now — including "no plugin" when `plugin` is `None`, shared at the
/// marketplace level. A caller that wants a virtual grouping preserved
/// through a physical move rewrites it afterward; this op does not infer that
/// intent.
pub fn plan_move_component(
    vfs: &dyn Vfs,
    vault: &Path,
    ns: &Namespace,
    entry: &str,
    marketplace: Option<&str>,
    plugin: Option<&str>,
) -> Result<AuthoringOp, String> {
    let Some(component) = find_component(vfs, vault, entry, ns) else {
        return Err(format!(
            "`{entry}` is not a component the vault's scan lists"
        ));
    };
    let to = move_destination(entry, component.kind, marketplace, plugin)?;
    if let Some(refusal) = key_collision(
        vfs,
        vault,
        ns,
        &PublishKey {
            marketplace,
            plugin,
            kind: component.kind,
            name: &component.name,
        },
        entry,
    ) {
        return Err(refusal);
    }
    let carries_plugin_key = read_vault_skill(vfs, &vault.join(entry), ns)
        .ok()
        .and_then(|note| note.frontmatter.plugin)
        .is_some();
    Ok(AuthoringOp::Move {
        from: entry.to_owned(),
        to,
        bundle: bundle_dir(entry).is_some(),
        frontmatter: if carries_plugin_key {
            vec![FieldEdit::remove(ns.key("plugin"))]
        } else {
            Vec::new()
        },
    })
}

/// Delete a component, plus the one check a generic delete cannot make:
/// refusing a container note (plugin or marketplace) whose folder still holds
/// members. Deleting an empty container's note is allowed — nothing else is
/// there to lose.
pub fn plan_delete_component(
    vfs: &dyn Vfs,
    vault: &Path,
    ns: &Namespace,
    entry: &str,
) -> Result<AuthoringOp, String> {
    if let Some(component) = find_component(vfs, vault, entry, ns)
        && component.kind.holds_components()
        && let Some(dir) = bundle_dir(entry)
    {
        let members = container_members(vfs, vault, dir, entry);
        if !members.is_empty() {
            return Err(format!(
                "`{}` still holds {}: {}",
                entry,
                if members.len() == 1 {
                    "a component"
                } else {
                    "components"
                },
                members.join(", "),
            ));
        }
    }
    Ok(deletion(entry))
}

/// Delete a container's whole folder — its own note plus every component
/// beneath it — whether or not it still holds members. Holding members is
/// what a container delete is for, so [`plan_delete_component`]'s refusal is
/// dropped here; only the kind is checked.
pub fn plan_delete_container(
    vfs: &dyn Vfs,
    vault: &Path,
    ns: &Namespace,
    entry: &str,
    expected_kind: EntityKind,
) -> Result<AuthoringOp, String> {
    if let Some(component) = find_component(vfs, vault, entry, ns)
        && component.kind != expected_kind
    {
        return Err(format!(
            "`{}` is not a {}'s own entry note",
            entry,
            expected_kind.as_str()
        ));
    }
    Ok(deletion(entry))
}

/// What a delete removes: a bundle's whole folder, or a lone note's file.
fn deletion(entry: &str) -> AuthoringOp {
    AuthoringOp::Delete {
        paths: vec![bundle_dir(entry).unwrap_or(entry).to_owned()],
        trash_dir: TRASH_DIR.to_owned(),
    }
}

/// Rename a plugin: move its folder, set its own `name`, then rewrite every
/// member whose explicit `sw-plugin` key named the old slug. A member that
/// takes its plugin from the folder needs no edit — the folder moved with it.
pub fn plan_rename_plugin(
    vfs: &dyn Vfs,
    vault: &Path,
    ns: &Namespace,
    entry: &str,
    new_name: &str,
) -> Result<AuthoringOp, String> {
    let slug = slugify(new_name);
    if let Some(refusal) = slug_refusal(&slug, "plugin name") {
        return Err(refusal);
    }
    let Some(component) = find_component(vfs, vault, entry, ns) else {
        return Err(format!(
            "`{entry}` is not a component the vault's scan lists"
        ));
    };
    if component.kind != EntityKind::Plugin {
        return Err(format!("`{entry}` is not a plugin's own entry note"));
    }
    let old_slug = component.name;
    let to = rename_destination(entry, &slug);
    if let Some(refusal) = rename_collision(vfs, vault, ns, entry, &to, &slug) {
        return Err(refusal);
    }
    let (Some(dir_from), Some(dir_to)) = (bundle_dir(entry), bundle_dir(&to)) else {
        return Err(format!(
            "`{entry}` is not a plugin's own `<dir>/<dir>.md` entry note, so its folder has no \
             name to move"
        ));
    };
    let (dir_from, dir_to) = (dir_from.to_owned(), dir_to.to_owned());
    let members = stale_plugin_key_members(vfs, vault, &dir_from, entry, &old_slug, ns)
        .into_iter()
        .map(|member| {
            (
                member,
                vec![FieldEdit::set(
                    ns.key("plugin"),
                    yaml_splice::Value::Str(slug.clone()),
                )],
            )
        })
        .collect();
    Ok(AuthoringOp::RenamePlugin {
        from: entry.to_owned(),
        to,
        dir_from,
        dir_to,
        frontmatter: vec![FieldEdit::set("name", yaml_splice::Value::Str(slug))],
        members,
    })
}

/// Rename a marketplace: [`plan_rename_component`] with a kind guard. A
/// marketplace's own note has no member key to rewrite, so there is no
/// third step the way a plugin rename has one.
pub fn plan_rename_marketplace(
    vfs: &dyn Vfs,
    vault: &Path,
    ns: &Namespace,
    entry: &str,
    new_name: &str,
) -> Result<AuthoringOp, String> {
    if let Some(component) = find_component(vfs, vault, entry, ns)
        && component.kind != EntityKind::Marketplace
    {
        return Err(format!("`{entry}` is not a marketplace's own entry note"));
    }
    plan_rename_component(vfs, vault, ns, entry, new_name)
}

/// Convert a note to another kind: move it into the new kind's folder, set
/// `sw-kind`, remove the keys the new kind does not carry, and make the
/// member folders a container kind holds.
///
/// `drop_keys` is the caller's list, not this crate's: the table saying which
/// fields a kind carries belongs to whatever renders the form, and a second
/// copy here would be a second answer to the same question. Only
/// `UNDROPPABLE_KEYS` are refused.
pub fn plan_convert_kind(
    vfs: &dyn Vfs,
    vault: &Path,
    ns: &Namespace,
    entry: &str,
    to_kind: EntityKind,
    drop_keys: &[String],
) -> Result<AuthoringOp, String> {
    // Trimmed, because the edit loop below trims before it emits a removal:
    // an untrimmed guard lets `" name"` through and then drops the real
    // `name` key, which is the one the vault's discovery scan reads.
    if let Some(key) = drop_keys
        .iter()
        .find(|k| UNDROPPABLE_KEYS.contains(&k.trim()))
    {
        return Err(format!(
            "`{key}` is carried by every kind and is not dropped by a conversion"
        ));
    }
    let target = convert_target(vfs, vault, ns, entry, to_kind)?;
    // `sw-kind` first, then the removals — one list, so a note never sits
    // with its new kind declared and the old kind's keys still on it.
    let kind_key = ns.key("kind");
    let mut frontmatter = vec![FieldEdit::set(
        kind_key.clone(),
        yaml_splice::Value::Str(to_kind.as_str().to_owned()),
    )];
    let mut dropped: BTreeSet<&str> = BTreeSet::new();
    for key in drop_keys {
        let key = key.trim();
        if key.is_empty() || key == kind_key || !dropped.insert(key) {
            continue;
        }
        frontmatter.push(FieldEdit::remove(key));
    }
    Ok(AuthoringOp::ConvertKind {
        from: entry.to_owned(),
        to: target.to,
        bundle: bundle_dir(entry).is_some(),
        frontmatter,
        scaffold: target.scaffold,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use yaml_splice::Value;

    const VAULT: &str = "/vault";

    fn sw() -> Namespace {
        Namespace::default()
    }

    fn vault() -> &'static Path {
        Path::new(VAULT)
    }

    fn write(vfs: &MemVfs, rel: &str, content: &str) {
        let path = Path::new(VAULT).join(rel);
        vfs.create_dir_all(path.parent().unwrap()).unwrap();
        vfs.write_file(&path, content.as_bytes()).unwrap();
    }

    /// A component note: the two keys every kind carries, plus whatever else.
    fn note(name: &str, extra: &str) -> String {
        format!(
            "---\nname: {name}\ndescription: Use this skill to test {name}.\n{extra}---\n\n# Body\n"
        )
    }

    #[test]
    fn a_hook_the_renderer_would_refuse_is_refused_at_the_save() {
        let vfs = MemVfs::new();
        let at = "marketplaces/m/plugins/p/hooks/lint-on-write.md";
        let hook = |extra: &str, body: &str| {
            format!(
                "---\nname: lint-on-write\ndescription: Lints after a write.\n{extra}---\n\n{body}"
            )
        };

        let no_event = refusal_for(&vfs, &hook("", "npm run lint\n"), at, vault(), &sw());
        assert!(
            no_event
                .as_deref()
                .is_some_and(|r| r.contains("hook-missing-event")),
            "{no_event:?}"
        );

        let no_url = refusal_for(
            &vfs,
            &hook("event: PostToolUse\ntype: http\n", ""),
            at,
            vault(),
            &sw(),
        );
        assert!(
            no_url
                .as_deref()
                .is_some_and(|r| r.contains("hook-missing-payload")),
            "{no_url:?}"
        );

        assert!(
            matches!(
                scratch_scan(&hook("", ""), at, &sw()),
                ScratchVerdict::Listed(_)
            ),
            "the scan a form runs per keystroke still lists an incomplete hook"
        );

        assert_eq!(
            draft_refusal_for(&vfs, &hook("", ""), at, vault(), &sw()),
            None,
            "a draft preview does not ask the renderer"
        );

        let complete = refusal_for(
            &vfs,
            &hook("event: PostToolUse\n", "npm run lint\n"),
            at,
            vault(),
            &sw(),
        );
        assert_eq!(complete, None);
    }

    fn fields(name: &str) -> Vec<FieldEdit> {
        vec![
            FieldEdit::set("name", Value::Str(name.to_owned())),
            FieldEdit::set(
                "description",
                Value::Str(format!("Use this skill to test {name}.")),
            ),
        ]
    }

    fn placement(marketplace: &str, plugin: &str, kind: &str) -> Placement {
        Placement {
            marketplace: Some(marketplace.to_owned()),
            plugin: Some(plugin.to_owned()),
            kind: Some(kind.to_owned()),
            folder: None,
        }
    }

    /// One plugin holding one skill, the shape most of these tests start from.
    fn one_plugin() -> MemVfs {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/tools.md",
            &note("tools", "sw-kind: plugin\n"),
        );
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/review.md",
            &note("review", ""),
        );
        vfs
    }

    // ── Placement and naming ────────────────────────────────────────────────

    #[test]
    fn a_create_with_no_placement_lands_on_the_defaults() {
        assert_eq!(
            new_note_dir(None).unwrap(),
            "marketplaces/default/plugins/core/skills"
        );
    }

    #[test]
    fn a_kind_folder_is_read_off_the_kind_map() {
        assert_eq!(
            new_note_dir(Some(&placement("house", "tools", "command"))).unwrap(),
            "marketplaces/house/plugins/tools/commands"
        );
    }

    #[test]
    fn a_placement_names_a_kind_or_a_folder_never_both() {
        let mut p = placement("house", "tools", "skill");
        p.folder = Some("roles".to_owned());
        assert_eq!(
            new_note_dir(Some(&p)).unwrap_err(),
            "a placement names a kind or a plain folder, never both — a plain note has no kind"
        );
    }

    #[test]
    fn a_placement_names_one_of_them() {
        assert_eq!(
            new_note_dir(Some(&Placement::default())).unwrap_err(),
            "the placement names neither a kind nor a folder"
        );
    }

    #[test]
    fn a_plain_folder_may_not_be_a_kind_folder() {
        let p = Placement {
            marketplace: Some("house".to_owned()),
            plugin: Some("tools".to_owned()),
            kind: None,
            folder: Some("skills".to_owned()),
        };
        assert_eq!(
            new_note_dir(Some(&p)).unwrap_err(),
            "`skills` is the folder a skill lands in — a plain note names a folder of its own"
        );
    }

    #[test]
    fn a_level_that_is_not_one_folder_name_is_refused() {
        let mut p = placement("../elsewhere", "tools", "skill");
        p.marketplace = Some("../elsewhere".to_owned());
        assert_eq!(
            new_note_dir(Some(&p)).unwrap_err(),
            "`../elsewhere` is not one folder name for the marketplace"
        );
    }

    #[test]
    fn a_plugin_is_authored_inside_a_marketplace() {
        assert_eq!(
            new_note_dir(Some(&Placement {
                marketplace: Some("house".to_owned()),
                plugin: None,
                kind: Some("plugin".to_owned()),
                folder: None,
            }))
            .unwrap(),
            "marketplaces/house/plugins"
        );
        assert_eq!(
            new_note_dir(Some(&placement("house", "tools", "plugin"))).unwrap_err(),
            PLUGIN_NESTED
        );
    }

    #[test]
    fn a_marketplace_names_no_level_below_itself() {
        assert_eq!(
            new_note_dir(Some(&Placement {
                marketplace: None,
                plugin: None,
                kind: Some("marketplace".to_owned()),
                folder: None,
            }))
            .unwrap(),
            "marketplaces"
        );
        assert_eq!(
            new_note_dir(Some(&placement("house", "tools", "marketplace"))).unwrap_err(),
            "a marketplace is not authored inside a plugin"
        );
    }

    #[test]
    fn a_name_with_nothing_sluggable_is_refused() {
        assert_eq!(
            slug_refusal("", "component name").unwrap(),
            nameless("component name")
        );
        assert!(slug_refusal("review", "component name").is_none());
    }

    // ── Create ──────────────────────────────────────────────────────────────

    #[test]
    fn a_create_derives_its_path_from_the_slugged_name() {
        let vfs = one_plugin();
        let p = placement("house", "tools", "skill");
        let op = plan_create_note(
            &vfs,
            vault(),
            &sw(),
            &NewNote {
                placement: Some(&p),
                name: "Code Review",
                bundled: false,
                fields: &fields("ignored"),
                body: "\n# Body\n",
            },
        )
        .unwrap();
        let AuthoringOp::Create {
            path,
            bytes,
            scaffold,
        } = op
        else {
            panic!("expected a create");
        };
        assert_eq!(
            path,
            "marketplaces/house/plugins/tools/skills/code-review.md"
        );
        assert!(bytes.contains("name: code-review"), "{bytes}");
        assert!(scaffold.is_empty());
    }

    #[test]
    fn a_bundled_create_gets_a_folder_of_its_own() {
        let vfs = one_plugin();
        let p = placement("house", "tools", "skill");
        let AuthoringOp::Create { path, .. } = plan_create_note(
            &vfs,
            vault(),
            &sw(),
            &NewNote {
                placement: Some(&p),
                name: "deploy",
                bundled: true,
                fields: &fields("deploy"),
                body: "\n# Body\n",
            },
        )
        .unwrap() else {
            panic!("expected a create");
        };
        assert_eq!(
            path,
            "marketplaces/house/plugins/tools/skills/deploy/deploy.md"
        );
    }

    #[test]
    fn a_created_container_is_bundled_and_scaffolded() {
        let vfs = one_plugin();
        let p = Placement {
            marketplace: Some("house".to_owned()),
            plugin: None,
            kind: Some("plugin".to_owned()),
            folder: None,
        };
        let AuthoringOp::Create { path, scaffold, .. } = plan_create_note(
            &vfs,
            vault(),
            &sw(),
            &NewNote {
                placement: Some(&p),
                name: "extras",
                bundled: false,
                fields: &fields("extras"),
                body: "\n# Body\n",
            },
        )
        .unwrap() else {
            panic!("expected a create");
        };
        assert_eq!(path, "marketplaces/house/plugins/extras/extras.md");
        assert_eq!(
            scaffold,
            vec![
                "marketplaces/house/plugins/extras/skills",
                "marketplaces/house/plugins/extras/commands",
                "marketplaces/house/plugins/extras/agents",
                "marketplaces/house/plugins/extras/hooks",
            ]
        );
    }

    #[test]
    fn a_create_onto_an_occupied_publish_key_is_refused() {
        let vfs = one_plugin();
        let p = placement("house", "tools", "skill");
        let refusal = plan_create_note(
            &vfs,
            vault(),
            &sw(),
            &NewNote {
                placement: Some(&p),
                name: "review",
                bundled: true,
                fields: &fields("review"),
                body: "\n# Body\n",
            },
        )
        .unwrap_err();
        assert!(
            refusal.contains("two components cannot publish onto one marketplace directory"),
            "{refusal}"
        );
    }

    #[test]
    fn a_create_the_scan_would_refuse_is_refused_here() {
        let vfs = one_plugin();
        let p = placement("house", "tools", "skill");
        let refusal = plan_create_note(
            &vfs,
            vault(),
            &sw(),
            &NewNote {
                placement: Some(&p),
                name: "audit",
                bundled: false,
                fields: &[
                    FieldEdit::set("name", Value::Str("audit".to_owned())),
                    FieldEdit::set("description", Value::Str("d".repeat(1025))),
                ],
                body: "\n# Body\n",
            },
        )
        .unwrap_err();
        assert!(
            refusal.contains("not one the vault's scan would list"),
            "{refusal}"
        );
    }

    // ── Rename ──────────────────────────────────────────────────────────────

    #[test]
    fn a_rename_keeps_a_lone_note_in_its_folder() {
        assert_eq!(
            rename_destination("plugins/tools/skills/review.md", "audit"),
            "plugins/tools/skills/audit.md"
        );
    }

    #[test]
    fn a_rename_moves_a_bundle_folder_with_its_entry() {
        assert_eq!(
            rename_destination("plugins/tools/skills/review/review.md", "audit"),
            "plugins/tools/skills/audit/audit.md"
        );
        assert_eq!(
            rename_destination("plugins/tools/skills/review/SKILL.md", "audit"),
            "plugins/tools/skills/audit/SKILL.md"
        );
        assert_eq!(
            bundle_dir("plugins/tools/review/SKILL.md"),
            Some("plugins/tools/review")
        );
    }

    /// A `SKILL.md` skill keeps its entry file on a move, and takes its
    /// folder's name when converted to a kind that cannot use `SKILL.md`.
    #[test]
    fn a_skill_md_entry_survives_a_move_but_not_a_conversion() {
        let entry = "marketplaces/house/plugins/tools/skills/audit/SKILL.md";
        assert_eq!(
            move_destination(entry, EntityKind::Skill, Some("house"), Some("extras")).unwrap(),
            "marketplaces/house/plugins/extras/skills/audit/SKILL.md"
        );
        assert_eq!(
            convert_kind_destination(entry, EntityKind::Command, Some("house"), Some("tools"))
                .unwrap(),
            "marketplaces/house/plugins/tools/commands/audit/audit.md"
        );
    }

    #[test]
    fn a_rename_sets_the_name_key_to_the_new_slug() {
        let vfs = one_plugin();
        let AuthoringOp::Rename {
            from,
            to,
            bundle,
            frontmatter,
        } = plan_rename_component(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/review.md",
            "Deep Audit",
        )
        .unwrap()
        else {
            panic!("expected a rename");
        };
        assert_eq!(from, "marketplaces/house/plugins/tools/skills/review.md");
        assert_eq!(to, "marketplaces/house/plugins/tools/skills/deep-audit.md");
        assert!(!bundle);
        assert_eq!(
            frontmatter,
            vec![FieldEdit::set("name", Value::Str("deep-audit".to_owned()))]
        );
    }

    #[test]
    fn a_rename_onto_an_occupied_key_is_refused() {
        let vfs = one_plugin();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/audit.md",
            &note("audit", ""),
        );
        let refusal = plan_rename_component(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/review.md",
            "audit",
        )
        .unwrap_err();
        assert!(
            refusal.starts_with("`audit` is already the name of"),
            "{refusal}"
        );
    }

    #[test]
    fn a_rename_to_an_unsluggable_name_is_refused() {
        let vfs = one_plugin();
        assert_eq!(
            plan_rename_component(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/skills/review.md",
                "   ",
            )
            .unwrap_err(),
            nameless("component name")
        );
    }

    // ── Move ────────────────────────────────────────────────────────────────

    #[test]
    fn a_move_keeps_the_component_kind_and_its_own_filename() {
        assert_eq!(
            move_destination(
                "plugins/tools/skills/review.md",
                EntityKind::Skill,
                Some("house"),
                Some("extras"),
            )
            .unwrap(),
            "marketplaces/house/plugins/extras/skills/review.md"
        );
    }

    #[test]
    fn a_move_removes_an_explicit_plugin_key() {
        let vfs = one_plugin();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/keyed.md",
            &note("keyed", "sw-plugin: tools\n"),
        );
        let AuthoringOp::Move {
            frontmatter, to, ..
        } = plan_move_component(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/keyed.md",
            Some("house"),
            Some("extras"),
        )
        .unwrap()
        else {
            panic!("expected a move");
        };
        assert_eq!(to, "marketplaces/house/plugins/extras/skills/keyed.md");
        assert_eq!(frontmatter, vec![FieldEdit::remove("sw-plugin")]);
    }

    #[test]
    fn a_move_of_an_unkeyed_note_edits_no_frontmatter() {
        let vfs = one_plugin();
        let AuthoringOp::Move { frontmatter, .. } = plan_move_component(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/review.md",
            Some("house"),
            Some("extras"),
        )
        .unwrap() else {
            panic!("expected a move");
        };
        assert!(frontmatter.is_empty());
    }

    #[test]
    fn a_move_of_a_note_the_scan_does_not_list_is_refused() {
        let vfs = one_plugin();
        assert_eq!(
            plan_move_component(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/skills/absent.md",
                Some("house"),
                Some("extras"),
            )
            .unwrap_err(),
            "`marketplaces/house/plugins/tools/skills/absent.md` is not a component the vault's \
             scan lists"
        );
    }

    // ── Delete ──────────────────────────────────────────────────────────────

    #[test]
    fn a_delete_trashes_the_note() {
        let vfs = one_plugin();
        let AuthoringOp::Delete { paths, trash_dir } = plan_delete_component(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/review.md",
        )
        .unwrap() else {
            panic!("expected a delete");
        };
        assert_eq!(
            paths,
            vec!["marketplaces/house/plugins/tools/skills/review.md"]
        );
        assert_eq!(trash_dir, ".trash");
    }

    #[test]
    fn a_delete_of_a_bundle_takes_its_whole_folder() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/deploy/deploy.md",
            &note("deploy", ""),
        );
        let AuthoringOp::Delete { paths, .. } = plan_delete_component(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/deploy/deploy.md",
        )
        .unwrap() else {
            panic!("expected a delete");
        };
        assert_eq!(
            paths,
            vec!["marketplaces/house/plugins/tools/skills/deploy"]
        );
    }

    #[test]
    fn a_leaf_delete_refuses_a_container_that_still_holds_members() {
        let vfs = one_plugin();
        assert_eq!(
            plan_delete_component(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/tools.md",
            )
            .unwrap_err(),
            "`marketplaces/house/plugins/tools/tools.md` still holds a component: \
             marketplaces/house/plugins/tools/skills/review.md"
        );
    }

    #[test]
    fn a_container_delete_allows_the_members() {
        let vfs = one_plugin();
        let AuthoringOp::Delete { paths, .. } = plan_delete_container(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/tools.md",
            EntityKind::Plugin,
        )
        .unwrap() else {
            panic!("expected a delete");
        };
        assert_eq!(paths, vec!["marketplaces/house/plugins/tools"]);
    }

    #[test]
    fn a_container_delete_checks_the_kind() {
        let vfs = one_plugin();
        assert_eq!(
            plan_delete_container(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/tools.md",
                EntityKind::Marketplace,
            )
            .unwrap_err(),
            "`marketplaces/house/plugins/tools/tools.md` is not a marketplace's own entry note"
        );
    }

    // ── Plugin and marketplace rename ───────────────────────────────────────

    #[test]
    fn a_plugin_rename_moves_the_folder_and_rewrites_its_keyed_members() {
        let vfs = one_plugin();
        write(
            &vfs,
            "marketplaces/house/plugins/tools/skills/keyed.md",
            &note("keyed", "sw-plugin: tools\n"),
        );
        let AuthoringOp::RenamePlugin {
            from,
            to,
            dir_from,
            dir_to,
            frontmatter,
            members,
        } = plan_rename_plugin(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/tools.md",
            "Gear",
        )
        .unwrap()
        else {
            panic!("expected a plugin rename");
        };
        assert_eq!(from, "marketplaces/house/plugins/tools/tools.md");
        assert_eq!(to, "marketplaces/house/plugins/gear/gear.md");
        assert_eq!(dir_from, "marketplaces/house/plugins/tools");
        assert_eq!(dir_to, "marketplaces/house/plugins/gear");
        assert_eq!(
            frontmatter,
            vec![FieldEdit::set("name", Value::Str("gear".to_owned()))]
        );
        // Only the member whose explicit key named the old slug.
        assert_eq!(
            members,
            vec![(
                "marketplaces/house/plugins/tools/skills/keyed.md".to_owned(),
                vec![FieldEdit::set("sw-plugin", Value::Str("gear".to_owned()))],
            )]
        );
    }

    #[test]
    fn a_plugin_rename_checks_the_kind() {
        let vfs = one_plugin();
        assert_eq!(
            plan_rename_plugin(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/skills/review.md",
                "gear",
            )
            .unwrap_err(),
            "`marketplaces/house/plugins/tools/skills/review.md` is not a plugin's own entry note"
        );
    }

    #[test]
    fn a_marketplace_rename_checks_the_kind() {
        let vfs = one_plugin();
        assert_eq!(
            plan_rename_marketplace(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/tools.md",
                "shop",
            )
            .unwrap_err(),
            "`marketplaces/house/plugins/tools/tools.md` is not a marketplace's own entry note"
        );
    }

    // ── Convert ─────────────────────────────────────────────────────────────

    #[test]
    fn a_convert_moves_into_the_new_kinds_folder_and_restates_the_kind() {
        let vfs = one_plugin();
        let AuthoringOp::ConvertKind {
            to,
            frontmatter,
            scaffold,
            ..
        } = plan_convert_kind(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/review.md",
            EntityKind::Command,
            &[],
        )
        .unwrap()
        else {
            panic!("expected a conversion");
        };
        assert_eq!(to, "marketplaces/house/plugins/tools/commands/review.md");
        assert_eq!(
            frontmatter,
            vec![FieldEdit::set("sw-kind", Value::Str("command".to_owned()))]
        );
        assert!(scaffold.is_empty());
    }

    #[test]
    fn a_convert_to_a_container_scaffolds_its_member_folders() {
        let vfs = one_plugin();
        let AuthoringOp::ConvertKind { to, scaffold, .. } = plan_convert_kind(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/review.md",
            EntityKind::Plugin,
            &[],
        )
        .unwrap() else {
            panic!("expected a conversion");
        };
        // A plugin sits a level above its members, so the plugin level drops.
        assert_eq!(to, "marketplaces/house/plugins/review/review.md");
        assert_eq!(
            scaffold,
            vec![
                "marketplaces/house/plugins/review/skills",
                "marketplaces/house/plugins/review/commands",
                "marketplaces/house/plugins/review/agents",
                "marketplaces/house/plugins/review/hooks",
            ]
        );
    }

    #[test]
    fn a_convert_refuses_hook() {
        let vfs = one_plugin();
        assert_eq!(
            plan_convert_kind(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/skills/review.md",
                EntityKind::Hook,
                &[],
            )
            .unwrap_err(),
            "converting to or from `hook` is not offered here"
        );
    }

    #[test]
    fn a_convert_refuses_a_container_that_still_holds_members() {
        let vfs = one_plugin();
        assert_eq!(
            plan_convert_kind(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/tools.md",
                EntityKind::Skill,
                &[],
            )
            .unwrap_err(),
            "`marketplaces/house/plugins/tools/tools.md` still holds a component: \
             marketplaces/house/plugins/tools/skills/review.md"
        );
    }

    #[test]
    fn a_convert_never_drops_name_or_description() {
        let vfs = one_plugin();
        for key in UNDROPPABLE_KEYS {
            assert_eq!(
                plan_convert_kind(
                    &vfs,
                    vault(),
                    &sw(),
                    "marketplaces/house/plugins/tools/skills/review.md",
                    EntityKind::Command,
                    &[format!(" {key} ")],
                )
                .unwrap_err(),
                format!("` {key} ` is carried by every kind and is not dropped by a conversion")
            );
        }
    }

    #[test]
    fn a_convert_drops_the_keys_it_is_given_once_each() {
        let vfs = one_plugin();
        let AuthoringOp::ConvertKind { frontmatter, .. } = plan_convert_kind(
            &vfs,
            vault(),
            &sw(),
            "marketplaces/house/plugins/tools/skills/review.md",
            EntityKind::Command,
            &[
                "allowed-tools".to_owned(),
                " allowed-tools ".to_owned(),
                "sw-kind".to_owned(),
                String::new(),
            ],
        )
        .unwrap() else {
            panic!("expected a conversion");
        };
        assert_eq!(
            frontmatter,
            vec![
                FieldEdit::set("sw-kind", Value::Str("command".to_owned())),
                FieldEdit::remove("allowed-tools"),
            ]
        );
    }

    #[test]
    fn a_convert_to_the_kind_it_already_is_is_refused() {
        let vfs = one_plugin();
        assert_eq!(
            plan_convert_kind(
                &vfs,
                vault(),
                &sw(),
                "marketplaces/house/plugins/tools/skills/review.md",
                EntityKind::Skill,
                &[],
            )
            .unwrap_err(),
            "`marketplaces/house/plugins/tools/skills/review.md` is already a skill"
        );
    }

    // ── Composition ─────────────────────────────────────────────────────────

    #[test]
    fn composing_a_new_note_seeds_a_frontmatter_block() {
        let out = compose_note(None, &fields("review"), "\n# Body\n").unwrap();
        assert_eq!(
            out,
            "---\nname: review\ndescription: Use this skill to test review.\n---\n\n# Body\n"
        );
    }

    #[test]
    fn applying_edits_keeps_the_body_and_the_unnamed_keys() {
        let source = "---\nname: review\ndescription: d\nsw-plugin: tools\n---\n\n# Body\n";
        let out = apply_field_edits(
            source,
            &[
                FieldEdit::remove("sw-plugin"),
                FieldEdit::set("name", Value::Str("audit".to_owned())),
            ],
        )
        .unwrap();
        // `sw-plugin` was the last key: removing it takes its whole line, so
        // no blank line is left before the closing fence.
        assert_eq!(out, "---\nname: audit\ndescription: d\n---\n\n# Body\n");
    }

    #[test]
    fn removing_a_key_that_is_not_there_is_a_no_op() {
        let source = "---\nname: review\n---\n\n# Body\n";
        assert_eq!(
            apply_field_edits(source, &[FieldEdit::remove("sw-plugin")]).unwrap(),
            source
        );
    }
}

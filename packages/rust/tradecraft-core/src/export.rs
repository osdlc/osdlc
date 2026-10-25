//! The marketplace renderer — every publishable note built into one
//! marketplace directory serving every harness, and the drift check over it.
//!
//! The engine behind the `build` and `check` verbs.
//! Skills group by `ap-plugin`, each group
//! becomes a pack directory with a manifest, and the groups assemble into a
//! marketplace. This is the standalone rendering; a per-destination plugin
//! publish is [`crate::publish::publish_skill`]'s `EntityKind::Plugin` arm,
//! which writes the pack manifest at the destination.
//!
//! # One directory, one tree per harness
//!
//! `build` writes into one marketplace directory ([`ExportRequest::out_root`])
//! and gives each harness its own top-level tree inside it
//! (`RootSpec::tree`) — `.claude-plugin/`, `.agents/`, `.cursor-plugin/` and
//! `.pi/` today. Each tree carries that harness's marketplace manifest, at the
//! fixed path that harness reads (Pi has none: its packs install by path),
//! its pack manifests in its own dialect, and only the skills
//! whose `ap-targets` admit it, at `<packs>/<plugin>/skills/<name>/`
//! (the marketplace layout spec). A skill narrowed away from a harness is absent
//! from its tree entirely, not merely unlisted.
//!
//! The trees are disjoint by construction, and they have to be: the harnesses
//! translate a skill's tool names differently and spell its frontmatter
//! differently, so the same skill is genuinely one file per harness. A tree per harness is what lets one directory serve
//! all of them — including a directory that is a repository's own root, which
//! is how a repository becomes a marketplace installable from its bare URL.
//!
//! **A build owns its trees and nothing else.** Nothing at `out_root` outside
//! them is read, compared or replaced, because the render produces no path
//! beginning with anything else. That is a structural guarantee rather than a
//! denylist, and it is what makes `out_root` safe to point at a directory
//! holding a `.git`, a vault and a project file.
//!
//! A plugin's commands render alongside its skills, at
//! `<packs>/<plugin>/commands/<name>.<ext>`, on the one harness whose plugin
//! format has a place for one — see
//! [`crate::publish::plugin_format_carries_commands`] for which. A command
//! narrowed out this way has no file and no manifest mention there, and the
//! report names it as [`ExportUnit::NotCarried`] for that root. One narrowed
//! out by `ap-targets` is absent with no report line: the author asked.
//!
//! Which harnesses a build renders is [`ExportRequest::harnesses`]; empty
//! means all of them. A name no harness answers to is refused rather than
//! ignored — publishing less than was asked for, quietly, is the failure this
//! crate is built around.
//!
//! Each tree's skills render through [`crate::projection::project_skill`],
//! and its commands (where carried) through
//! [`crate::projection::project_command`], both for that harness's runtime —
//! the same renderers, dialect for dialect, that `publish` writes into a
//! harness directory.
//!
//! # One render, two `Vfs`s
//!
//! `check` is not a second reading of `build`'s rules. Both modes render the
//! whole marketplace once, into a [`crate::vfs::PreviewVfs`] over the caller's
//! filesystem — the same overlay [`crate::publish::PublishMode::DryRun`]
//! classifies a publish through — and diff the captured bytes against the
//! destination. `check` returns that diff, having written nothing under any
//! outcome. `build` acts on it: an up-to-date destination is reported
//! unchanged and nothing is written or renamed; a drifted root is staged from
//! the very bytes the diff compared and swapped in. The two verdicts cannot
//! disagree, because there is only one render and one comparison.
//!
//! # The commit is stage-then-swap, one tree at a time, with backup
//!
//! A changed tree is written under `<out>/.agent-pants-stage/new/`, the live
//! tree is renamed aside to `…/backup/<tree>`, and the staged tree is renamed
//! into place — the temp-and-rename [`crate::vfs::Vfs::rename`] and
//! [`crate::vfs::Vfs::remove`] exist for. The stage lives under `out_root`
//! itself, because a rename is only atomic within one filesystem and the one
//! directory guaranteed to share a filesystem with the thing being replaced
//! is its own parent. A failure mid-swap rolls back every tree already
//! swapped, restores the failing tree's own backup, and surfaces as
//! [`CoreError::SwapFailed`] saying so.
//!
//! The swap unit is the harness tree. Anything inside one that the render did
//! not produce — a stale pack, a stray file, an empty directory — goes with
//! the swap, and `check` reports exactly that set as stale, which is what
//! keeps its verdict honest about what `build` would change. Anything outside
//! the trees is never looked at.
//!
//! # Manifests are byte-deterministic
//!
//! Stable key order (serde struct order), plugins and skills sorted by name,
//! two-space indentation, one trailing newline — so `check` can compare
//! bytes, and two builds of one vault are identical. Configuration enters
//! through [`MarketplaceConfig`] on the request, typed and serializable,
//! because everything here crosses the wasm boundary and an
//! ambient config file is a thing a wasm host does not have.
//!
//! # The rail holds here too
//!
//! On a host whose [`crate::vfs::Vfs::sees_links`] is `true`,
//! [`crate::guard::assert_destination_allowed_for_vault`] runs before anything
//! is staged: a destination that is the vault or sits inside it is refused,
//! and so is an ancestor of the vault when a tree this build replaces would
//! land inside the vault. On any other host, such as the wasm bridge over a host object without
//! link methods, [`crate::guard::assert_destination_allowed`] also refuses every ancestor of
//! the vault, because a link the host cannot see is what the narrowed check
//! would miss. `publish` takes the same two rails on the same condition.

use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use agent_adapt::RuntimeId;
use serde::{Deserialize, Serialize};

use crate::compile::{
    CallContext, CompileSource, EXCLUDED_BUNDLE_DIRECTORIES, IndexedSkill, SkillIndex, SkillSource,
    compile_projection, walk_files,
};
use crate::discover::{
    DiscoveredComponent, DiscoveryWarning, MISSING_DESCRIPTION_REASON, discover_components,
    name_refusal,
};
use crate::error::CoreError;
use crate::frontmatter::EntityKind;
use crate::guard::{assert_destination_allowed, assert_destination_allowed_for_vault};
use crate::hooks_file::PluginRootVar;
use crate::namespace::Namespace;
use crate::projection::{
    parse_runtime_target, project_command, project_plugin_hooks, project_skill, to_adapt_hook,
};
use crate::skill::forward_slashed;
use crate::status::{VersionBumpSuggestion, version_bump_if_unmoved};
use crate::vault::read_vault_skill;
use crate::vfs::{PreviewVfs, PreviewWrite, Vfs, normalize};

/// The day the plugin-root hook variables in `ROOTS` were last checked
/// against each harness's docs.
const HOOKS_OBSERVED: &str = "2026-10-05";

/// One marketplace export: this vault, onto this output root, in this mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRequest {
    /// Absolute path to the vault. Discovery, compilation, and the provenance
    /// markers all resolve against it.
    pub vault_root: PathBuf,
    /// The content root to scan; `None` means the vault root, exactly as
    /// [`discover_components`] reads it.
    #[serde(default)]
    pub skills_root: Option<PathBuf>,
    /// Which marketplace this build renders. `None` names the vault's only
    /// one; a vault holding more than one is refused rather than flattened,
    /// because one `out_root` holds one marketplace.
    #[serde(default)]
    pub marketplace: Option<String>,
    /// The marketplace directory: one directory holding one marketplace,
    /// which every harness this build renders reads from.
    ///
    /// Each harness owns exactly one top-level entry under it — its own tree
    /// (`RootSpec::tree`) — and nothing else here is read, compared or
    /// replaced. So this may be a directory holding other things, including
    /// a repository's own root, which is what lets a repository be its own
    /// marketplace.
    pub out_root: PathBuf,
    /// Which harnesses to render, by name. Empty means every harness this
    /// build supports.
    ///
    /// A name no harness answers to is refused rather than ignored: it is a
    /// typo or a harness this build cannot produce, and silently publishing
    /// less than was asked for is the failure this crate is built around.
    #[serde(default)]
    pub harnesses: BTreeSet<String>,
    /// Build, or check. Absent on the wire means [`ExportMode::Build`] — the
    /// same default-to-the-write choice [`crate::publish::PublishMode`] makes,
    /// for the same reason.
    #[serde(default)]
    pub mode: ExportMode,
    /// The marketplace's own identity and per-plugin overrides.
    pub config: MarketplaceConfig,
    /// Files copied verbatim into a built plugin's own root — a CLI, a wasm
    /// artifact, a launcher: authored on disk, never as a vault note.
    ///
    /// Paths are absolute, resolved by the caller: this core never reads an
    /// ambient project file, so it has nothing to resolve a relative asset
    /// path against (see the crate doc's wasm-boundary note on
    /// [`MarketplaceConfig`]). The CLI resolves `assets:` entries against the
    /// project file's own directory before building this request.
    #[serde(default)]
    pub assets: Vec<AssetSpec>,
    /// Canonical hooks files; see [`HookFileSpec`].
    #[serde(default)]
    pub hooks: Vec<HookFileSpec>,
}

/// One canonical hooks file a build renders into a plugin's packs. At most
/// one per plugin; its gap report goes in every pack. See
/// [`crate::hooks_file`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HookFileSpec {
    /// Absolute host path to the file, resolved by the caller the way an
    /// [`AssetSpec::source`] is.
    pub source: PathBuf,
    /// The path relative to the project file, after token expansion.
    /// Refusals and the gap report's `source` name the file by this, so the
    /// report holds no host path.
    pub from: String,
    /// Which plugin's packs carry it. `None` means
    /// [`MarketplaceConfig::default_plugin`].
    #[serde(default)]
    pub plugin: Option<String>,
}

/// One file, or one directory tree, an export copies verbatim into a built
/// plugin's own root, rather than rendering it from a vault note.
///
/// Bundle resources ([`crate::compile::CompileSource::bundle_root`]) already
/// cover a skill's own peers; this is for what a *plugin* carries once, no
/// matter which skill happens to shell out to it. A `cli/sdlc` launcher is the
/// motivating file case, and shared reference docs the skills read
/// (`conventions/`) the motivating directory case.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetSpec {
    /// Absolute host path to the source file or directory. A directory
    /// lands as its whole tree, under the same fixed `tests`/`fixtures`
    /// exclude a skill's bundle sweep applies, and minus `*.test.*` files.
    pub source: PathBuf,
    /// Destination, relative to the built plugin's own root
    /// (`<packs>/<plugin>/`), forward-slashed. For a directory source, the
    /// directory its tree lands under.
    pub dest: String,
    /// Which plugin's root this asset lands in. `None` means
    /// [`MarketplaceConfig::default_plugin`].
    #[serde(default)]
    pub plugin: Option<String>,
}

/// Whether an export writes the marketplace, or only reports its drift.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExportMode {
    /// Render, and swap any drifted root into place.
    #[default]
    Build,
    /// Render into the overlay, compare, write nothing — under any outcome.
    Check,
}

/// What the *build* says about the marketplace and its plugins — the fallback
/// under what the vault's own container notes say.
///
/// `resolve_config` folds the two, note over request, field by field: a
/// marketplace note is the marketplace, and a build flag is one invocation of
/// it.
///
/// `name` and `default_plugin` stay required, because a vault holding no
/// marketplace directory at all is legal and has no note to read.
/// `default_plugin` is never in a note at all: what to do with a skill that
/// names no plugin is a property of the build.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceConfig {
    /// The name both manifests publish under, **when the vault does not supply
    /// one**. A marketplace note names itself, and that name wins.
    ///
    /// A fallback, not an assertion. Which marketplace to build has its own
    /// field ([`ExportRequest::marketplace`]), validated against what the vault
    /// actually holds; one selector is enough.
    ///
    /// `None` with no marketplace note is the one case with no answer, and it
    /// is refused rather than defaulted: a distribution nobody named is a
    /// configuration fault, not a marketplace called `default`.
    #[serde(default)]
    pub name: Option<String>,
    /// Codex's `interface.displayName`; the name when absent.
    #[serde(default)]
    pub display_name: Option<String>,
    /// The marketplace `owner`. JSON rather than a string because an author
    /// may spell it `{name, email, url}`, but a bare name is **not** a shape
    /// any dialect accepts: Claude and Cursor both mark `owner` required and
    /// both require an object. A string here is normalised to `{name: …}` on
    /// the way into a manifest rather than refused, because the note's
    /// spelling is a convenience and the manifest's shape is the dialect's.
    #[serde(default)]
    pub owner: Option<serde_json::Value>,
    /// The marketplace's own one-line description, from its note. Optional in
    /// every dialect, and placed differently by each — see
    /// `claude_marketplace_manifest` and `cursor_marketplace_manifest`.
    #[serde(default)]
    pub description: Option<String>,
    /// Default plugin author; falls back to `owner` when absent.
    #[serde(default)]
    pub author: Option<serde_json::Value>,
    /// Default plugin license, as an SPDX identifier. A distribution is
    /// licensed as a whole, so the marketplace note states it once and every
    /// plugin under it inherits; a plugin licensed differently says so on its
    /// own note.
    #[serde(default)]
    pub license: Option<String>,
    /// The plugin a note with no `ap-plugin` belongs to.
    pub default_plugin: String,
    /// Per-plugin manifest overrides, keyed by plugin name.
    #[serde(default)]
    pub plugins: BTreeMap<String, PluginOverrides>,
    /// Refuse the build when a note has a `name` and no `description`,
    /// instead of publishing [`crate::discover::MISSING_DESCRIPTION`] and
    /// reporting it in [`ExportReport::warnings`].
    #[serde(default)]
    pub require_descriptions: bool,
    /// Where the per-skill `scripts/sdlc` shim looks for this plugin's own
    /// launcher asset, relative to the plugin's root — and the `dest` an
    /// asset must carry for `render_root` to emit that shim at all (see
    /// `sdlc_shim_script`'s parent-walk). Project-file authors declare it
    /// as `marketplace.shim_target`; [`crate::settings::MarketplaceSettings::to_config`]
    /// defaults it to [`DEFAULT_SHIM_TARGET`] when the project file is
    /// silent, so a project that never mentions it keeps resolving
    /// `cli/sdlc`.
    #[serde(default = "default_shim_target")]
    pub shim_target: String,
}

/// [`MarketplaceConfig::shim_target`]'s value when a project file declares
/// none — the launcher path every plugin used before the field existed.
pub const DEFAULT_SHIM_TARGET: &str = "cli/sdlc";

fn default_shim_target() -> String {
    DEFAULT_SHIM_TARGET.to_owned()
}

/// Manifest fields one plugin overrides. Every absence has a documented
/// default, so an empty override block means the defaults wholesale.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PluginOverrides {
    /// Default `0.1.0`.
    pub version: Option<String>,
    /// Default `Skills: <names>.` over the root's own member list.
    pub description: Option<String>,
    /// Default the marketplace `author`, then `owner`.
    pub author: Option<serde_json::Value>,
    /// Default the marketplace `license`, then `UNLICENSED`.
    pub license: Option<String>,
    /// Default empty.
    pub keywords: Option<Vec<String>>,
    /// Codex only. Default `Productivity`.
    pub category: Option<String>,
    /// Codex only. Default the plugin's name.
    pub display_name: Option<String>,
}

/// What one export did, or would do — per plugin, per root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExportReport {
    /// The mode the report describes, so `ok`/`drift` and
    /// `written`/`unchanged` read against the right verb.
    pub mode: ExportMode,
    /// How many publishable skills discovery found.
    pub checked: usize,
    /// Check: anything drifted or stale. Build: anything was swapped.
    pub changed: bool,
    /// One unit per plugin per root, one per marketplace manifest, plus whatever the
    /// destination holds that the vault no longer produces, plus the members a
    /// layout cannot carry. Ordered: the members no root carries first; then roots in
    /// `claude`, `codex`, `cursor`, `pi` order; within a root, plugins by name, then the
    /// manifest, then stale paths, then the members that root cannot carry.
    pub units: Vec<ExportUnit>,
    /// Notes the scan admitted with something filled in, in path order.
    #[serde(default)]
    pub warnings: Vec<DiscoveryWarning>,
}

/// One comparable unit of the marketplace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "unit", rename_all = "kebab-case")]
pub enum ExportUnit {
    /// One plugin directory in one root — its manifest and its skills.
    Plugin {
        /// The harness root the plugin sits in.
        root: String,
        /// The plugin's name.
        name: String,
        /// Member skills admitted to this root.
        skills: usize,
        /// Whether the plugin matches what is installed.
        status: UnitStatus,
        /// This plugin's members drifted from what is installed here, with
        /// its own `ap-version` unmoved since — the one-click bump a build
        /// report can offer alongside `drift`/`written`. `None` for a plugin
        /// that does not meet the rule, or that carries no `ap-version` to
        /// compare. See [`VersionBumpSuggestion`].
        version_bump_suggestion: Option<VersionBumpSuggestion>,
    },
    /// One root's marketplace manifest.
    Manifest {
        /// The harness root the manifest sits in.
        root: String,
        /// Whether the manifest matches what is installed.
        status: UnitStatus,
    },
    /// Present at the destination, absent from the render. `check` reports
    /// it as drift; `build`'s swap removes it.
    ///
    /// `kind` is the difference between losing a whole pack and losing a
    /// leftover file, which is not a difference a reader should have to
    /// infer from the path.
    Stale {
        /// The harness root the path sits in.
        root: String,
        /// The stale path, relative to the destination.
        path: String,
        /// What the stale path is.
        kind: StaleKind,
    },
    /// A component the marketplace layout has no place for, named rather than
    /// dropped.
    ///
    /// A pack has a place for skills, for commands on a root whose
    /// [`crate::publish::plugin_format_carries_commands`] is `true`, and for
    /// hooks on a root whose [`crate::publish::plugin_format_carries_hooks`]
    /// is. Everything else is named here rather than dropped; what a build
    /// must not do is leave silently. This is the same fact
    /// [`crate::publish::PublishReport::not_carried`] reports on the other
    /// path, in this report's own vocabulary.
    ///
    /// `root` is the root that cannot carry it — a command on Codex, say.
    /// `None` when no root can, as for an agent: the reason is the layout's,
    /// so it is listed once. A member `ap-targets` narrowed away from a root
    /// is not named there; the author asked for that.
    NotCarried {
        /// The root that cannot carry the component, or `None` when no root can.
        root: Option<String>,
        /// The component's path in the vault.
        path: String,
        /// The component's kind.
        kind: String,
    },
}

/// What a stale path is, which decides how much a reader should care.
///
/// The swap removes all three the same way. They are not the same news: a
/// plugin is a whole pack the marketplace stops carrying, a file is one
/// leftover, and a directory is a shape the destination kept after its
/// contents went. Reported separately rather than left to be read off the
/// path, which only says `plugins/<name>` for the first of them by
/// coincidence of layout.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StaleKind {
    /// A plugin directory this root no longer carries — one unit for the
    /// whole tree, never a unit per file inside it.
    Plugin,
    /// A file the render does not produce.
    File,
    /// A directory holding nothing, invisible to a file comparison.
    EmptyDir,
}

/// One unit's outcome. `check` speaks `ok`/`drift`; `build` speaks
/// `written`/`unchanged` — the same comparison, two verbs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UnitStatus {
    /// The unit matches what is installed (`check`).
    Ok,
    /// The unit differs from what is installed (`check`).
    Drift,
    /// The unit was written (`build`).
    Written,
    /// The unit was already up to date (`build`).
    Unchanged,
}

/// The supported harnesses, in report order. Everything harness-specific —
/// which runtime renders the skills, where the projection puts them, which
/// manifest dialect the plugin carries, where the marketplace manifest lives,
/// where the packs land, how a rendered skill's body invokes the plugin's own
/// CLI, how a published skill is named — hangs off this table, so adding a
/// harness is adding a row.
struct RootSpec {
    /// The harness's name, and the target the skills narrow against.
    name: &'static str,
    /// The runtime [`project_skill`] (and [`project_command`], where
    /// [`crate::publish::plugin_format_carries_commands`] is `true`) renders
    /// through for this root.
    runtime: &'static str,
    /// The prefix that runtime's projection puts on a skill's files, stripped
    /// on the way into `plugins/<plugin>/skills/<name>/`.
    projection_prefix: &'static str,
    /// The pack manifest, relative to a pack's own directory, in this root's
    /// dialect.
    plugin_manifest: &'static str,
    /// The marketplace manifest, relative to the marketplace directory. Its
    /// path is the harness's, fixed: it is where that harness looks, and the
    /// reason every root can share one directory without colliding. `None`
    /// for a harness with no marketplace (Pi), whose packs install by path.
    marketplace_manifest: Option<&'static str>,
    /// Where this harness's packs land, relative to the marketplace
    /// directory. Inside the harness's own tree, so two harnesses publishing
    /// the same pack never render to one path — which they could not share
    /// anyway, since each translates a skill's tool names its own way.
    ///
    /// Must begin with the same component as `marketplace_manifest`, where
    /// there is one: that component is the whole of what this root owns on
    /// disk ([`RootSpec::tree`]).
    packs: &'static str,
    /// Which shape this root's manifests take. A field rather than a match
    /// on [`RootSpec::name`], so the claim above — that adding a root is
    /// adding a row — stays true of the manifests too.
    dialect: PluginDialect,
    /// How a rendered skill's body should refer to the plugin's own CLI. See
    /// [`CliInvocation`].
    cli_invocation: CliInvocation,
    /// The variable this root's hook commands name the plugin root by; see
    /// [`PluginRootVar`]. `None` when its pack carries no hooks file (Pi).
    plugin_root_var: Option<PluginRootVar>,
    /// How a published skill is named, and so how a call to it is spelled.
    naming: SkillNaming,
    /// The pack manifest's `hooks` value naming the hooks file, for a harness
    /// that reads hooks only from there; see
    /// [`crate::publish::plugin_format_carries_hooks`].
    hooks_manifest_entry: Option<&'static str>,
}

/// How an export root names a published skill.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkillNaming {
    /// `<skill>`; the harness puts the plugin in front (`/plugin:skill`).
    HostNamespaced,
    /// `<skill>`, with no plugin anywhere.
    Bare,
    /// `<plugin>-<skill>`, for a harness with no plugin namespace that would
    /// otherwise collide across plugins.
    PluginPrefixed,
}

/// The name a skill publishes under: its directory, its frontmatter `name`,
/// and the name a call to it renders. One function, so the three agree.
///
/// # Errors
///
/// `refused: published-name-invalid` — a prefixed name the Agent Skills spec does
/// not admit. Never truncated: a shortened name would not match its calls.
pub fn published_skill_name(
    naming: SkillNaming,
    plugin: &str,
    skill: &str,
) -> Result<String, CoreError> {
    match naming {
        SkillNaming::HostNamespaced | SkillNaming::Bare => Ok(skill.to_owned()),
        SkillNaming::PluginPrefixed => {
            let name = format!("{plugin}-{skill}");
            match name_refusal(&name, "published skill name") {
                None => Ok(name),
                Some(why) => Err(CoreError::refused(
                    "published-name-invalid",
                    format!("skill `{skill}` of plugin `{plugin}` cannot publish as {why}"),
                )),
            }
        }
    }
}

/// The call one runtime writes for skill `skill` of plugin `plugin`.
pub fn rendered_skill_call(
    runtime: RuntimeId,
    naming: SkillNaming,
    plugin: &str,
    skill: &str,
) -> Result<String, CoreError> {
    let name = published_skill_name(naming, plugin, skill)?;
    match naming {
        SkillNaming::HostNamespaced => checked_skill_call(runtime, Some(plugin), &name),
        SkillNaming::Bare | SkillNaming::PluginPrefixed => checked_skill_call(runtime, None, &name),
    }
}

/// `RuntimeId::skill_call`, with its error as a `skill-call-invalid` refusal.
pub(crate) fn checked_skill_call(
    runtime: RuntimeId,
    namespace: Option<&str>,
    name: &str,
) -> Result<String, CoreError> {
    runtime
        .skill_call(namespace, name)
        .map_err(|err| CoreError::refused("skill-call-invalid", err.to_string()))
}

/// How a rendered skill body refers to the plugin's own CLI — a field on
/// [`RootSpec`] rather than a match on [`RootSpec::name`], for the same
/// reason every other harness-specific behavior here is a field: adding a
/// harness is adding a row, not a new arm.
///
/// Every skill in the vault writes the call site the same way, as
/// `${CLAUDE_PLUGIN_ROOT}/<shim_target>` — the vault's own text is written
/// for Claude, since that is the harness every skill author develops against.
/// This decides what each *other* root does with that same text at render
/// time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CliInvocation {
    /// Leave the vault's `${CLAUDE_PLUGIN_ROOT}/<shim_target>` text exactly
    /// as written. Claude Code substitutes the token itself, inline, when it
    /// loads skill markdown — see the plugin manifest reference's
    /// "Environment variables" section
    /// (<https://code.claude.com/docs/en/plugins-reference>, retrieved
    /// 2026-09-26): `${CLAUDE_PLUGIN_ROOT}` resolves in "Skill, command, and
    /// agent content" bodies specifically, a Claude Code plugin mechanism
    /// with no counterpart in another harness.
    PluginRootToken,
    /// Rewrite every `${CLAUDE_PLUGIN_ROOT}/<shim_target>` call site in a
    /// skill's rendered body to [`SHIM_RELATIVE_PATH`], the skill-relative
    /// `scripts/sdlc` shim this same render conditionally emits (see
    /// [`render_skill`]). Neither Codex CLI nor Cursor substitutes
    /// `${CLAUDE_PLUGIN_ROOT}` — Codex's own skills documentation
    /// (<https://developers.openai.com/codex/skills>) never mentions the
    /// token, and Cursor's skills documentation
    /// (<https://cursor.com/docs/skills>, retrieved 2026-09-26) instructs
    /// authors to "reference scripts in your SKILL.md using relative paths
    /// from the skill root" instead — so a literal, un-rewritten
    /// `${CLAUDE_PLUGIN_ROOT}/...` call site is dead text for either
    /// harness, expanding to `/<shim_target>` with an empty prefix.
    SkillRelativeShim,
}

const ROOTS: [RootSpec; 4] = [
    RootSpec {
        name: "claude",
        runtime: "claude-code",
        projection_prefix: ".claude/skills",
        plugin_manifest: ".claude-plugin/plugin.json",
        marketplace_manifest: Some(".claude-plugin/marketplace.json"),
        packs: ".claude-plugin/packs",
        dialect: PluginDialect::Claude,
        cli_invocation: CliInvocation::PluginRootToken,
        plugin_root_var: Some(PluginRootVar {
            name: "CLAUDE_PLUGIN_ROOT",
            url: "https://code.claude.com/docs/en/plugins-reference",
            observed_on: "2026-09-26",
            note: None,
        }),
        naming: SkillNaming::HostNamespaced,
        hooks_manifest_entry: None,
    },
    RootSpec {
        name: "codex",
        runtime: "codex-cli",
        projection_prefix: ".agents/skills",
        plugin_manifest: ".codex-plugin/plugin.json",
        marketplace_manifest: Some(".agents/plugins/marketplace.json"),
        packs: ".agents/packs",
        dialect: PluginDialect::Codex,
        cli_invocation: CliInvocation::SkillRelativeShim,
        plugin_root_var: Some(PluginRootVar {
            name: "PLUGIN_ROOT",
            url: "https://learn.chatgpt.com/docs/hooks",
            observed_on: HOOKS_OBSERVED,
            note: Some(
                "a plugin hook also gets `CLAUDE_PLUGIN_ROOT` for compatibility, and runs in the \
                 session's working directory",
            ),
        }),
        naming: SkillNaming::HostNamespaced,
        hooks_manifest_entry: None,
    },
    RootSpec {
        name: "cursor",
        runtime: "cursor",
        projection_prefix: ".cursor/skills",
        plugin_manifest: ".cursor-plugin/plugin.json",
        marketplace_manifest: Some(".cursor-plugin/marketplace.json"),
        packs: ".cursor-plugin/packs",
        dialect: PluginDialect::Cursor,
        cli_invocation: CliInvocation::SkillRelativeShim,
        plugin_root_var: Some(PluginRootVar {
            name: "CURSOR_PLUGIN_ROOT",
            url: "https://cursor.com/docs/reference/plugins",
            observed_on: HOOKS_OBSERVED,
            note: Some(
                "documented as expanded, beside `CLAUDE_PLUGIN_ROOT`, in a plugin's MCP server \
                 fields; not documented for hook commands",
            ),
        }),
        naming: SkillNaming::Bare,
        hooks_manifest_entry: Some("./hooks/hooks.json"),
    },
    RootSpec {
        name: "pi",
        runtime: "pi",
        projection_prefix: ".pi/skills",
        plugin_manifest: "package.json",
        marketplace_manifest: None,
        packs: ".pi/packs",
        dialect: PluginDialect::Pi,
        cli_invocation: CliInvocation::SkillRelativeShim,
        plugin_root_var: None,
        naming: SkillNaming::PluginPrefixed,
        hooks_manifest_entry: None,
    },
];

impl RootSpec {
    /// The one top-level entry this root owns in the marketplace directory.
    ///
    /// Everything it renders — its marketplace manifest, its packs — lives
    /// under this single name, and nothing else in the directory is read,
    /// compared or replaced. That is what lets every harness share one
    /// directory, and what lets that directory be a repository root.
    fn tree(&self) -> &'static str {
        first_component(self.marketplace_manifest.unwrap_or(self.packs))
    }

    /// `plugins/<name>/<tail>` for this root's pack directory: the plugin and
    /// the rest, `tail` empty for the pack's own directory, `None` for a path
    /// naming no pack of this root's.
    fn split_pack<'p>(&self, relative: &'p str) -> Option<(&'p str, &'p str)> {
        let rest = relative
            .strip_prefix(self.packs)?
            .strip_prefix('/')
            .unwrap_or("");
        if rest.is_empty() {
            return None;
        }
        Some(match rest.split_once('/') {
            Some((name, tail)) => (name, tail),
            None => (rest, ""),
        })
    }
}

/// The first path component of a relative path, or the whole of it.
fn first_component(relative: &str) -> &str {
    relative.split('/').next().unwrap_or(relative)
}

/// Where a build stages and backs up, under the root's own base — created
/// only when a swap is actually needed, removed when the build ends.
///
/// Under the base rather than beside it, because a swap is a rename and a
/// rename is only atomic within one filesystem. A root can be told to land
/// anywhere, so the one directory guaranteed to share a filesystem with the
/// thing being replaced is the thing's own parent. It stays invisible to the
/// diff because [`scan_destination`] reads only the entries a root owns, and
/// this is never one of them.
const STAGE_DIR: &str = ".agent-pants-stage";

/// The provenance marker every emitted `SKILL.md` opens its body with.
const GENERATED_MARKER: &str = "<!-- Generated by agent-pants from ";

/// Where the per-skill `scripts/sdlc` shim lands, relative to a skill's own
/// built directory — and, for a root whose [`CliInvocation`] is
/// [`CliInvocation::SkillRelativeShim`], the text
/// [`rewrite_cli_invocation`] rewrites a `${CLAUDE_PLUGIN_ROOT}/<shim_target>`
/// call site to. One constant for both, so the file this render writes and
/// the path a rewritten skill body names can never drift apart.
const SHIM_RELATIVE_PATH: &str = "scripts/sdlc";

/// Renders the vault into every selected marketplace root and, per
/// [`ExportRequest::mode`], either swaps the drifted roots into place or
/// reports the drift and writes nothing.
///
/// `ns` is the vault's frontmatter namespace, handed to every read and every
/// emit below — the single-namespace rule [`crate::publish::publish_skill`] states.
///
/// # Errors
///
/// * [`CoreError::Refused`] — the rail: an output root that is, contains, or
///   sits inside the vault, before anything is staged. Also everything
///   discovery and compilation refuse, unchanged.
/// * `refused: empty-marketplace` — the marketplace built holds nothing
///   publishable. A marketplace of nothing is a configuration fault, not an
///   empty success.
/// * `refused: ambiguous-marketplace` — the vault holds more than one and
///   [`ExportRequest::marketplace`] named none of them.
/// * `refused: unknown-marketplace` — it named one the vault does not hold.
/// * `refused: path-collision` — a promoted skill and a marketplace's own
///   skill of that name meeting in one plugin directory.
/// * [`CoreError::SwapFailed`] — the commit failed part-way; the message says
///   what was rolled back.
fn selected_roots(request: &ExportRequest) -> Result<Vec<&'static RootSpec>, CoreError> {
    if request.harnesses.is_empty() {
        return Ok(ROOTS.iter().collect());
    }
    let unknown: Vec<&str> = request
        .harnesses
        .iter()
        .map(String::as_str)
        .filter(|name| !ROOTS.iter().any(|spec| spec.name == *name))
        .collect();
    if !unknown.is_empty() {
        return Err(CoreError::refused(
            "unknown-harness",
            format!(
                "no harness named {} — this build renders {}. Nothing was written",
                unknown.join(", "),
                ROOTS
                    .iter()
                    .map(|spec| spec.name)
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        ));
    }
    Ok(ROOTS
        .iter()
        .filter(|spec| request.harnesses.contains(spec.name))
        .collect())
}

/// Which harnesses this request renders, and the one top-level entry each
/// one owns in the marketplace directory.
///
/// So a caller can say what a build is about to replace without owning a
/// second copy of the roots table or of the harness selection.
pub fn root_trees(request: &ExportRequest) -> Result<Vec<(&'static str, &'static str)>, CoreError> {
    Ok(selected_roots(request)?
        .into_iter()
        .map(|spec| (spec.name, spec.tree()))
        .collect())
}

/// Where `root`'s `marketplace.json` sits under a built marketplace, read
/// from `ROOTS`. `None` for an unknown root or one that writes no manifest.
pub fn marketplace_manifest_path(root: &str) -> Option<&'static str> {
    ROOTS
        .iter()
        .find(|spec| spec.name == root)
        .and_then(|spec| spec.marketplace_manifest)
}

/// `root`'s plugin manifest path, relative to a pack's directory. `None` for
/// an unknown root.
pub fn plugin_manifest_path(root: &str) -> Option<&'static str> {
    ROOTS
        .iter()
        .find(|spec| spec.name == root)
        .map(|spec| spec.plugin_manifest)
}

/// Renders the vault into one marketplace directory, or checks it against what is already there.
pub fn export_skills(
    vfs: &dyn Vfs,
    request: &ExportRequest,
    ns: &Namespace,
) -> Result<ExportReport, CoreError> {
    let vault_root = normalize(&request.vault_root);
    let out_root = normalize(&request.out_root);

    // Which harnesses this build renders, before anything reads or writes.
    let roots = selected_roots(request)?;
    let trees: Vec<&'static str> = roots.iter().map(|spec| spec.tree()).collect();

    // The rail, before discovery reads a byte: both sides resolved as far as
    // the filesystem goes, so a symlinked spelling of the vault cannot slip a
    // destination inside it.
    //
    // The question is narrow, and it has to be. The case this exists for is a
    // repository root, which legitimately contains its own vault, so an
    // ancestor rule would refuse exactly what the feature is for. What
    // matters is what the swap touches — would any tree this build replaces
    // be, or sit inside, the vault? Same refusal token, same symlink
    // resolution, and it is the rail `publish` already runs against a
    // destination's own relative paths.
    //
    // Narrowed only where the host can see links, as `publish` does. Anywhere
    // else an ancestor of the vault stays refused, because a link under it
    // into the vault is exactly what the narrowed check cannot see.
    if vfs.sees_links() {
        assert_destination_allowed_for_vault(vfs, &out_root, &vault_root, trees.iter().copied())?;
    } else {
        assert_destination_allowed(vfs, &out_root, std::slice::from_ref(&vault_root))?;
    }

    // Skills and commands render; the scan returns every kind so a
    // workbench can list them, and a marketplace's pack layout has no place
    // for the rest — see `NotCarried` below, which names them.
    let scan = discover_components(vfs, &vault_root, request.skills_root.as_deref(), ns)?;
    // A build swaps whole roots and sweeps whatever the vault no longer
    // produces, so a note the scan could not read would be read by the sweep
    // as a note that was deleted — and a published skill would go with it.
    // This is the one caller for which isolating a per-note failure is more
    // dangerous than stopping, so it stops, naming every note it could not
    // read. `check` shares the refusal because it shares the path: its whole
    // claim is that its verdict cannot disagree with `build`'s, and a verdict
    // over a vault it only partly read is not one.
    if !scan.skipped.is_empty() {
        let notes: Vec<String> = scan
            .skipped
            .iter()
            .map(|note| format!("{} ({})", note.path, note.detail))
            .collect();
        return Err(CoreError::refused(
            "unreadable-note",
            format!(
                "the vault holds {} note(s) this scan could not read, and a marketplace built \
                 without them would sweep away what they publish: {}. Nothing was written",
                notes.len(),
                notes.join("; ")
            ),
        ));
    }
    let discovered = scan.components;
    // Which marketplaces the vault holds is read from every kind, not from the
    // skills alone: one holding only commands still exists, and naming it must
    // say it holds nothing publishable rather than that it is not there.
    let market = resolve_marketplace(&discovered, request.marketplace.as_deref())?;
    let belonging: Vec<&DiscoveredComponent> = discovered
        .iter()
        .filter(|component| belongs_to(component, market.as_deref()))
        .collect();
    // Only this marketplace's notes: another marketplace's gap neither
    // refuses this build nor appears in its report. A marketplace note names
    // no marketplace of its own, so `belongs_to` admits every one of them.
    let ours: BTreeSet<&str> = belonging
        .iter()
        .filter(|c| c.kind != EntityKind::Marketplace || market.as_deref() == Some(c.name.as_str()))
        .map(|c| c.vault_relative_path.as_str())
        .collect();
    let mut warnings: Vec<DiscoveryWarning> = scan
        .warnings
        .into_iter()
        .filter(|w| ours.contains(w.path.as_str()))
        .collect();
    let undescribed: Vec<&str> = warnings
        .iter()
        .filter(|w| w.reason == MISSING_DESCRIPTION_REASON)
        .map(|w| w.path.as_str())
        .collect();
    if request.config.require_descriptions && !undescribed.is_empty() {
        let notes = undescribed;
        return Err(CoreError::refused(
            MISSING_DESCRIPTION_REASON,
            format!(
                "`require_descriptions` is set and {} note(s) have a `name` and no \
                 `description`: {}. Nothing was written",
                notes.len(),
                notes.join(", ")
            ),
        ));
    }
    // Named, never dropped: a pack has a place for skills, commands and hooks
    // (the last two on the roots that have one) and for nothing else, and a
    // build that quietly omitted an agent would be the failure this crate is
    // built around. A command or hook one root cannot carry is named per
    // root, in the loop below.
    let not_carried: Vec<ExportUnit> = belonging
        .iter()
        .filter(|c| {
            !matches!(
                c.kind,
                EntityKind::Skill
                    | EntityKind::Command
                    | EntityKind::Hook
                    | EntityKind::Plugin
                    | EntityKind::Marketplace
            )
        })
        .map(|c| ExportUnit::NotCarried {
            root: None,
            path: c.vault_relative_path.clone(),
            kind: c.kind.as_str().to_owned(),
        })
        .collect();
    let members: Vec<&DiscoveredComponent> = belonging
        .iter()
        .copied()
        .filter(|component| component.kind == EntityKind::Skill)
        .collect();
    let commands: Vec<&DiscoveredComponent> = belonging
        .iter()
        .copied()
        .filter(|component| component.kind == EntityKind::Command)
        .collect();
    let hooks: Vec<&DiscoveredComponent> = belonging
        .into_iter()
        .filter(|component| component.kind == EntityKind::Hook)
        .collect();
    if members.is_empty() && commands.is_empty() && hooks.is_empty() {
        return Err(CoreError::refused(
            "empty-marketplace",
            match &market {
                Some(name) => format!(
                    "marketplace `{name}` under {} holds no publishable skills, commands or \
                     hooks: a marketplace of nothing is a configuration fault, not an empty \
                     success. Nothing was written",
                    vault_root.display()
                ),
                None => format!(
                    "no publishable skills, commands or hooks under {}: a marketplace of \
                     nothing is a configuration fault, not an empty success. Nothing was \
                     written",
                    vault_root.display()
                ),
            },
        ));
    }
    let (name, config) = resolve_config(&discovered, market.as_deref(), &request.config)?;
    let groups = group_by_plugin(&members, &commands, &hooks, &config.default_plugin)?;
    warnings.extend(missing_versions(
        &discovered,
        market.as_deref(),
        &groups,
        &config,
    ));

    // Grouped by target plugin, so `render_root` asks one question per
    // plugin instead of scanning the whole list per root. A plugin an asset
    // names but the vault never produces is refused up front, the same way
    // an unknown `--marketplace` is: writing nothing rather than silently
    // dropping bytes an author declared.
    let mut assets_by_plugin: BTreeMap<&str, Vec<&AssetSpec>> = BTreeMap::new();
    for asset in &request.assets {
        if !asset_dest_is_relative(&asset.dest) {
            return Err(CoreError::refused(
                "unsafe-asset-dest",
                format!(
                    "`{}`'s `dest` (`{}`) is not a plain relative path — `AssetSpec::dest` must \
                     stay under the plugin root it is joined onto, so an absolute path or a `..` \
                     component is refused rather than silently writing outside \
                     `<packs>/<plugin>/`. Nothing was written",
                    asset.source.display(),
                    asset.dest,
                ),
            ));
        }
        if let Some(spec) = roots
            .iter()
            .find(|spec| asset_covers(vfs, asset, spec.plugin_manifest))
        {
            return Err(CoreError::refused(
                "asset-over-manifest",
                format!(
                    "`{}` lands at `{}`, the {} root's pack manifest, which the build writes \
                     itself. Move the asset's `dest`. Nothing was written",
                    asset.source.display(),
                    spec.plugin_manifest,
                    spec.name,
                ),
            ));
        }
        let plugin = asset
            .plugin
            .as_deref()
            .unwrap_or(config.default_plugin.as_str());
        if !groups.contains_key(plugin) {
            return Err(CoreError::refused(
                "unknown-asset-plugin",
                format!(
                    "`{}` names plugin `{plugin}`, which this build holds no skill, command or \
                     hook for — this vault publishes {}. Nothing was written",
                    asset.source.display(),
                    plugin_list(&groups),
                ),
            ));
        }
        assets_by_plugin.entry(plugin).or_default().push(asset);
    }

    let hook_files = load_hook_files(vfs, &request.hooks, &groups, &config)?;

    // One render per harness, each into its own capturing overlay, at the
    // final destination paths. Both modes read this and nothing else; `build`
    // even writes from it. An overlay per root rather than one for all of
    // them: the capture then needs no question asked of it about which root a
    // path belongs to, because each holds one root's and only one root's.
    let inputs = RenderInputs {
        vault_root: &vault_root,
        groups: &groups,
        name: &name,
        config: &config,
        assets: &assets_by_plugin,
        hook_files: &hook_files,
        ns,
    };
    let mut rendered: Vec<BTreeMap<String, PreviewWrite>> = Vec::with_capacity(roots.len());
    for spec in &roots {
        let preview = PreviewVfs::over(vfs);
        // Call warnings are about the source, so every root raises the same.
        for warning in render_root(&preview, &inputs, &out_root, spec)? {
            if !warnings.contains(&warning) {
                warnings.push(warning);
            }
        }
        rendered.push(root_relative(&out_root, preview.into_writes())?);
    }
    warnings.sort_by(|a, b| a.path.cmp(&b.path));

    // The components no root could take, listed once rather than per root:
    // the reason is the layout's, not any one root's. A component only some
    // roots cannot take is named under each of those roots.
    let mut units = not_carried;
    let mut to_swap: Vec<usize> = Vec::new();
    for (index, spec) in roots.iter().enumerate() {
        let diff = diff_root(vfs, &out_root, spec, &groups, &rendered[index], &config)?;
        // The one thing a build landing in a directory it does not own must
        // not do quietly. The swap replaces this root's whole tree; a tree of
        // that name holding work this build did not produce is far likelier
        // to be a misconfiguration than an invitation.
        //
        // A rebuild is told from a stranger by the rule in
        // [`DestTree::built_here`]. Refused on `check` too — it exists to say
        // what a build would do.
        if diff.foreign {
            return Err(CoreError::refused(
                "foreign-tree",
                format!(
                    "{} already holds `{}`, and none of it was built from this vault: \
                     rendering `{}` here would replace it wholesale. Move it aside, or point \
                     `marketplace.out` somewhere else. Nothing was written",
                    out_root.display(),
                    spec.tree(),
                    spec.name,
                ),
            ));
        }
        units.extend(diff.units);
        let mut uncarried: Vec<&DiscoveredComponent> = commands
            .iter()
            .chain(&hooks)
            .copied()
            .filter(|c| !kind_carried(c, spec) && targets_admit(c, spec))
            .collect();
        uncarried.sort_by(|a, b| a.vault_relative_path.cmp(&b.vault_relative_path));
        units.extend(uncarried.into_iter().map(|c| ExportUnit::NotCarried {
            root: Some(spec.name.to_owned()),
            path: c.vault_relative_path.clone(),
            kind: c.kind.as_str().to_owned(),
        }));
        if !diff.equal {
            to_swap.push(index);
        }
    }
    let changed = !to_swap.is_empty();

    if request.mode == ExportMode::Check {
        return Ok(ExportReport {
            mode: ExportMode::Check,
            checked: members.len(),
            changed,
            units,
            warnings,
        });
    }

    if changed {
        let swapping: Vec<(&RootSpec, &BTreeMap<String, PreviewWrite>)> = to_swap
            .iter()
            .map(|index| (roots[*index], &rendered[*index]))
            .collect();
        commit(vfs, &out_root, &swapping)?;
    }
    // The build report is the check's comparison under the write verbs: what
    // matched is unchanged, what differed was (just) written.
    for unit in &mut units {
        match unit {
            ExportUnit::Plugin { status, .. } | ExportUnit::Manifest { status, .. } => {
                *status = match status {
                    UnitStatus::Ok | UnitStatus::Unchanged => UnitStatus::Unchanged,
                    UnitStatus::Drift | UnitStatus::Written => UnitStatus::Written,
                };
            }
            // Neither has a status: one is what a swap removes, the other is
            // what no layout could take.
            ExportUnit::Stale { .. } | ExportUnit::NotCarried { .. } => {}
        }
    }
    Ok(ExportReport {
        mode: ExportMode::Build,
        checked: members.len(),
        changed,
        units,
        warnings,
    })
}

/// A plugin this build publishes from its own note, with no version from the
/// note or the config. It ships as `0.1.0`, and a harness compares versions
/// to decide whether an installed pack is out of date — so a pack that never
/// states one never looks updated.
fn missing_versions(
    discovered: &[DiscoveredComponent],
    market: Option<&str>,
    groups: &BTreeMap<&str, PluginGroup<'_>>,
    config: &MarketplaceConfig,
) -> Vec<DiscoveryWarning> {
    discovered
        .iter()
        .filter(|c| c.kind == EntityKind::Plugin && belongs_to(c, market))
        .filter(|c| groups.contains_key(c.name.as_str()))
        .filter(|c| {
            overrides_for(config, &c.name)
                .and_then(|o| o.version.as_ref())
                .is_none()
        })
        .map(|c| DiscoveryWarning {
            path: c.vault_relative_path.clone(),
            reason: "missing-version".to_owned(),
            detail: format!(
                "plugin `{}` states no version; published as `0.1.0`. Set `ap-version` on \
                 its note so a harness can tell an update from what it has",
                c.name
            ),
        })
        .collect()
}

/// The manifest fields this build renders under, read from the vault first and
/// the request second.
///
/// # Why the note outranks the request
///
/// A marketplace note *is* the marketplace: its name, its owner, who authors
/// the packs under it — a fact about the vault, versioned with it and visible
/// in Obsidian. [`MarketplaceConfig`] stays required for what no note can
/// answer. A vault holding no marketplace directory at all is legal
/// ([`resolve_marketplace`] returns `None` for it); the request is the whole
/// identity there.
///
/// # Errors
///
/// `refused: name-disagreement` — the request names one marketplace and the
/// vault's own note names another. Silently preferring either one publishes a
/// tree under a name its author did not choose.
fn resolve_config(
    discovered: &[DiscoveredComponent],
    market: Option<&str>,
    requested: &MarketplaceConfig,
) -> Result<(String, MarketplaceConfig), CoreError> {
    let mut config = requested.clone();

    // A marketplace's own note is the one component that belongs to no
    // marketplace while naming one — see `DiscoveredComponent::marketplace`.
    let note = market.and_then(|name| {
        discovered
            .iter()
            .find(|c| c.kind == EntityKind::Marketplace && c.name == name)
    });
    if let Some(note) = note {
        config.name = Some(note.name.clone());
        // The note's `description` is the Agent Skills spec field every component carries,
        // not an `ap-` key — the same rule the plugin loop below follows. A
        // marketplace describes itself where a skill describes itself.
        take(&mut config.description, Some(note.description.clone()));
        take(&mut config.display_name, note.identity.display_name.clone());
        take(&mut config.owner, note.identity.owner.clone());
        take(&mut config.author, note.identity.author.clone());
        take(&mut config.license, note.identity.license.clone());
    }
    // Failing a note, the marketplace's own name is what it is called: the
    // folder named the level, and a distribution named `house` on disk should
    // not need a second place to say so.
    if config.name.is_none() {
        config.name = market.map(str::to_owned);
    }
    // The one thing nothing supplied. Everything else in this type has a
    // documented default; a name does not, because there is nothing sensible to
    // call a distribution its author never named.
    if config.name.is_none() {
        return Err(CoreError::refused(
            "unnamed-marketplace",
            match market {
                Some(name) => format!(
                    "marketplace `{name}` has no note naming it and the build supplied no name \
                     either — add a `{name}/{name}.md` carrying `name:`, or configure one"
                ),
                None => "this vault holds no marketplace to name one, and the build supplied no \
                         name — configure one, or give the vault a `marketplaces/<name>/` holding \
                         its own note"
                    .to_owned(),
            },
        ));
    }

    // Each plugin note fills its own override block. A block the request
    // already spelled is left alone only field by field: a vault naming its
    // pack's license and a request naming its version must produce a manifest
    // carrying both, not whichever side spoke last.
    for note in discovered
        .iter()
        .filter(|c| c.kind == EntityKind::Plugin)
        .filter(|c| belongs_to(c, market))
    {
        let overrides = config.plugins.entry(note.name.clone()).or_default();
        // The note's `description` is the Agent Skills spec field every component carries,
        // not an `ap-` key: a plugin note describes its pack in the same place
        // a skill note describes itself.
        take(&mut overrides.description, Some(note.description.clone()));
        take(&mut overrides.version, note.identity.version.clone());
        take(&mut overrides.author, note.identity.author.clone());
        take(&mut overrides.license, note.identity.license.clone());
        take(&mut overrides.keywords, note.identity.keywords.clone());
        take(&mut overrides.category, note.identity.category.clone());
        take(
            &mut overrides.display_name,
            note.identity.display_name.clone(),
        );
    }

    // Settled, so nothing below has to hold an `Option` it has already proved
    // is `Some`. The name and the rest travel together from here.
    let name = config.name.clone().unwrap_or_default();
    Ok((name, config))
}

/// Writes `from` into `slot` when the note supplied it, leaving a request-only
/// value in place. The vault outranks the request where both spoke; where the
/// vault is silent the request is all there is.
fn take<T>(slot: &mut Option<T>, from: Option<T>) {
    if let Some(value) = from {
        *slot = Some(value);
    }
}

/// Which marketplace this build renders, given what the vault holds.
///
/// One `out_root` holds one marketplace, so this is a choice the request
/// either makes or the vault makes for it. Discovery keys uniqueness on the
/// marketplace, so two of them may hold the same plugin holding the same
/// skill name; flattening them onto one tree would land both on one path and
/// keep whichever was written last.
///
/// `None` comes back only for a vault with no marketplaces at all — every
/// skill promoted to the vault level. That vault still builds, into an
/// unnamed marketplace whose identity comes from the config alone.
fn resolve_marketplace(
    discovered: &[DiscoveredComponent],
    requested: Option<&str>,
) -> Result<Option<String>, CoreError> {
    let present: BTreeSet<&str> = discovered
        .iter()
        .filter_map(|component| component.marketplace.as_deref())
        .collect();
    match requested {
        Some(name) => {
            if present.contains(name) {
                return Ok(Some(name.to_owned()));
            }
            // A vault holding no marketplace directory has no set to select
            // from, so naming one is not a wrong selection — it is what the
            // output gets called. Every skill in such a vault is promoted above
            // any marketplace and belongs to whichever one is built.
            if present.is_empty() {
                return Ok(Some(name.to_owned()));
            }
            Err(CoreError::refused(
                "unknown-marketplace",
                format!(
                    "no marketplace `{name}` in this vault: it holds {}",
                    named(&present)
                ),
            ))
        }
        None => match present.len() {
            0 => Ok(None),
            1 => Ok(present.iter().next().map(|name| (*name).to_owned())),
            _ => Err(CoreError::refused(
                "ambiguous-marketplace",
                format!(
                    "this vault holds {} and one output root holds one of them — name the one to \
                     build",
                    named(&present)
                ),
            )),
        },
    }
}

/// Does this component render into the marketplace being built?
///
/// Its own do. So does everything promoted above every marketplace: a
/// component at the vault level belongs to none of them and is shared by all
/// of them — the promotion rule read from the far end — so it renders into
/// each marketplace that is built, rather than into none.
fn belongs_to(component: &DiscoveredComponent, market: Option<&str>) -> bool {
    match (component.marketplace.as_deref(), market) {
        (None, _) => true,
        (Some(own), Some(market)) => own == market,
        (Some(_), None) => false,
    }
}

/// `` `a`, `b` and `c` `` — for a refusal that has to name what it found.
fn named(names: &BTreeSet<&str>) -> String {
    let quoted: Vec<String> = names.iter().map(|name| format!("`{name}`")).collect();
    match quoted.split_last() {
        None => String::new(),
        Some((last, [])) => last.clone(),
        Some((last, rest)) => format!("{} and {last}", rest.join(", ")),
    }
}

/// Plugin groups, members in discovery's name order.
///
/// Called once for skills and once for commands — a skill and a command of
/// the same name never collide here, because they render into disjoint
/// subtrees (`skills/<name>/` vs `commands/<name>.<ext>`) and this function
/// only checks collisions within the one slice it was given.
///
/// A bare member belongs to no plugin in the vault, but every member needs
/// *some* plugin directory in a marketplace tree — so the configured default
/// is applied here rather than in the scan. Where a member lives is a fact
/// about the vault; where it publishes is a fact about this build.
///
/// # Errors
///
/// `refused: path-collision` — two members of the same kind landing on one
/// directory. This vault is legal and discovery passed it: a promoted skill
/// and a marketplace's own skill of that name are two files in two places,
/// and only this build, which renders both into one tree, can see them meet.
fn group_by_plugin<'a>(
    skills: &[&'a DiscoveredComponent],
    commands: &[&'a DiscoveredComponent],
    hooks: &[&'a DiscoveredComponent],
    default_plugin: &'a str,
) -> Result<BTreeMap<&'a str, PluginGroup<'a>>, CoreError> {
    // Which list a member of each kind joins. The collision check is per
    // kind, not across kinds: the three render into disjoint subtrees, so a
    // skill and a command of one name are two directories, not one.
    type Pick<'a> = for<'g> fn(&'g mut PluginGroup<'a>) -> &'g mut Vec<&'a DiscoveredComponent>;
    let kinds: [(&[&'a DiscoveredComponent], Pick<'a>); 3] = [
        (skills, |group| &mut group.skills),
        (commands, |group| &mut group.commands),
        (hooks, |group| &mut group.hooks),
    ];

    let mut groups: BTreeMap<&str, PluginGroup> = BTreeMap::new();
    for (members, pick) in kinds {
        for member in members {
            let plugin = member.plugin.as_deref().unwrap_or(default_plugin);
            let siblings = pick(groups.entry(plugin).or_default());
            if let Some(first) = siblings.iter().find(|m| m.name == member.name) {
                return Err(CoreError::refused(
                    "path-collision",
                    format!(
                        "`{}` and `{}` both render as {} `{}` of plugin `{plugin}` — two \
                         components cannot publish onto one directory",
                        first.vault_relative_path,
                        member.vault_relative_path,
                        member.kind.as_str(),
                        member.name
                    ),
                ));
            }
            siblings.push(member);
        }
    }
    Ok(groups)
}

/// One plugin's members in a marketplace tree, by kind.
///
/// The three kinds stay separate lists because they render into disjoint
/// subtrees (`skills/`, `commands/`, `hooks/`) and only skills feed the
/// plugin manifest's `Skills: …` wording. What they no longer are is three
/// parallel maps: which plugins the vault holds is one question, and every
/// consumer used to answer it again by unioning three key sets.
#[derive(Default)]
struct PluginGroup<'a> {
    skills: Vec<&'a DiscoveredComponent>,
    commands: Vec<&'a DiscoveredComponent>,
    hooks: Vec<&'a DiscoveredComponent>,
}

impl<'a> PluginGroup<'a> {
    /// What one root takes from this plugin. The admission rule is
    /// [`admits`]'s; this is the one place it is applied per root, so the
    /// render, the diff and the marketplace manifest cannot disagree about
    /// which members a root carries.
    fn admitted(&self, spec: &RootSpec) -> Admitted<'a> {
        let narrow = |members: &[&'a DiscoveredComponent]| -> Vec<&'a DiscoveredComponent> {
            members
                .iter()
                .copied()
                .filter(|member| admits(member, spec))
                .collect()
        };
        Admitted {
            skills: narrow(&self.skills),
            commands: narrow(&self.commands),
            hooks: narrow(&self.hooks),
        }
    }
}

/// One plugin as one root carries it.
struct Admitted<'a> {
    skills: Vec<&'a DiscoveredComponent>,
    commands: Vec<&'a DiscoveredComponent>,
    hooks: Vec<&'a DiscoveredComponent>,
}

impl Admitted<'_> {
    /// A plugin whose every member is narrowed away is absent from this root
    /// entirely: no directory, no manifest, no listing. Its converse is what
    /// makes a commands-only or hooks-only plugin real here — carrying no
    /// skill is not carrying nothing.
    fn is_empty(&self) -> bool {
        self.skills.is_empty() && self.commands.is_empty() && self.hooks.is_empty()
    }
}

/// Does this member publish into this root? Two gates. A member either
/// gate narrows out is absent from the root's tree; [`export_skills`] names
/// one the first gate drops as [`ExportUnit::NotCarried`] for that root,
/// and says nothing of one the second drops, the same as
/// [`crate::publish::publishes_to`]:
///
/// 1. **Kind.** A command is admitted only where
///    [`crate::publish::plugin_format_carries_commands`] is `true` for this
///    root's name, and a hook only where
///    [`crate::publish::plugin_format_carries_hooks`] is — a root with no
///    place for one narrows it out regardless of what `ap-targets` says, the
///    same as a root with no place for an agent refuses one at publish time.
/// 2. **`ap-targets`.** Matched on the destination a name resolves to —
///    `claude-code` admits the `claude` root — exactly as
///    [`crate::publish::publishes_to`] matches, over names discovery already
///    validated.
fn admits(component: &DiscoveredComponent, spec: &RootSpec) -> bool {
    kind_carried(component, spec) && targets_admit(component, spec)
}

/// Gate 1 of [`admits`]: whether this root's pack format has a place for the
/// member's kind.
fn kind_carried(component: &DiscoveredComponent, spec: &RootSpec) -> bool {
    match component.kind {
        EntityKind::Command => crate::publish::plugin_format_carries_commands(spec.name),
        EntityKind::Hook => crate::publish::plugin_format_carries_hooks(spec.name),
        _ => true,
    }
}

/// Gate 2 of [`admits`]: whether the member's `ap-targets` names this root.
fn targets_admit(component: &DiscoveredComponent, spec: &RootSpec) -> bool {
    match &component.targets {
        None => true,
        Some(names) => names
            .iter()
            .any(|name| crate::publish::canonical_target(name) == Some(spec.name)),
    }
}

// --- Rendering ---------------------------------------------------------------

/// Renders each root, whole, through `vfs` — which is always the preview
/// overlay: nothing below this line knows whether the run is a build or a
/// check, and that is the no-drift argument.
///
/// Everything a render reads, gathered once so a root's render takes the
/// root it is rendering and little else.
struct RenderInputs<'a> {
    vault_root: &'a Path,
    /// Plugin name to members of every kind — see [`PluginGroup`], whose
    /// [`PluginGroup::admitted`] applies the per-root narrowing the render
    /// and the diff both read.
    groups: &'a BTreeMap<&'a str, PluginGroup<'a>>,
    name: &'a str,
    config: &'a MarketplaceConfig,
    /// Plugin name to the assets landing in its root, verbatim. See
    /// [`AssetSpec`].
    assets: &'a BTreeMap<&'a str, Vec<&'a AssetSpec>>,
    /// Plugin name to its canonical hooks file, parsed, with its gap report.
    hook_files: &'a BTreeMap<String, HookFile>,
    ns: &'a Namespace,
}

/// One root, whole, under `base`.
///
/// One root rather than both, and `base` rather than a name joined onto an
/// output root: the caller owns where a root lands, and this owns what lands
/// there. Every path written is under `base`, which is what lets the caller
/// read the capture back as root-relative without asking which root a path
/// belongs to. Returns the call warnings the root's compiles raised.
fn render_root(
    vfs: &dyn Vfs,
    inputs: &RenderInputs<'_>,
    base: &Path,
    spec: &RootSpec,
) -> Result<Vec<DiscoveryWarning>, CoreError> {
    let runtime = parse_runtime_target(spec.runtime)?;
    let render = |skill: &IndexedSkill| match &skill.plugin {
        Some(plugin) => rendered_skill_call(runtime, spec.naming, plugin, &skill.name),
        None => checked_skill_call(runtime, None, &skill.name),
    };
    // Every skill in the marketplace, under the plugin it ships in, so a call
    // to one this root narrows away is refused rather than rendered.
    let skills = SkillIndex::new(inputs.groups.iter().flat_map(|(plugin, group)| {
        let admitted: BTreeSet<&Path> = group
            .admitted(spec)
            .skills
            .iter()
            .map(|skill| skill.entry_path.as_path())
            .collect();
        group.skills.iter().map(move |skill| IndexedSkill {
            entry_path: skill.entry_path.clone(),
            plugin: Some((*plugin).to_owned()),
            name: skill.name.clone(),
            shipped: admitted.contains(skill.entry_path.as_path()),
        })
    }));
    let calls = CallContext {
        skills: SkillSource::ready(&skills),
        render: &render,
        target: spec.name,
        implicit: true,
        warnings: RefCell::new(Vec::new()),
    };
    for (plugin, group) in inputs.groups {
        let admitted = group.admitted(spec);
        if admitted.is_empty() {
            continue;
        }
        let plugin_base = base.join(spec.packs).join(*plugin);
        // The shim's only job is finding this plugin's own launcher asset at
        // `inputs.config.shim_target`, so it can exist at all only where that
        // asset does. A plugin that never declares one (every plugin in the
        // repo-root vault, today) gets `None` here regardless of root — this
        // stays invisible to a build that has no use for it, which is what
        // keeps existing plugins that never declare a shim target unchanged. Whether a given
        // root actually emits the shim for a given skill is a second,
        // per-skill decision inside `render_skill`: `spec.cli_invocation`
        // gates it by harness, and the skill's own compiled body gates it by
        // whether that skill calls the CLI at all.
        let shim_target = inputs
            .assets
            .get(plugin)
            .is_some_and(|assets| assets.iter().any(|a| a.dest == inputs.config.shim_target))
            .then_some(inputs.config.shim_target.as_str());
        let siblings: BTreeSet<&str> = group.skills.iter().map(|s| s.name.as_str()).collect();
        for skill in &admitted.skills {
            render_skill(
                vfs,
                inputs.vault_root,
                &plugin_base,
                spec,
                SkillMember {
                    plugin,
                    skill,
                    siblings: &siblings,
                    calls: &calls,
                },
                inputs.ns,
                shim_target,
            )?;
        }
        for command in &admitted.commands {
            render_command_for_root(
                vfs,
                inputs.vault_root,
                &plugin_base,
                spec,
                command,
                &calls,
                inputs.ns,
            )?;
        }
        let wrote_hooks = render_hooks_for_root(
            vfs,
            &plugin_base,
            spec,
            &admitted.hooks,
            inputs.hook_files.get(*plugin),
            inputs.ns,
        )?;
        for asset in inputs.assets.get(plugin).into_iter().flatten() {
            render_asset(vfs, &plugin_base, asset)?;
        }
        let manifest = plugin_manifest(spec, plugin, &admitted.skills, inputs.config, wrote_hooks);
        write_rendered(
            vfs,
            &plugin_base.join(spec.plugin_manifest),
            manifest.as_bytes(),
            false,
        )?;
    }
    if let Some(path) = spec.marketplace_manifest {
        let manifest = marketplace_manifest(spec, inputs.groups, inputs.name, inputs.config);
        write_rendered(vfs, &base.join(path), manifest.as_bytes(), false)?;
    }
    Ok(calls.warnings.into_inner())
}

/// One skill as a pack renders it: the plugin it ships in, and how its
/// calls render on this root.
struct SkillMember<'a> {
    plugin: &'a str,
    skill: &'a DiscoveredComponent,
    /// Every skill name in `plugin`, narrowed or not: the names a
    /// `${CLAUDE_PLUGIN_ROOT}/skills/<name>` path may address.
    siblings: &'a BTreeSet<&'a str>,
    calls: &'a CallContext<'a>,
}

/// One skill into one root: read, compile, stamp provenance, project through
/// the root's runtime, and land the files under `skills/<name>/`.
///
/// `shim_target` is the caller's answer to "does this plugin ship a launcher
/// asset, and where" — `Some(dest)` is the fact [`CliInvocation::SkillRelativeShim`]
/// needs to rewrite a `${CLAUDE_PLUGIN_ROOT}/<shim_target>` call site at all.
/// Threading it down rather than re-deriving it per skill keeps that question
/// asked exactly once per plugin per root. Whether *this* skill ends up with
/// the `scripts/sdlc` file is decided below, per skill: only a root configured
/// for the rewrite, and only a skill whose compiled body actually contained a
/// call site to rewrite.
fn render_skill(
    vfs: &dyn Vfs,
    vault_root: &Path,
    plugin_base: &Path,
    spec: &RootSpec,
    member: SkillMember<'_>,
    ns: &Namespace,
    shim_target: Option<&str>,
) -> Result<(), CoreError> {
    let skill = member.skill;
    let published = published_skill_name(spec.naming, member.plugin, &skill.name)?;
    let note = read_vault_skill(vfs, &skill.entry_path, ns)?;
    let mut projection = note.projection;
    projection.content.name = published.clone();
    // Every root this function renders through is a skill layout — see the
    // module doc — so no kind gate is needed the way `publish::publish_onto`
    // has one for a command.
    projection
        .content
        .apply_arguments(&note.frontmatter.arguments);
    compile_projection(
        vfs,
        &CompileSource {
            vault_root,
            entry_path: &skill.entry_path,
            bundle_root: skill.bundle_root.as_deref(),
            skill_name: &skill.name,
            calls: Some(member.calls),
        },
        &mut projection,
    )?;
    // The vault writes every CLI call site as `${CLAUDE_PLUGIN_ROOT}/<shim_target>`
    // — right for Claude, which substitutes that token itself, but dead text
    // for a root whose harness has no such substitution (see
    // `CliInvocation`). `used_shim` is whether this skill's own body actually
    // contained the call site: it is what decides, below, whether this skill
    // gets the `scripts/sdlc` shim file at all — a Codex/Cursor skill that
    // never calls the CLI has nothing for the shim to serve.
    let mut used_shim = false;
    if spec.cli_invocation == CliInvocation::SkillRelativeShim
        && let Some(target) = shim_target
    {
        let (rewritten, rewrote) = rewrite_cli_invocation(&projection.content.body, target);
        projection.content.body = rewritten;
        used_shim = rewrote;
    }
    if spec.naming == SkillNaming::PluginPrefixed {
        projection.content.body =
            rewrite_sibling_paths(&projection.content.body, member.plugin, member.siblings);
    }
    // The provenance marker, after compilation (and the CLI-invocation
    // rewrite above) so the validator has already ruled on the body it
    // annotates. A comment, so every harness ignores it.
    projection.content.body = format!(
        "{GENERATED_MARKER}{}; do not edit. -->\n\n{}",
        skill.vault_relative_path, projection.content.body
    );

    let files = project_skill(&projection, &[spec.runtime.to_owned()], ns)?;
    let strip = format!("{}/{published}/", spec.projection_prefix);
    for file in files {
        let relative = file.relative_path.strip_prefix(&strip).ok_or_else(|| {
            CoreError::Projection(format!(
                "{}: `{}` did not land under `{strip}` — the {} projection moved its layout",
                skill.name, file.relative_path, spec.runtime
            ))
        })?;
        let destination = plugin_base.join("skills").join(&published).join(relative);
        write_rendered(vfs, &destination, &file.content, file.executable)?;
    }
    // Emitted only where the rewrite above actually happened: a root not
    // configured for `SkillRelativeShim` (Claude) never needs the shim at
    // all, and a skill whose body never called the CLI has nothing pointing
    // at it either way. `used_shim` implies `shim_target` was `Some` — the
    // rewrite above only sets it inside that branch.
    if used_shim {
        let target = shim_target.expect("used_shim is only set when shim_target is Some");
        write_rendered(
            vfs,
            &plugin_base
                .join("skills")
                .join(&published)
                .join(SHIM_RELATIVE_PATH),
            sdlc_shim_script(target).as_bytes(),
            true,
        )?;
    }
    Ok(())
}

/// Rewrites every literal `${CLAUDE_PLUGIN_ROOT}/<shim_target>` call site in
/// a compiled skill body to [`SHIM_RELATIVE_PATH`], for a root whose harness
/// has no `${CLAUDE_PLUGIN_ROOT}` substitution of its own (see
/// [`CliInvocation::SkillRelativeShim`]). Returns the rewritten body and
/// whether any rewrite happened — the signal [`render_skill`] uses to decide
/// whether this skill needs the shim file at all.
///
/// A match only counts when the character right after `shim_target` cannot
/// continue the same path or filename — so `${CLAUDE_PLUGIN_ROOT}/cli/sdlc.js`
/// (the bundled entry the launcher itself execs, a real citation in some
/// skill prose) is left untouched rather than truncated into
/// `scripts/sdlc.js`, which names no file this render ever writes.
fn rewrite_cli_invocation(body: &str, shim_target: &str) -> (String, bool) {
    let needle = format!("${{CLAUDE_PLUGIN_ROOT}}/{shim_target}");
    crate::text::replace_bounded(body, &needle, SHIM_RELATIVE_PATH, |c| {
        c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | '/')
    })
}

/// Rewrites `${CLAUDE_PLUGIN_ROOT}/skills/<name>` to
/// `${CLAUDE_PLUGIN_ROOT}/skills/<plugin>-<name>` for each `<name>` in
/// `siblings`, so a body that addresses a skill's files through the plugin
/// root still finds them under [`SkillNaming::PluginPrefixed`]. Any other
/// name, and any `skills/` path not after the token, is left alone.
fn rewrite_sibling_paths(body: &str, plugin: &str, siblings: &BTreeSet<&str>) -> String {
    const NEEDLE: &str = "${CLAUDE_PLUGIN_ROOT}/skills/";
    let mut out = String::with_capacity(body.len());
    let mut rest = body;
    while let Some(offset) = rest.find(NEEDLE) {
        let (head, tail) = rest.split_at(offset + NEEDLE.len());
        out.push_str(head);
        let end = tail
            .find(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_')))
            .unwrap_or(tail.len());
        if siblings.contains(&tail[..end]) {
            out.push_str(plugin);
            out.push('-');
        }
        rest = tail;
    }
    out.push_str(rest);
    out
}

/// Would `asset` write the file at `manifest` (relative to the pack root)?
/// A file asset does when its `dest` is that path; a directory asset does
/// when its tree holds the file at the matching place.
fn asset_covers(vfs: &dyn Vfs, asset: &AssetSpec, manifest: &str) -> bool {
    let dest: PathBuf = Path::new(&asset.dest)
        .components()
        .filter(|c| !matches!(c, std::path::Component::CurDir))
        .collect();
    let Ok(rest) = Path::new(manifest).strip_prefix(&dest) else {
        return false;
    };
    if rest.as_os_str().is_empty() {
        return true;
    }
    is_directory(vfs, &asset.source) && vfs.exists(&asset.source.join(rest))
}

/// Is `dest` a plain relative path with no `..` component and no root/prefix
/// (an absolute Unix path, or a Windows drive/UNC prefix)? `AssetSpec::dest`
/// is documented as "relative, forward-slashed," but nothing enforced that
/// promise before [`render_asset`] joins it onto `plugin_base` — `PathBuf::join`
/// silently honors both an absolute replacement and a lexical `..` escape.
/// Called from the build's up-front per-asset validation loop (alongside the
/// `unknown-asset-plugin` check), so an unsafe `dest` refuses the whole build
/// before anything is written, rather than failing partway through a render.
fn asset_dest_is_relative(dest: &str) -> bool {
    use std::path::Component;
    Path::new(dest)
        .components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

/// One asset into one plugin's root: read the source verbatim, from wherever
/// it lives on the host filesystem, and land it at its declared destination.
/// A directory source lands file by file, each at its own path under `dest`,
/// with [`EXCLUDED_BUNDLE_DIRECTORIES`] pruned at every depth — the same
/// dev-only-fixture rule a skill's bundle sweep follows — and every file
/// named `*.test.*` skipped, so a shared tree of reference docs does not carry
/// its own test suite into the build, whether that suite sits in a `tests/`
/// directory or beside the code it tests.
///
/// Unlike a skill or a bundle resource, an asset is never compiled: it is not
/// a vault note, and its whole point is to ship exactly the bytes on disk —
/// a binary launcher or a wasm artifact has no Obsidian syntax to resolve.
/// `asset.dest` is validated relative/traversal-free by
/// [`asset_dest_is_relative`] before any asset ever reaches this function
/// (the build's up-front per-asset loop), so the `plugin_base.join` below is
/// safe by construction, not by convention.
fn render_asset(vfs: &dyn Vfs, plugin_base: &Path, asset: &AssetSpec) -> Result<(), CoreError> {
    let dest = plugin_base.join(&asset.dest);
    if !is_directory(vfs, &asset.source) {
        return copy_verbatim(vfs, &asset.source, &dest);
    }
    for source in walk_files(vfs, &asset.source, EXCLUDED_BUNDLE_DIRECTORIES)? {
        if is_test_file(&source) {
            continue;
        }
        let relative = source.strip_prefix(&asset.source).map_err(|_| {
            CoreError::Projection(format!(
                "asset walk under `{}` yielded `{}`, outside it",
                asset.source.display(),
                source.display()
            ))
        })?;
        copy_verbatim(vfs, &source, &dest.join(relative))?;
    }
    Ok(())
}

/// Is this a co-located test file (`<name>.test.<ext>`)? The file-level half
/// of a directory asset's dev-only exclude; see [`render_asset`].
fn is_test_file(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|name| name.to_string_lossy().contains(".test."))
}

/// One file's bytes and execute bit, from `source` to `dest`.
fn copy_verbatim(vfs: &dyn Vfs, source: &Path, dest: &Path) -> Result<(), CoreError> {
    let bytes = vfs.read_file(source)?;
    let executable = vfs.is_executable(source);
    write_rendered(vfs, dest, &bytes, executable)
}

/// Is `path` a directory? Asked of its parent's listing, the one directory
/// signal every [`Vfs`] reports the same way — a symlinked directory reads as
/// a non-directory there, so it is copied as a file (and fails loudly on
/// read) rather than walked out of the tree it appears to sit in.
fn is_directory(vfs: &dyn Vfs, path: &Path) -> bool {
    let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
        return false;
    };
    let name = name.to_string_lossy();
    vfs.read_dir(parent)
        .is_ok_and(|entries| entries.iter().any(|e| e.is_dir && e.name == name))
}

/// The per-skill `scripts/sdlc` shim: a parent-walk from its own directory
/// looking for `shim_target` — the plugin-level launcher asset, from
/// [`MarketplaceConfig::shim_target`] — falling back to `sdlc` on `PATH`.
/// POSIX `sh`, not `bash`: this ships only inside a skill whose rendered body
/// [`rewrite_cli_invocation`] actually rewrote (see [`render_skill`]), and the
/// plugin's own `cli/sdlc` launcher is the one script here that already
/// commits to bash (it needs `BASH_SOURCE` to resolve a symlink chain); this
/// one does not need that, so it stays to the smaller shell.
fn sdlc_shim_script(shim_target: &str) -> String {
    format!(
        "#!/bin/sh\n\
# sdlc — per-skill shim. GENERATED by agent-pants; do not edit.\n\
#\n\
# Walks up from this script's own directory looking for {shim_target} — the\n\
# plugin-level launcher asset — and runs it. Falls back to `sdlc` on PATH\n\
# when no such ancestor is found (a skill copied out of the plugin, or a\n\
# harness that doesn't lay out {shim_target} where this build put it).\n\
#\n\
# This skill's own body calls this shim directly: its harness has no\n\
# `${{CLAUDE_PLUGIN_ROOT}}` substitution of its own, so every\n\
# `${{CLAUDE_PLUGIN_ROOT}}/{shim_target}` call site the vault wrote was\n\
# rewritten to this skill-relative path at render time. Claude Code does\n\
# substitute that token, so a Claude skill never gets this file at all.\n\
set -eu\n\
\n\
dir=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\n\
while [ \"$dir\" != \"/\" ]; do\n\
  if [ -x \"$dir/{shim_target}\" ]; then\n\
    exec \"$dir/{shim_target}\" \"$@\"\n\
  fi\n\
  dir=$(dirname -- \"$dir\")\n\
done\n\
\n\
exec sdlc \"$@\"\n\
"
    )
}

/// One command into one root: read, compile, stamp provenance, project
/// through the root's runtime, and land the one file under `commands/`.
///
/// The peer of [`render_skill`], called only for a root whose
/// [`crate::publish::plugin_format_carries_commands`] is `true` —
/// [`render_roots`] never calls this for a root that has no place for one.
///
/// # Errors
///
/// `refused: no-renderer` if the command note carries peer resources — the
/// same hazard [`crate::publish::publish_skill`] refuses a standalone command
/// publish for: a command's projection is one file, with nowhere for a peer
/// to travel.
fn render_command_for_root(
    vfs: &dyn Vfs,
    vault_root: &Path,
    plugin_base: &Path,
    spec: &RootSpec,
    command: &DiscoveredComponent,
    calls: &CallContext<'_>,
    ns: &Namespace,
) -> Result<(), CoreError> {
    let note = read_vault_skill(vfs, &command.entry_path, ns)?;
    let mut projection = note.projection;
    projection
        .content
        .apply_arguments(&note.frontmatter.arguments);
    compile_projection(
        vfs,
        &CompileSource {
            vault_root,
            entry_path: &command.entry_path,
            bundle_root: command.bundle_root.as_deref(),
            skill_name: &command.name,
            calls: Some(calls),
        },
        &mut projection,
    )?;
    // After the compile, not before: compiling resolves the body's `[[links]]`
    // and `![[embeds]]` and adds what they reach to `projection.resources`. A
    // check that ran first would see only the bundle-seeded peers and pass a
    // command whose body embeds a file from elsewhere in the vault — which
    // `project_command` then has nowhere to put.
    crate::publish::refuse_carried_peers(&projection, "command")?;
    projection.content.body = format!(
        "{GENERATED_MARKER}{}; do not edit. -->\n\n{}",
        command.vault_relative_path, projection.content.body
    );

    // A command projects to exactly one file, `<commands_dir>/<slug>.ext` —
    // no per-skill subdirectory to strip a prefix down to, so the file's own
    // name is all that travels onto `commands/`.
    let files = project_command(&projection, &[spec.runtime.to_owned()], ns, None)?;
    for file in files {
        let filename = Path::new(&file.relative_path).file_name().ok_or_else(|| {
            CoreError::Projection(format!(
                "{}: `{}` names no file — the {} projection moved its layout",
                command.name, file.relative_path, spec.runtime
            ))
        })?;
        let destination = plugin_base.join("commands").join(filename);
        write_rendered(vfs, &destination, &file.content, file.executable)?;
    }
    Ok(())
}

/// A plugin's hooks into one root: every hook note read and projected, plus
/// the hooks from the plugin's canonical file this root carries, each
/// localized for this root ([`crate::hooks_file::localize`]; notes are not),
/// written as
/// the single `hooks/hooks.json` the plugin format defines. Returns whether
/// that file was written.
///
/// Not the peer of [`render_skill`] and [`render_command_for_root`] in shape,
/// because a hook is not a file: a harness reads one hooks document per
/// plugin, so the members render together or the second one overwrites the
/// first. No hooks to write means no hooks file; the gap report is still
/// written (see [`crate::hooks_file`]).
///
/// # No provenance marker, and no transclusion
///
/// The marker every emitted `SKILL.md` opens with is an HTML comment, and a
/// hook's body is a shell script or a prompt inside a JSON string. Prepending
/// a comment to it would change what runs. For the same reason the body is
/// taken verbatim rather than through [`compile_projection`]: a `![[embed]]`
/// expanded into a script is a rewrite of the thing being executed.
///
/// # Errors
///
/// `refused: no-renderer` if a hook note carries peer resources — the same
/// hazard a command publish refuses, and for the same reason: the hooks
/// document is one file, with nowhere for a peer to travel. Everything
/// [`to_adapt_hook`] and [`project_plugin_hooks`] refuse, unchanged — among
/// them a hook *note* this root cannot carry, which stops the build rather
/// than writing a partial hooks file. The one exception is a note with no
/// `ap-targets` that another hooks-carrying root does carry: it is left off
/// this root, the way `ap-targets` would narrow it. A canonical file's
/// uncarried hooks are not a refusal; see [`crate::hooks_file`].
fn render_hooks_for_root(
    vfs: &dyn Vfs,
    plugin_base: &Path,
    spec: &RootSpec,
    hooks: &[&DiscoveredComponent],
    file: Option<&HookFile>,
    ns: &Namespace,
) -> Result<bool, CoreError> {
    let runtime = parse_runtime_target(spec.runtime)?;
    let mut rendered = Vec::with_capacity(hooks.len());
    for hook in hooks {
        let note = read_vault_skill(vfs, &hook.entry_path, ns)?;
        crate::publish::refuse_carried_peers(&note.projection, "hook")?;
        let adapted = to_adapt_hook(&note.projection, Some(spec.name))?;
        if hook.targets.is_none()
            && agent_adapt::render::hook_refusal(&adapted, runtime).is_some()
            && carried_elsewhere(&note.projection, spec)?
        {
            continue;
        }
        rendered.push(adapted);
    }
    if let Some(file) = file {
        write_rendered(
            vfs,
            &plugin_base.join(crate::hooks_file::GAP_REPORT_PATH),
            file.gap_report.as_bytes(),
            false,
        )?;
        if crate::publish::plugin_format_carries_hooks(spec.name) {
            let var = spec.plugin_root_var.map(|var| var.name);
            rendered.extend(
                crate::hooks_file::carried_hooks(&file.hooks, runtime)
                    .into_iter()
                    .map(|hook| crate::hooks_file::localize(hook, spec.name, var)),
            );
        }
    }
    let Some(bytes) = project_plugin_hooks(&rendered, spec.runtime)? else {
        return Ok(false);
    };
    write_rendered(
        vfs,
        &plugin_base.join(crate::publish::PLUGIN_HOOKS_PATH),
        &bytes,
        false,
    )?;
    Ok(true)
}

/// The plugins a build holds, for a refusal that names a missing one.
fn plugin_list(groups: &BTreeMap<&str, PluginGroup<'_>>) -> String {
    if groups.is_empty() {
        return "no plugins".to_owned();
    }
    groups
        .keys()
        .map(|k| format!("`{k}`"))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Does some hooks-carrying root other than `spec` carry this hook note?
/// Every root counts, selected or not, so the answer does not depend on what a
/// build selects.
fn carried_elsewhere(
    projection: &crate::content::SkillProjection,
    spec: &RootSpec,
) -> Result<bool, CoreError> {
    for other in ROOTS {
        if other.name == spec.name || !crate::publish::plugin_format_carries_hooks(other.name) {
            continue;
        }
        let hook = to_adapt_hook(projection, Some(other.name))?;
        let runtime = parse_runtime_target(other.runtime)?;
        if agent_adapt::render::hook_refusal(&hook, runtime).is_none() {
            return Ok(true);
        }
    }
    Ok(false)
}

/// One plugin's canonical hooks file, parsed, and the gap report every one of
/// its packs carries.
struct HookFile {
    hooks: Vec<agent_adapt::Hook>,
    gap_report: String,
}

/// Every [`HookFileSpec`], read and parsed, keyed by plugin.
///
/// The gap report covers every harness this build supports, not only the
/// selected ones, so it is the same bytes whatever a build selects. A
/// harness's `file` is set only when its pack carries some of the file's
/// hooks: the format carries hooks, the root admits the plugin, and at least
/// one hook is carried.
///
/// # Errors
///
/// * `refused: unknown-hooks-plugin` — the plugin holds no skill, command or
///   hook, so there is no pack to carry the file.
/// * `refused: duplicate-hooks-file` — two files for one plugin.
/// * What [`crate::hooks_file::parse_hooks_file`] refuses, and a read failure.
fn load_hook_files(
    vfs: &dyn Vfs,
    specs: &[HookFileSpec],
    groups: &BTreeMap<&str, PluginGroup<'_>>,
    config: &MarketplaceConfig,
) -> Result<BTreeMap<String, HookFile>, CoreError> {
    let mut out = BTreeMap::new();
    for spec in specs {
        let plugin = spec
            .plugin
            .as_deref()
            .unwrap_or(config.default_plugin.as_str());
        let Some(group) = groups.get(plugin) else {
            return Err(CoreError::refused(
                "unknown-hooks-plugin",
                format!(
                    "hooks file `{}` names plugin `{plugin}`, which this build holds no skill, \
                     command or hook for — this vault publishes {}. Nothing was written",
                    spec.from,
                    plugin_list(groups),
                ),
            ));
        };
        if out.contains_key(plugin) {
            return Err(CoreError::refused(
                "duplicate-hooks-file",
                format!(
                    "plugin `{plugin}` has more than one hooks file; `{}` is the second. Merge \
                     them into one. Nothing was written",
                    spec.from
                ),
            ));
        }
        let bytes = vfs.read_file(&spec.source)?;
        let text = String::from_utf8(bytes).map_err(|_| {
            CoreError::refused("malformed-hooks-file", format!("{}: not UTF-8", spec.from))
        })?;
        let hooks = crate::hooks_file::parse_hooks_file(&text, &spec.from)?;
        let harnesses = ROOTS
            .iter()
            .map(|root| {
                let runtime = parse_runtime_target(root.runtime)?;
                let carries = crate::publish::plugin_format_carries_hooks(root.name)
                    && !group.admitted(root).is_empty()
                    && !crate::hooks_file::carried_hooks(&hooks, runtime).is_empty();
                Ok(crate::hooks_file::GapHarness {
                    name: root.name,
                    runtime,
                    plugin_root_var: root.plugin_root_var,
                    file: carries.then_some(crate::publish::PLUGIN_HOOKS_PATH),
                })
            })
            .collect::<Result<Vec<_>, CoreError>>()?;
        let gap_report = crate::hooks_file::render_gap_report(&spec.from, &hooks, &harnesses);
        out.insert(plugin.to_owned(), HookFile { hooks, gap_report });
    }
    Ok(out)
}

/// One rendered file: parents created, bytes written, the execute bit set
/// *both* ways — a stale bit at the destination must not survive into the
/// captured render, and the overlay inherits the bit underneath on a rewrite.
fn write_rendered(
    vfs: &dyn Vfs,
    path: &Path,
    bytes: &[u8],
    executable: bool,
) -> Result<(), CoreError> {
    if let Some(parent) = path.parent() {
        vfs.create_dir_all(parent)?;
    }
    vfs.write_file(path, bytes)?;
    if vfs.is_executable(path) != executable {
        vfs.set_executable(path, executable)?;
    }
    Ok(())
}

/// One root's captured render, keyed by where each file lands inside it.
///
/// [`render_root`] writes nothing outside `base`, so every path strips. A
/// path that does not is a bug in the renderer, and it is refused here rather
/// than carried through under its full spelling: that spelling is absolute,
/// and `Path::join` with an absolute argument discards the base it is joined
/// to, so [`commit`] would stage it *outside* the stage and outside the
/// marketplace directory. A renderer bug must not become a write to an
/// arbitrary path.
fn root_relative(
    base: &Path,
    writes: BTreeMap<PathBuf, PreviewWrite>,
) -> Result<BTreeMap<String, PreviewWrite>, CoreError> {
    writes
        .into_iter()
        .map(|(path, write)| {
            let relative = path.strip_prefix(base).map_err(|_| {
                CoreError::refused(
                    "render-escaped-root",
                    format!(
                        "the render produced `{}`, which is not inside `{}` — \
                         that is a bug in this crate, and nothing was written",
                        path.display(),
                        base.display()
                    ),
                )
            })?;
            Ok((forward_slashed(relative), write))
        })
        .collect()
}

// --- Comparison --------------------------------------------------------------

/// One root's comparison: whole-tree equality (the swap's grain) and the
/// per-unit stories a report tells about it.
struct RootDiff {
    equal: bool,
    units: Vec<ExportUnit>,
    /// This root's tree is already there, and nothing it renders is — so
    /// whatever is there was put there by someone else. See
    /// [`RootDiff::foreign`]'s only caller.
    foreign: bool,
}

/// What the destination root actually holds.
#[derive(Default)]
struct DestState {
    /// Root-relative file paths → is-symlink. A symlink never matches: the
    /// render emits bytes, and a link that reads the same resolves elsewhere.
    files: BTreeMap<String, bool>,
    /// Directories holding nothing — invisible to a file diff, removed by the
    /// swap, so the report has to carry them.
    empty_dirs: Vec<String>,
    /// Immediate directories under `plugins/`, for the stale-plugin sweep.
    plugin_dirs: Vec<String>,
}

/// Reads `base`, but only the top-level entries named — never the whole
/// directory.
///
/// The scope is the swap's: what the swap would replace is exactly what the
/// report may call stale, or `check` would claim a build removes something it
/// leaves alone. It matters most where a root shares its directory with
/// things that are not marketplace — at a repository root, walking the whole
/// base would read `.git` as drift and rewrite it on every build.
fn scan_destination(vfs: &dyn Vfs, base: &Path, spec: &RootSpec) -> Result<DestState, CoreError> {
    let mut state = DestState::default();
    let tree = base.join(spec.tree());
    if vfs.exists(&tree) {
        // A symlink AT the tree is one unmatched path, never descended into —
        // the same rule `walk_destination` applies further down.
        if vfs.is_symlink(&tree) {
            state.files.insert(spec.tree().to_owned(), true);
        } else if vfs.read_dir(&tree).is_err() {
            // A file where the render wants a directory.
            state.files.insert(spec.tree().to_owned(), false);
        } else {
            walk_destination(vfs, base, &tree, &mut state)?;
        }
    }
    let packs = base.join(spec.packs);
    if vfs.exists(&packs) {
        let mut entries = vfs.read_dir(&packs)?;
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        state.plugin_dirs = entries
            .into_iter()
            .filter(|entry| entry.is_dir && !vfs.is_symlink(&packs.join(&entry.name)))
            .map(|entry| entry.name)
            .collect();
    }
    Ok(state)
}

fn walk_destination(
    vfs: &dyn Vfs,
    base: &Path,
    dir: &Path,
    state: &mut DestState,
) -> Result<(), CoreError> {
    let mut entries = vfs.read_dir(dir)?;
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    if entries.is_empty() && dir != base {
        let relative = dir.strip_prefix(base).unwrap_or(dir);
        state.empty_dirs.push(forward_slashed(relative));
        return Ok(());
    }
    for entry in entries {
        let path = dir.join(&entry.name);
        let relative = path.strip_prefix(base).unwrap_or(&path);
        if vfs.is_symlink(&path) {
            // The link itself, wherever it points — a symlinked directory is
            // never descended into, so it records as one unmatched entry.
            state.files.insert(forward_slashed(relative), true);
        } else if entry.is_dir {
            walk_destination(vfs, base, &path, state)?;
        } else {
            state.files.insert(forward_slashed(relative), false);
        }
    }
    Ok(())
}

/// One root's destination, scanned once, with the byte-and-bit comparison
/// every caller shares.
///
/// The comparison lives here rather than in a closure per caller because two
/// callers ask it: the swap, which wants one boolean about the whole tree,
/// and the report, which wants a story per plugin. Read off one scan and one
/// `matches`, they cannot disagree.
struct DestTree<'v> {
    vfs: &'v dyn Vfs,
    base: PathBuf,
    state: DestState,
}

impl<'v> DestTree<'v> {
    fn scan(vfs: &'v dyn Vfs, base: PathBuf, spec: &RootSpec) -> Result<Self, CoreError> {
        let state = scan_destination(vfs, &base, spec)?;
        Ok(Self { vfs, base, state })
    }

    /// Does the destination hold exactly this rendered file — a real file
    /// rather than a symlink that happens to read the same, the same bytes,
    /// and the same execute bit?
    fn matches(&self, relative: &str, write: &PreviewWrite) -> bool {
        if self.state.files.get(relative) != Some(&false) {
            return false;
        }
        let path = self.base.join(Path::new(relative));
        self.vfs
            .read_file(&path)
            .is_ok_and(|bytes| bytes == write.bytes)
            && self.vfs.is_executable(&path) == write.executable
    }

    /// The render and the destination bucketed against each other, once.
    fn compare(&self, rendered: &BTreeMap<String, PreviewWrite>) -> FileSets {
        let mut sets = FileSets::default();
        for (relative, write) in rendered {
            let bucket = if self.matches(relative, write) {
                &mut sets.same
            } else {
                &mut sets.differs
            };
            bucket.insert(relative.clone());
        }
        sets.extra = self
            .state
            .files
            .keys()
            .filter(|relative| !rendered.contains_key(*relative))
            .cloned()
            .collect();
        sets
    }

    /// Did a previous build of this vault write this tree?
    ///
    /// **Provenance, not path overlap.** A rendered path being occupied says
    /// only that something is where this build would put something — and a
    /// hand-written marketplace puts its `marketplace.json` at exactly the
    /// path this build renders one to. Asking "is any rendered path present"
    /// therefore answers *yes* for the case that most needs a *no*: a
    /// repository that already is a marketplace, pointed at by `out: "."`,
    /// which is the adoption this feature invites.
    ///
    /// [`GENERATED_MARKER`] is the one thing in the tree that only this crate
    /// writes. Every emitted skill body opens with it, so a tree this vault
    /// built carries it and a tree someone wrote by hand does not.
    ///
    /// A marker is not always available: only one plugin format carries
    /// commands ([`crate::publish::plugin_format_carries_commands`]), so a
    /// commands-only plugin leaves the other harness a tree of manifests and
    /// nothing else. The second clause covers that — a tree holding nothing
    /// but paths this render also produces is one this render owns.
    ///
    /// **The residue, stated rather than hidden.** A hand-written Claude
    /// marketplace laid out the documented way keeps its packs in a *sibling*
    /// `plugins/`, so its `.claude-plugin/` holds only `marketplace.json` —
    /// a path this build renders. That tree satisfies the second clause and
    /// is still replaced. Closing it needs provenance this crate writes and
    /// can read back, which is a file in the tree, not a cleverer reading of
    /// the files already there.
    fn built_here(&self, rendered: &BTreeMap<String, PreviewWrite>) -> bool {
        self.state
            .files
            .keys()
            .any(|relative| self.carries_marker(relative))
            || self
                .state
                .files
                .keys()
                .all(|relative| rendered.contains_key(relative))
    }

    /// Does this installed file open with the provenance marker? Read lazily
    /// and short-circuited by the `any` above, so an ordinary rebuild stops
    /// at the first skill it finds.
    fn carries_marker(&self, relative: &str) -> bool {
        self.read(relative).is_some_and(|bytes| {
            bytes
                .windows(GENERATED_MARKER.len())
                .any(|window| window == GENERATED_MARKER.as_bytes())
        })
    }

    /// One installed file's bytes, for the report alone. The comparison
    /// never needs them — `matches` has already answered.
    fn read(&self, relative: &str) -> Option<Vec<u8>> {
        self.vfs
            .read_file(&self.base.join(Path::new(relative)))
            .ok()
    }
}

/// Every path either tree holds, bucketed once: `same` and `differs`
/// partition the render, and `extra` is what the destination holds beyond it.
#[derive(Default)]
struct FileSets {
    same: BTreeSet<String>,
    differs: BTreeSet<String>,
    extra: BTreeSet<String>,
}

/// The swap's own question: is this root, as a tree, exactly the render?
///
/// Every rendered file matched, nothing else present, no empty directory.
/// The middle term is where a count used to stand: given every rendered path
/// matched, the destination holds all of them, so "the destination holds no
/// more files than the render" is exactly `extra` being empty.
fn root_is_equal(sets: &FileSets, dest: &DestTree<'_>) -> bool {
    sets.differs.is_empty() && sets.extra.is_empty() && dest.state.empty_dirs.is_empty()
}

/// One carried plugin's share of the comparison.
#[derive(Default)]
struct PluginSlice<'a> {
    differs: Vec<&'a str>,
    extra: Vec<&'a str>,
    /// An empty directory inside this plugin's tree — invisible to a file
    /// comparison, removed by the swap, so it drifts the plugin holding it.
    dirty: bool,
}

/// Which plugins this root carries, and how many skills each contributes.
///
/// Admission folds all three kinds, exactly as [`render_root`] folds them —
/// the same call, so the diff cannot admit a plugin the render left out. The
/// count stays skills-only because that is what [`ExportUnit::Plugin`]'s
/// `skills` reports.
fn admitted_plugins<'a>(
    spec: &RootSpec,
    groups: &BTreeMap<&'a str, PluginGroup<'_>>,
) -> BTreeMap<&'a str, usize> {
    groups
        .iter()
        .filter_map(|(plugin, group)| {
            let admitted = group.admitted(spec);
            (!admitted.is_empty()).then_some((*plugin, admitted.skills.len()))
        })
        .collect()
}

/// The report's side of the comparison: one unit per carried plugin, then
/// this root's manifest, then whatever the destination holds that no unit
/// already speaks for.
///
/// `rendered` is still needed beside `sets`, for one rule: an empty
/// directory is suppressed when the render owns files beneath it, and that
/// is a prefix query rather than a set membership.
fn describe_root(
    dest: &DestTree<'_>,
    spec: &RootSpec,
    admitted: &BTreeMap<&str, usize>,
    rendered: &BTreeMap<String, PreviewWrite>,
    sets: &FileSets,
    config: &MarketplaceConfig,
) -> Vec<ExportUnit> {
    // A destination plugin directory this root no longer carries. It is one
    // unit, and its files are never reported on their own: the swap removes
    // the directory whole, and a line per file inside it would say the same
    // thing many times.
    let stale_plugins: BTreeSet<&str> = dest
        .state
        .plugin_dirs
        .iter()
        .map(String::as_str)
        .filter(|name| !admitted.contains_key(name))
        .collect();

    // Bucket what carries a story by the plugin that owns it. Membership is
    // decided against the two NAME sets, never by path shape alone: a
    // symlinked plugin directory is absent from `plugin_dirs` and present
    // among the files, so it is neither carried nor stale, and falls to the
    // loose pile like any other stray.
    let mut slices: BTreeMap<&str, PluginSlice> = BTreeMap::new();
    let mut loose: Vec<&str> = Vec::new();
    for relative in &sets.extra {
        match spec.split_pack(relative) {
            Some((name, tail)) if admitted.contains_key(name) && !tail.is_empty() => {
                slices.entry(name).or_default().extra.push(relative);
            }
            Some((name, _)) if stale_plugins.contains(name) => {}
            _ => loose.push(relative),
        }
    }
    for relative in &sets.differs {
        if let Some((name, tail)) = spec.split_pack(relative)
            && !tail.is_empty()
            && admitted.contains_key(name)
        {
            slices.entry(name).or_default().differs.push(relative);
        }
    }

    // Empty directories, in the one order that keeps each to a single story:
    // inside a carried plugin it drifts that plugin; inside a stale one that
    // plugin's unit already speaks for it; where the render owns files
    // beneath it the owning unit reports the gap; otherwise it is stale on
    // its own.
    let mut stale_paths: Vec<(String, StaleKind)> = Vec::new();
    for dir in &dest.state.empty_dirs {
        match spec.split_pack(dir) {
            Some((name, tail)) if admitted.contains_key(name) && !tail.is_empty() => {
                slices.entry(name).or_default().dirty = true;
            }
            Some((name, _)) if stale_plugins.contains(name) => {}
            _ if rendered.keys().any(|k| k.starts_with(&format!("{dir}/"))) => {}
            _ => stale_paths.push((dir.clone(), StaleKind::EmptyDir)),
        }
    }

    let mut units = Vec::new();
    for (plugin, skills) in admitted {
        let slice = slices.get(plugin);
        let ok = slice.is_none_or(|s| s.differs.is_empty() && s.extra.is_empty() && !s.dirty);
        units.push(ExportUnit::Plugin {
            root: spec.name.to_owned(),
            name: (*plugin).to_owned(),
            skills: *skills,
            status: if ok {
                UnitStatus::Ok
            } else {
                UnitStatus::Drift
            },
            version_bump_suggestion: plugin_version_bump(
                dest, spec, plugin, rendered, slice, config,
            ),
        });
    }

    if let Some(manifest) = spec.marketplace_manifest {
        units.push(ExportUnit::Manifest {
            root: spec.name.to_owned(),
            status: if sets.same.contains(manifest) {
                UnitStatus::Ok
            } else {
                UnitStatus::Drift
            },
        });
    }

    for name in &stale_plugins {
        units.push(ExportUnit::Stale {
            root: spec.name.to_owned(),
            path: format!("{}/{name}", spec.packs),
            kind: StaleKind::Plugin,
        });
    }
    stale_paths.extend(
        loose
            .into_iter()
            .map(|path| (path.to_owned(), StaleKind::File)),
    );
    stale_paths.sort_by(|a, b| a.0.cmp(&b.0));
    stale_paths.dedup_by(|a, b| a.0 == b.0);
    for (path, kind) in stale_paths {
        units.push(ExportUnit::Stale {
            root: spec.name.to_owned(),
            path,
            kind,
        });
    }
    units
}

/// The version-bump signal for one plugin at one root: its MEMBER files
/// drifted, and the installed pack manifest still carries the version the
/// vault currently declares.
///
/// `None` when the plugin's note carries no `ap-version`, or when nothing
/// among its members actually changed — the pack manifest can drift on its
/// own (a description, an author) without a member having moved, and that is
/// not this rule. The tail of the rule, the one that reads the installed
/// manifest back, is [`crate::status::version_bump_if_unmoved`], shared with
/// `status_of`.
fn plugin_version_bump(
    dest: &DestTree<'_>,
    spec: &RootSpec,
    plugin: &str,
    rendered: &BTreeMap<String, PreviewWrite>,
    slice: Option<&PluginSlice<'_>>,
    config: &MarketplaceConfig,
) -> Option<VersionBumpSuggestion> {
    let current_version = overrides_for(config, plugin).and_then(|o| o.version.clone())?;
    let manifest_key = format!("{}/{plugin}/{}", spec.packs, spec.plugin_manifest);
    if !rendered.contains_key(&manifest_key) {
        return None;
    }
    // Members changed when a rendered member did not match, or when the
    // destination holds a member the render does not — which is what a count
    // comparison used to say, given every other rendered member matched.
    let slice = slice?;
    let members_changed =
        slice.differs.iter().any(|p| *p != manifest_key) || !slice.extra.is_empty();
    if !members_changed {
        return None;
    }
    version_bump_if_unmoved(dest.read(&manifest_key).as_deref(), current_version)
}

/// One root's comparison, both answers from one reading of the destination.
///
/// The two halves are computed side by side here, and nowhere else, because
/// `check` promises its verdict is `build`'s: a report saying `drift` while
/// the swap sees an equal tree, or the reverse, is the one way this file
/// could lie.
fn diff_root(
    vfs: &dyn Vfs,
    out_root: &Path,
    spec: &RootSpec,
    groups: &BTreeMap<&str, PluginGroup<'_>>,
    rendered: &BTreeMap<String, PreviewWrite>,
    config: &MarketplaceConfig,
) -> Result<RootDiff, CoreError> {
    let dest = DestTree::scan(vfs, out_root.to_path_buf(), spec)?;
    let sets = dest.compare(rendered);
    let admitted = admitted_plugins(spec, groups);
    let occupied = vfs.exists(&out_root.join(spec.tree()));
    Ok(RootDiff {
        equal: root_is_equal(&sets, &dest),
        units: describe_root(&dest, spec, &admitted, rendered, &sets, config),
        foreign: occupied && !dest.built_here(rendered),
    })
}

fn commit(
    vfs: &dyn Vfs,
    out_root: &Path,
    swapping: &[(&RootSpec, &BTreeMap<String, PreviewWrite>)],
) -> Result<(), CoreError> {
    let stage = out_root.join(STAGE_DIR);
    // A stage left by a crashed run is dead weight; a fresh build owns the
    // path.
    if vfs.exists(&stage) {
        vfs.remove(&stage)?;
    }
    vfs.create_dir_all(&stage.join("backup"))?;
    vfs.create_dir_all(out_root)?;

    for (_, rendered) in swapping {
        for (relative, write) in *rendered {
            let path = stage.join("new").join(Path::new(relative));
            if let Some(parent) = path.parent() {
                vfs.create_dir_all(parent)?;
            }
            vfs.write_file(&path, &write.bytes)?;
            if write.executable {
                vfs.set_executable(&path, true)?;
            }
        }
    }

    let mut swapped: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (spec, _) in swapping {
        let tree = spec.tree();
        let dest = out_root.join(tree);
        let staged = stage.join("new").join(tree);
        let saved = stage.join("backup").join(tree);
        let staged = vfs.exists(&staged).then_some(staged);
        // Nothing here and nothing to put here: a root that renders nothing.
        if staged.is_none() && !vfs.exists(&dest) {
            continue;
        }
        if let Some(parent) = saved.parent() {
            vfs.create_dir_all(parent)?;
        }
        if let Err(error) = swap_one(vfs, &dest, &saved, staged.as_deref()) {
            // Everything the rollback could not put back, the failing tree
            // included: `swap_one` restores its own backup best-effort, and
            // this is the check on whether it managed.
            let mut unrestored: Vec<PathBuf> = Vec::new();
            if !vfs.exists(&dest) && vfs.exists(&saved) {
                unrestored.push(dest.clone());
            }
            if let Err(failed) = roll_back(vfs, &swapped) {
                unrestored.push(failed);
            }
            let mut message = format!(
                "swapping `{tree}` into {}: {error}; everything already swapped was rolled back \
                 and the destination is as it was",
                out_root.display()
            );
            if unrestored.is_empty() {
                let _ = vfs.remove(&stage);
            } else {
                // The one state this function cannot leave clean: name what
                // was not restored and keep its backup instead of deleting it.
                let names: Vec<String> =
                    unrestored.iter().map(|p| p.display().to_string()).collect();
                message.push_str(&format!(
                    " — except {}, whose rollback failed; the backup survives under {}",
                    names.join(", "),
                    stage.join("backup").display()
                ));
            }
            return Err(CoreError::SwapFailed(message));
        }
        swapped.push((dest, saved));
    }
    vfs.remove(&stage)?;
    Ok(())
}

/// One root's swap: the live tree aside, the staged tree in. On failure the
/// root's own backup is restored before the error surfaces, so the caller
/// only ever rolls back *completed* swaps.
fn swap_one(
    vfs: &dyn Vfs,
    dest: &Path,
    saved: &Path,
    staged: Option<&Path>,
) -> Result<(), CoreError> {
    if vfs.exists(dest) {
        vfs.rename(dest, saved)?;
    }
    // Nothing staged is not nothing happening: the entry was owned, it is
    // backed up, and leaving it unrestored is how what the vault no longer
    // produces goes away.
    let Some(staged) = staged else {
        return Ok(());
    };
    if let Err(error) = vfs.rename(staged, dest) {
        if vfs.exists(saved) && !vfs.exists(dest) {
            let _ = vfs.rename(saved, dest);
        }
        return Err(error);
    }
    Ok(())
}

/// Unwinds completed swaps, newest first. `Err` names the first destination
/// whose restore failed; its backup is deliberately left in place.
fn roll_back(vfs: &dyn Vfs, swapped: &[(PathBuf, PathBuf)]) -> Result<(), PathBuf> {
    for (dest, saved) in swapped.iter().rev() {
        if vfs.exists(dest) && vfs.remove(dest).is_err() {
            return Err(dest.clone());
        }
        if vfs.exists(saved) && vfs.rename(saved, dest).is_err() {
            return Err(dest.clone());
        }
    }
    Ok(())
}

// --- Manifests ---------------------------------------------------------------

/// Two-space indentation, stable key order, one trailing newline — the byte
/// form both manifests share, and the reason `check` can compare bytes.
pub(crate) fn stable_json<T: Serialize>(value: &T) -> String {
    let mut buffer = Vec::new();
    let formatter = serde_json::ser::PrettyFormatter::with_indent(b"  ");
    let mut serializer = serde_json::Serializer::with_formatter(&mut buffer, formatter);
    value
        .serialize(&mut serializer)
        .expect("manifest types serialize infallibly");
    let mut out = String::from_utf8(buffer).expect("serde_json emits UTF-8");
    out.push('\n');
    out
}

fn overrides_for<'a>(config: &'a MarketplaceConfig, plugin: &str) -> Option<&'a PluginOverrides> {
    config.plugins.get(plugin)
}

fn plugin_version(config: &MarketplaceConfig, plugin: &str) -> String {
    overrides_for(config, plugin)
        .and_then(|o| o.version.clone())
        .unwrap_or_else(|| "0.1.0".to_owned())
}

/// The description names the root's *own* members. A narrowed skill is
/// absent from the root, so its manifest does not name it.
fn plugin_description(
    config: &MarketplaceConfig,
    plugin: &str,
    members: &[&DiscoveredComponent],
) -> String {
    overrides_for(config, plugin)
        .and_then(|o| o.description.clone())
        .unwrap_or_else(|| {
            let names: Vec<&str> = members.iter().map(|skill| skill.name.as_str()).collect();
            format!("Skills: {}.", names.join(", "))
        })
}

fn plugin_category(config: &MarketplaceConfig, plugin: &str) -> String {
    overrides_for(config, plugin)
        .and_then(|o| o.category.clone())
        .unwrap_or_else(|| "Productivity".to_owned())
}

fn plugin_license(config: &MarketplaceConfig, plugin: &str) -> String {
    overrides_for(config, plugin)
        .and_then(|o| o.license.clone())
        .or_else(|| config.license.clone())
        .unwrap_or_else(|| "UNLICENSED".to_owned())
}

fn plugin_author(config: &MarketplaceConfig, plugin: &str) -> Option<serde_json::Value> {
    overrides_for(config, plugin)
        .and_then(|o| o.author.clone())
        .or_else(|| config.author.clone())
        .or_else(|| config.owner.clone())
        .map(normalize_author)
}

/// Claude's plugin schema requires `author` as `{ name, email? }`, but a
/// marketplace note may still write `ap-author: <name>` as a bare string.
/// A string is promoted to `{ "name": <string> }`; anything else (already an
/// object, or a type the schema does not expect) passes through unchanged.
/// The one call site both dialects render through, so both get it.
fn normalize_author(author: serde_json::Value) -> serde_json::Value {
    match author {
        serde_json::Value::String(name) => serde_json::json!({ "name": name }),
        other => other,
    }
}

/// Which dialect a pack manifest is rendered in.
///
/// Claude, Codex and Cursor differ in one field — Codex carries an
/// `interface` block and the other two do not. Pi's is a different file
/// altogether. This is the whole of what a caller outside this module has to
/// choose between for a *pack* manifest. The marketplace manifests differ
/// more, and each dialect names its own builder. Field order in the rendered
/// manifest is fixed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginDialect {
    /// The Claude pack manifest.
    Claude,
    /// The Codex pack manifest, with an `interface` block.
    Codex,
    /// Cursor's pack manifest is Claude's shape — `name`, `version`,
    /// `description`, `author`, `license`, `keywords`, `skills`, every one of
    /// them a documented Cursor Plugin field
    /// (<https://cursor.com/docs/reference/plugins> retrieved 2026-09-20). It
    /// is a separate variant because it lands in `.cursor-plugin/` and
    /// because its marketplace index is its own shape, not because the pack
    /// manifest differs.
    Cursor,
    /// Pi's pack manifest is a `package.json` at the pack root whose
    /// `pi.skills` points at the pack's `skills/` directory. Pi has no
    /// marketplace index.
    Pi,
}

/// One plugin's pack manifest.
///
/// Public because a per-destination plugin publish ([`crate::publish`]) emits
/// the same file into a different tree. Rendering it twice would be two
/// answers to "what is a pack manifest", and the first divergence between them
/// would be invisible until a runtime rejected one of the two.
///
/// `hooks` is the manifest's `hooks` entry, written as given; `None` writes
/// none.
pub fn render_plugin_manifest(
    dialect: PluginDialect,
    plugin: &str,
    members: &[&DiscoveredComponent],
    config: &MarketplaceConfig,
    hooks: Option<&str>,
) -> String {
    if dialect == PluginDialect::Pi {
        return pi_package_manifest(plugin, members, config);
    }
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Interface {
        display_name: String,
        category: String,
    }
    #[derive(Serialize)]
    struct Manifest<'a> {
        name: String,
        version: String,
        description: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        author: Option<serde_json::Value>,
        license: String,
        keywords: Vec<String>,
        skills: &'static str,
        #[serde(skip_serializing_if = "Option::is_none")]
        hooks: Option<&'a str>,
        #[serde(skip_serializing_if = "Option::is_none")]
        interface: Option<Interface>,
    }
    let interface = (dialect == PluginDialect::Codex).then(|| Interface {
        display_name: overrides_for(config, plugin)
            .and_then(|o| o.display_name.clone())
            .unwrap_or_else(|| plugin.to_owned()),
        category: plugin_category(config, plugin),
    });
    stable_json(&Manifest {
        name: plugin.to_owned(),
        version: plugin_version(config, plugin),
        description: plugin_description(config, plugin, members),
        author: plugin_author(config, plugin),
        license: plugin_license(config, plugin),
        keywords: overrides_for(config, plugin)
            .and_then(|o| o.keywords.clone())
            .unwrap_or_default(),
        skills: "./skills/",
        hooks,
        interface,
    })
}

/// Pi's pack manifest: a `package.json` naming the pack's `skills/`
/// directory. Pi itself needs only `pi.skills`; `name`, `version`,
/// `description`, `author` and `license` are the same fields the other
/// dialects carry, in their npm places.
fn pi_package_manifest(
    plugin: &str,
    members: &[&DiscoveredComponent],
    config: &MarketplaceConfig,
) -> String {
    #[derive(Serialize)]
    struct Pi {
        skills: [&'static str; 1],
    }
    #[derive(Serialize)]
    struct Manifest {
        name: String,
        version: String,
        description: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        author: Option<serde_json::Value>,
        license: String,
        pi: Pi,
    }
    stable_json(&Manifest {
        name: plugin.to_owned(),
        version: plugin_version(config, plugin),
        description: plugin_description(config, plugin, members),
        author: plugin_author(config, plugin),
        license: plugin_license(config, plugin),
        pi: Pi {
            skills: ["./skills"],
        },
    })
}

/// The build's own call, choosing the dialect from the root it is rendering.
fn plugin_manifest(
    spec: &RootSpec,
    plugin: &str,
    members: &[&DiscoveredComponent],
    config: &MarketplaceConfig,
    wrote_hooks: bool,
) -> String {
    let hooks = spec.hooks_manifest_entry.filter(|_| wrote_hooks);
    render_plugin_manifest(spec.dialect, plugin, members, config, hooks)
}

/// One root's marketplace manifest, listing only the plugins that root
/// carries, in name order. Called only for a root that names one.
fn marketplace_manifest(
    spec: &RootSpec,
    groups: &BTreeMap<&str, PluginGroup<'_>>,
    name: &str,
    config: &MarketplaceConfig,
) -> String {
    // A plugin is listed here on any count — a commands-only or hooks-only
    // plugin (no skills at all) still needs an index entry, or nothing could
    // ever install it. `plugin_description`'s `Skills: …` wording still reads
    // the skills list alone; such a plugin gets an empty one rather than a
    // name this function has no way to describe instead.
    let listed: Vec<(&str, Vec<&DiscoveredComponent>)> = groups
        .iter()
        .filter_map(|(plugin, group)| {
            let admitted = group.admitted(spec);
            (!admitted.is_empty()).then_some((*plugin, admitted.skills))
        })
        .collect();

    match spec.dialect {
        PluginDialect::Codex => codex_marketplace_manifest(&listed, spec.packs, name, config),
        PluginDialect::Claude => claude_marketplace_manifest(&listed, spec.packs, name, config),
        PluginDialect::Cursor => cursor_marketplace_manifest(&listed, spec.packs, name, config),
        PluginDialect::Pi => unreachable!("the pi root names no marketplace manifest"),
    }
}

/// Codex's index: a `interface.displayName` beside the name, and an entry
/// carrying an installation policy rather than a description and a version.
fn codex_marketplace_manifest(
    listed: &[(&str, Vec<&DiscoveredComponent>)],
    packs: &str,
    name: &str,
    config: &MarketplaceConfig,
) -> String {
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Interface {
            display_name: String,
        }
        #[derive(Serialize)]
        struct Source {
            source: &'static str,
            path: String,
        }
        #[derive(Serialize)]
        struct Policy {
            installation: &'static str,
            authentication: &'static str,
        }
        #[derive(Serialize)]
        struct Entry {
            name: String,
            source: Source,
            policy: Policy,
            category: String,
        }
        #[derive(Serialize)]
        struct Manifest {
            name: String,
            interface: Interface,
            plugins: Vec<Entry>,
        }
        stable_json(&Manifest {
            name: name.to_owned(),
            interface: Interface {
                display_name: config
                    .display_name
                    .clone()
                    .unwrap_or_else(|| name.to_owned()),
            },
            plugins: listed
                .iter()
                .map(|(plugin, _)| Entry {
                    name: (*plugin).to_owned(),
                    source: Source {
                        source: "local",
                        path: format!("./{packs}/{plugin}"),
                    },
                    policy: Policy {
                        installation: "AVAILABLE",
                        authentication: "ON_INSTALL",
                    },
                    category: plugin_category(config, plugin),
                })
                .collect(),
        })
    }
}

/// Claude's index: a **required** owner object, an optional top-level
/// description, and an entry carrying the description and version the pack
/// manifest also holds.
///
/// `owner` is marked required and typed as an object — `name` required,
/// `email` and `url` optional — and a bare string is rejected outright
/// (`owner: Invalid input` from `claude plugin validate`). So a string is
/// normalised here rather than passed through, and an absent owner falls back
/// to the marketplace's own name, for the reason
/// [`cursor_marketplace_manifest`] gives: a manifest the harness loads beats a
/// field-perfect one it rejects, and there is no other name to reach for.
///
/// `description` is accepted both at the top level and under `metadata` for
/// backward compatibility, and the documentation recommends the top level
/// (<https://code.claude.com/docs/en/plugin-marketplaces> retrieved
/// 2026-09-20).
fn claude_marketplace_manifest(
    listed: &[(&str, Vec<&DiscoveredComponent>)],
    packs: &str,
    name: &str,
    config: &MarketplaceConfig,
) -> String {
    {
        #[derive(Serialize)]
        struct Entry {
            name: String,
            source: String,
            description: String,
            version: String,
        }
        #[derive(Serialize)]
        struct Manifest {
            name: String,
            owner: serde_json::Value,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<String>,
            plugins: Vec<Entry>,
        }
        stable_json(&Manifest {
            name: name.to_owned(),
            owner: config
                .owner
                .clone()
                .map(normalize_author)
                .unwrap_or_else(|| serde_json::json!({ "name": name })),
            description: config.description.clone(),
            plugins: listed
                .iter()
                .map(|(plugin, members)| Entry {
                    name: (*plugin).to_owned(),
                    source: format!("./{packs}/{plugin}"),
                    description: plugin_description(config, plugin, members),
                    version: plugin_version(config, plugin),
                })
                .collect(),
        })
    }
}

/// Cursor's index: Claude's entry shape under a **required** owner, a source
/// that is a plain relative path rather than a `./`-prefixed one, and a
/// description under `metadata` rather than at the top level.
///
/// All three are Cursor's documentation, not a preference
/// (<https://cursor.com/docs/reference/plugins> retrieved 2026-09-20): `owner`
/// is marked required, the worked example's `"source": "plugin-one"` carries
/// no prefix, and the field table gives `metadata` as the object holding
/// `description`, `version` and `pluginRoot` — Cursor documents no top-level
/// `description`, where Claude accepts one. When the configuration names no
/// owner, the marketplace's own name stands in — a manifest Cursor loads beats
/// a field-perfect one it rejects, and there is no other name to reach for.
fn cursor_marketplace_manifest(
    listed: &[(&str, Vec<&DiscoveredComponent>)],
    packs: &str,
    name: &str,
    config: &MarketplaceConfig,
) -> String {
    #[derive(Serialize)]
    struct Entry {
        name: String,
        source: String,
        description: String,
        version: String,
    }
    #[derive(Serialize)]
    struct Metadata {
        description: String,
    }
    #[derive(Serialize)]
    struct Manifest {
        name: String,
        owner: serde_json::Value,
        /// Absent entirely when nothing describes the marketplace: an empty
        /// `metadata` object would be a field Cursor reads as present.
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<Metadata>,
        plugins: Vec<Entry>,
    }
    stable_json(&Manifest {
        name: name.to_owned(),
        owner: config
            .owner
            .clone()
            .map(normalize_author)
            .unwrap_or_else(|| serde_json::json!({ "name": name })),
        metadata: config
            .description
            .clone()
            .map(|description| Metadata { description }),
        plugins: listed
            .iter()
            .map(|(plugin, members)| Entry {
                name: (*plugin).to_owned(),
                source: format!("{packs}/{plugin}"),
                description: plugin_description(config, plugin, members),
                version: plugin_version(config, plugin),
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use serde_json::json;

    use super::*;
    use crate::discover::MISSING_DESCRIPTION;
    use crate::vfs::{MemVfs, NativeVfs};

    fn ap() -> Namespace {
        Namespace::default()
    }

    fn write(vfs: &dyn Vfs, path: &str, content: &str) {
        let path = Path::new(path);
        vfs.create_dir_all(path.parent().unwrap()).unwrap();
        vfs.write_file(path, content.as_bytes()).unwrap();
    }

    /// A publishable note in this vault's vocabulary, with a caller-supplied
    /// body — for a test that needs to control what a skill's rendered text
    /// actually says (e.g. whether it calls the CLI at all).
    fn note_with_body(name: &str, plugin: Option<&str>, targets: &[&str], body: &str) -> String {
        let mut out = format!("---\nname: {name}\ndescription: Use {name}.\n");
        if let Some(plugin) = plugin {
            out.push_str(&format!("ap-plugin: {plugin}\n"));
        }
        if !targets.is_empty() {
            out.push_str("ap-targets:\n");
            for target in targets {
                out.push_str(&format!("  - {target}\n"));
            }
        }
        out.push_str("---\n\n");
        out.push_str(body);
        out
    }

    /// A publishable note in this vault's vocabulary.
    fn note(name: &str, plugin: Option<&str>, targets: &[&str]) -> String {
        note_with_body(name, plugin, targets, &format!("# {name}\n"))
    }

    /// The marketplace layout spec example 4: two plugins, one target narrowing.
    fn example_vault() -> MemVfs {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/plugins"))
            .unwrap();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md",
            &note("commit-helper", Some("git-tools"), &[]),
        );
        // The runtime spelling on purpose: `claude-code` must narrow the
        // `claude` root, the same folding a publish grants.
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/skills/rebase-guide.md",
            &note("rebase-guide", Some("git-tools"), &["claude-code"]),
        );
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/review-guide.md",
            &note("review-guide", None, &[]),
        );
        vfs
    }

    /// Overwrites `example_vault()`'s `review-guide` note so its body
    /// actually calls the CLI the vault-standard way, at the given
    /// `shim_target` — the fixture the shim tests below need now that the
    /// shim ships only for a skill whose text was actually rewritten (see
    /// [`CliInvocation::SkillRelativeShim`]), not merely for one whose
    /// plugin happens to carry the launcher asset. `shim_target` must match
    /// whatever the test's own `MarketplaceConfig::shim_target` is — a real
    /// vault's skill prose and its project file's `shim_target:` name the
    /// same launcher path, by convention, not by anything this render
    /// enforces.
    fn write_review_guide_calling(vfs: &dyn Vfs, shim_target: &str) {
        write(
            vfs,
            "/vault/marketplaces/house/plugins/tools/skills/review-guide.md",
            &note_with_body(
                "review-guide",
                None,
                &[],
                &format!(
                    "# review-guide\n\nRun `${{CLAUDE_PLUGIN_ROOT}}/{shim_target} entities validate`.\n"
                ),
            ),
        );
    }

    /// [`write_review_guide_calling`] at the default `cli/sdlc` target —
    /// the form skills normally write.
    fn write_review_guide_calling_cli(vfs: &dyn Vfs) {
        write_review_guide_calling(vfs, DEFAULT_SHIM_TARGET);
    }

    fn config() -> MarketplaceConfig {
        MarketplaceConfig {
            name: Some("demo-market".to_owned()),
            display_name: None,
            owner: None,
            description: None,
            author: None,
            license: None,
            default_plugin: "tools".to_owned(),
            plugins: BTreeMap::new(),
            require_descriptions: false,
            shim_target: DEFAULT_SHIM_TARGET.to_owned(),
        }
    }

    fn request(mode: ExportMode) -> ExportRequest {
        ExportRequest {
            vault_root: PathBuf::from("/vault"),
            skills_root: None,
            marketplace: None,
            out_root: PathBuf::from("/market"),
            harnesses: BTreeSet::new(),
            mode,
            config: config(),
            assets: Vec::new(),
            hooks: Vec::new(),
        }
    }

    fn build(vfs: &dyn Vfs) -> ExportReport {
        export_skills(vfs, &request(ExportMode::Build), &ap()).unwrap()
    }

    /// A build whose project file says something, for the configuration rungs
    /// a vault note cannot supply.
    fn build_with(vfs: &dyn Vfs, config: MarketplaceConfig) -> ExportReport {
        let mut request = request(ExportMode::Build);
        request.config = config;
        export_skills(vfs, &request, &ap()).unwrap()
    }

    fn check(vfs: &dyn Vfs) -> ExportReport {
        export_skills(vfs, &request(ExportMode::Check), &ap()).unwrap()
    }

    /// Every file under `root`: relative path, bytes, execute bit — sorted.
    fn files_under(vfs: &dyn Vfs, root: &Path) -> Vec<(String, Vec<u8>, bool)> {
        fn walk(vfs: &dyn Vfs, root: &Path, dir: &Path, out: &mut Vec<(String, Vec<u8>, bool)>) {
            let Ok(entries) = vfs.read_dir(dir) else {
                return;
            };
            for entry in entries {
                let path = dir.join(&entry.name);
                if entry.is_dir {
                    walk(vfs, root, &path, out);
                } else {
                    out.push((
                        forward_slashed(path.strip_prefix(root).unwrap()),
                        vfs.read_file(&path).unwrap(),
                        vfs.is_executable(&path),
                    ));
                }
            }
        }
        let mut out = Vec::new();
        walk(vfs, root, root, &mut out);
        out.sort();
        out
    }

    fn paths_under(vfs: &dyn Vfs, root: &Path) -> Vec<String> {
        files_under(vfs, root)
            .into_iter()
            .map(|(path, _, _)| path)
            .collect()
    }

    fn text_at(vfs: &dyn Vfs, path: &str) -> String {
        String::from_utf8(vfs.read_file(Path::new(path)).unwrap()).unwrap()
    }

    /// Which (root, unit-name) pairs a report says differ — `drift` for a
    /// check, `written` for a build. Manifest units count under the name
    /// `marketplace.json`.
    fn differing(report: &ExportReport) -> BTreeSet<(String, String)> {
        report
            .units
            .iter()
            .filter_map(|unit| match unit {
                ExportUnit::Plugin {
                    root,
                    name,
                    status: UnitStatus::Drift | UnitStatus::Written,
                    ..
                } => Some((root.clone(), name.clone())),
                ExportUnit::Manifest {
                    root,
                    status: UnitStatus::Drift | UnitStatus::Written,
                } => Some((root.clone(), "marketplace.json".to_owned())),
                _ => None,
            })
            .collect()
    }

    fn stale_set(report: &ExportReport) -> BTreeSet<(String, String, StaleKind)> {
        report
            .units
            .iter()
            .filter_map(|unit| match unit {
                ExportUnit::Stale { root, path, kind } => Some((root.clone(), path.clone(), *kind)),
                _ => None,
            })
            .collect()
    }

    fn plugin_status(report: &ExportReport, root: &str, name: &str) -> UnitStatus {
        report
            .units
            .iter()
            .find_map(|unit| match unit {
                ExportUnit::Plugin {
                    root: r,
                    name: n,
                    status,
                    ..
                } if r == root && n == name => Some(*status),
                _ => None,
            })
            .unwrap_or_else(|| panic!("no plugin unit for {root}/{name}: {report:?}"))
    }

    fn plugin_version_bump(
        report: &ExportReport,
        root: &str,
        name: &str,
    ) -> Option<VersionBumpSuggestion> {
        report
            .units
            .iter()
            .find_map(|unit| match unit {
                ExportUnit::Plugin {
                    root: r,
                    name: n,
                    version_bump_suggestion,
                    ..
                } if r == root && n == name => Some(version_bump_suggestion.clone()),
                _ => None,
            })
            .unwrap_or_else(|| panic!("no plugin unit for {root}/{name}: {report:?}"))
    }

    // A build swaps whole roots and sweeps what the vault no longer produces,
    // so a note it could not read would look exactly like a note that was
    // deleted. It refuses instead, and `check` refuses with it — one path,
    // one verdict.
    #[test]
    fn a_note_the_scan_could_not_read_stops_the_build_and_the_check() {
        let vfs = example_vault();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/draft.md",
            "---\nname: Not A Legal Name\ndescription: A draft.\n---\n\nHalf written.\n",
        );

        for mode in [ExportMode::Build, ExportMode::Check] {
            let err = export_skills(&vfs, &request(mode), &ap()).unwrap_err();
            let message = err.to_string();
            assert!(message.contains("unreadable-note"), "{message}");
            assert!(message.contains("skills/draft.md"), "{message}");
        }
        // The refusal lands before anything is staged.
        assert!(paths_under(&vfs, Path::new("/market")).is_empty());
    }

    // The opt-in is `description` alone, so a stray carrying one reaches the
    // build's refusal the same way a malformed entry note does. A resource
    // declares neither key and is still silent, which is what keeps the build
    // buildable at all.
    #[test]
    fn a_stray_declaring_only_a_description_stops_the_build_and_a_resource_does_not() {
        let vfs = example_vault();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/notes/stray.md",
            "---\ndescription: half a draft\n---\n\nHalf written.\n",
        );

        let err = export_skills(&vfs, &request(ExportMode::Build), &ap()).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("unreadable-note"), "{message}");
        assert!(message.contains("skills/notes/stray.md"), "{message}");
        assert!(paths_under(&vfs, Path::new("/market")).is_empty());

        let vfs = example_vault();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/notes/prose.md",
            "Just prose.\n",
        );
        build(&vfs);
    }

    #[test]
    fn build_produces_the_standalone_trees_and_nothing_else() {
        let vfs = example_vault();
        let report = build(&vfs);

        assert_eq!(report.checked, 3);
        assert!(report.changed);
        // The whole output, byte-listed: one tree per harness, each with its
        // own manifest dialect and, where the harness has one, its own
        // marketplace manifest; the narrowed skill in claude's alone — and no
        // shared tree, no root-level manifests, no stage residue.
        assert_eq!(
            paths_under(&vfs, Path::new("/market")),
            vec![
                ".agents/packs/git-tools/.codex-plugin/plugin.json",
                ".agents/packs/git-tools/skills/commit-helper/SKILL.md",
                ".agents/packs/tools/.codex-plugin/plugin.json",
                ".agents/packs/tools/skills/review-guide/SKILL.md",
                ".agents/plugins/marketplace.json",
                ".claude-plugin/marketplace.json",
                ".claude-plugin/packs/git-tools/.claude-plugin/plugin.json",
                ".claude-plugin/packs/git-tools/skills/commit-helper/SKILL.md",
                ".claude-plugin/packs/git-tools/skills/rebase-guide/SKILL.md",
                ".claude-plugin/packs/tools/.claude-plugin/plugin.json",
                ".claude-plugin/packs/tools/skills/review-guide/SKILL.md",
                ".cursor-plugin/marketplace.json",
                ".cursor-plugin/packs/git-tools/.cursor-plugin/plugin.json",
                ".cursor-plugin/packs/git-tools/skills/commit-helper/SKILL.md",
                ".cursor-plugin/packs/tools/.cursor-plugin/plugin.json",
                ".cursor-plugin/packs/tools/skills/review-guide/SKILL.md",
                ".pi/packs/git-tools/package.json",
                ".pi/packs/git-tools/skills/git-tools-commit-helper/SKILL.md",
                ".pi/packs/tools/package.json",
                ".pi/packs/tools/skills/tools-review-guide/SKILL.md",
            ]
        );
        // The per-root member counts say the narrowing happened where the
        // listing says it did.
        let git_claude = report.units.iter().any(|u| {
            matches!(u, ExportUnit::Plugin { root, name, skills, .. }
                if root == "claude" && name == "git-tools" && *skills == 2)
        });
        let git_codex = report.units.iter().any(|u| {
            matches!(u, ExportUnit::Plugin { root, name, skills, .. }
                if root == "codex" && name == "git-tools" && *skills == 1)
        });
        assert!(git_claude && git_codex, "{report:?}");
    }

    #[test]
    fn a_plugin_asset_lands_verbatim_and_only_its_own_skills_get_the_shim() {
        let vfs = example_vault();
        write_review_guide_calling_cli(&vfs);
        write(&vfs, "/host/cli/sdlc", "#!/bin/sh\nexec launcher \"$@\"\n");
        vfs.set_executable(Path::new("/host/cli/sdlc"), true)
            .unwrap();

        let mut request = request(ExportMode::Build);
        // No `plugin:` — falls back to the request's `default_plugin`
        // (`"tools"`, see `config()`).
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: DEFAULT_SHIM_TARGET.to_owned(),
            plugin: None,
        }];
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert!(report.changed);

        let asset_at = Path::new("/market/.claude-plugin/packs/tools/cli/sdlc");
        assert_eq!(
            vfs.read_file(asset_at).unwrap(),
            b"#!/bin/sh\nexec launcher \"$@\"\n"
        );
        assert!(vfs.is_executable(asset_at));

        // `tools` owns the asset, and Codex/Cursor have no `${CLAUDE_PLUGIN_ROOT}`
        // substitution of their own, so review-guide's CLI call site was
        // rewritten and both get the shim...
        for shim_at in [
            "/market/.agents/packs/tools/skills/review-guide/scripts/sdlc",
            "/market/.cursor-plugin/packs/tools/skills/review-guide/scripts/sdlc",
        ] {
            let shim_at = Path::new(shim_at);
            assert!(vfs.exists(shim_at), "{shim_at:?}");
            assert!(vfs.is_executable(shim_at));
        }

        // ...but Claude substitutes `${CLAUDE_PLUGIN_ROOT}` itself, so its
        // copy of the very same skill needs no shim at all, even though it
        // owns the very same asset.
        assert!(!vfs.exists(Path::new(
            "/market/.claude-plugin/packs/tools/skills/review-guide/scripts/sdlc"
        )));

        // ...and `git-tools`, which declares no asset, gets none at all on
        // any harness: the shim's whole job is finding an asset this plugin
        // never ships.
        assert!(!vfs.exists(Path::new(
            "/market/.agents/packs/git-tools/skills/commit-helper/scripts/sdlc"
        )));
        assert!(!vfs.exists(Path::new(".claude-plugin/packs/git-tools/cli/sdlc")));
    }

    #[test]
    fn a_configured_shim_target_replaces_the_cli_sdlc_default() {
        let vfs = example_vault();
        write_review_guide_calling(&vfs, "bin/launcher");
        write(
            &vfs,
            "/host/bin/launcher",
            "#!/bin/sh\nexec launcher \"$@\"\n",
        );
        vfs.set_executable(Path::new("/host/bin/launcher"), true)
            .unwrap();

        let mut request = request(ExportMode::Build);
        request.config = MarketplaceConfig {
            shim_target: "bin/launcher".to_owned(),
            ..config()
        };
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/bin/launcher"),
            dest: "bin/launcher".to_owned(),
            plugin: None,
        }];
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert!(report.changed);

        let asset_at = Path::new("/market/.claude-plugin/packs/tools/bin/launcher");
        assert!(vfs.exists(asset_at));

        // The shim still ships, on a root that needs one at all (Codex here)
        // — an asset lands at the *configured* target — but its parent-walk
        // now looks for that target, not `cli/sdlc`.
        let shim_at = Path::new("/market/.agents/packs/tools/skills/review-guide/scripts/sdlc");
        let shim = String::from_utf8(vfs.read_file(shim_at).unwrap()).unwrap();
        assert!(shim.contains("$dir/bin/launcher"), "{shim}");
        assert!(!shim.contains("cli/sdlc"), "{shim}");
    }

    #[test]
    fn an_asset_at_the_old_default_path_gets_no_shim_once_the_target_moves() {
        let vfs = example_vault();
        write_review_guide_calling_cli(&vfs);
        write(&vfs, "/host/cli/sdlc", "#!/bin/sh\nexec launcher \"$@\"\n");
        vfs.set_executable(Path::new("/host/cli/sdlc"), true)
            .unwrap();

        let mut request = request(ExportMode::Build);
        request.config = MarketplaceConfig {
            shim_target: "bin/launcher".to_owned(),
            ..config()
        };
        // The asset still lands at the old default path, but the configured
        // shim target has moved elsewhere. The check that decides whether to
        // emit a shim compares against the *configured* value, not a
        // hardcoded `cli/sdlc` literal, so no shim ships looking for it —
        // checked on Codex, the harness that would otherwise need one.
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: "cli/sdlc".to_owned(),
            plugin: None,
        }];
        export_skills(&vfs, &request, &ap()).unwrap();

        assert!(!vfs.exists(Path::new(
            "/market/.agents/packs/tools/skills/review-guide/scripts/sdlc"
        )));
    }

    #[test]
    fn a_skill_whose_body_never_calls_the_cli_gets_no_shim_even_where_the_plugin_ships_one() {
        let vfs = example_vault();
        // review-guide keeps `example_vault()`'s plain fixture body here (no
        // `write_review_guide_calling_cli`) — it never mentions the CLI at
        // all, unlike the other shim tests.
        write(&vfs, "/host/cli/sdlc", "#!/bin/sh\nexec launcher \"$@\"\n");
        vfs.set_executable(Path::new("/host/cli/sdlc"), true)
            .unwrap();

        let mut request = request(ExportMode::Build);
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: DEFAULT_SHIM_TARGET.to_owned(),
            plugin: None,
        }];
        export_skills(&vfs, &request, &ap()).unwrap();

        // Codex has no `${CLAUDE_PLUGIN_ROOT}` substitution and would
        // otherwise need the shim, but review-guide's body never called the
        // CLI in the first place — nothing was rewritten, so nothing needs
        // the shim to serve it. Distinct from the sibling test above, which
        // covers "the plugin ships no asset at all"; this covers "the plugin
        // ships one, but this skill never calls it."
        assert!(!vfs.exists(Path::new(
            "/market/.agents/packs/tools/skills/review-guide/scripts/sdlc"
        )));
    }

    #[test]
    fn codex_and_cursor_rewrite_the_cli_call_site_while_claude_keeps_the_token() {
        let vfs = example_vault();
        write_review_guide_calling_cli(&vfs);
        write(&vfs, "/host/cli/sdlc", "#!/bin/sh\nexec launcher \"$@\"\n");
        vfs.set_executable(Path::new("/host/cli/sdlc"), true)
            .unwrap();

        let mut request = request(ExportMode::Build);
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: DEFAULT_SHIM_TARGET.to_owned(),
            plugin: None,
        }];
        export_skills(&vfs, &request, &ap()).unwrap();

        // Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}` itself at load
        // time, so its rendered body keeps the vault's own text unchanged.
        let claude = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/skills/review-guide/SKILL.md",
        );
        assert!(
            claude.contains("${CLAUDE_PLUGIN_ROOT}/cli/sdlc entities validate"),
            "{claude}"
        );
        assert!(!claude.contains("scripts/sdlc"), "{claude}");

        // Neither Codex nor Cursor substitutes that token, so both get the
        // call site rewritten to the skill-relative shim instead.
        for tree in [".agents", ".cursor-plugin"] {
            let body = text_at(
                &vfs,
                &format!("/market/{tree}/packs/tools/skills/review-guide/SKILL.md"),
            );
            assert!(
                body.contains("scripts/sdlc entities validate"),
                "{tree}: {body}"
            );
            assert!(!body.contains("CLAUDE_PLUGIN_ROOT"), "{tree}: {body}");
        }
    }

    // --- Skill calls ---------------------------------------------------------

    const CALLS_SKILL_A: &str = "/vault/marketplaces/house/plugins/tools/skills/a.md";

    /// Plugin `tools` holds skills `a` and `b`, plugin `other` holds `c`, and
    /// `notes/plain.md` is a note that is not a skill. `a`'s body is the
    /// caller's.
    fn calls_vault(a_body: &str) -> MemVfs {
        let vfs = MemVfs::new();
        write(&vfs, CALLS_SKILL_A, &note_with_body("a", None, &[], a_body));
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/b.md",
            &note_with_body("b", None, &[], "# b\n\n## Steps\n\nB's own prose.\n"),
        );
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/other/skills/c.md",
            &note("c", None, &[]),
        );
        write(&vfs, "/vault/notes/plain.md", "# plain\n");
        vfs
    }

    fn skill_md(vfs: &dyn Vfs, tree: &str, skill: &str) -> String {
        text_at(
            vfs,
            &format!("/market/{tree}/packs/tools/skills/{skill}/SKILL.md"),
        )
    }

    fn export_refusal(vfs: &dyn Vfs) -> String {
        export_skills(vfs, &request(ExportMode::Build), &ap())
            .unwrap_err()
            .to_string()
    }

    #[test]
    fn a_call_renders_each_harness_spelling_and_copies_nothing() {
        let vfs = calls_vault(
            "# a\n\nNext, run /[[b]] to finish.\n\nUsage: `/[[b|the b skill]] ISSUE-1 --flag`\n\n\
             ```sh\n/[[b#Steps]] now\n```\n\nSee also [[b]].\n\nThen /[[c]].\n",
        );
        let report = build(&vfs);

        for (tree, b, c) in [
            (".claude-plugin", "/tools:b", "/other:c"),
            (".agents", "$tools:b", "$other:c"),
            (".cursor-plugin", "/b", "/c"),
        ] {
            let body = skill_md(&vfs, tree, "a");
            assert!(
                body.contains(&format!("Next, run `{b}` to finish.")),
                "{tree}: {body}"
            );
            assert!(
                body.contains(&format!("Usage: `{b} ISSUE-1 --flag`")),
                "{tree}: {body}"
            );
            assert!(
                body.contains(&format!("```sh\n{b} now\n```")),
                "{tree}: {body}"
            );
            assert!(body.contains(&format!("See also `{b}`.")), "{tree}: {body}");
            assert!(body.contains(&format!("Then `{c}`.")), "{tree}: {body}");
            assert!(!body.contains("B's own prose"), "{tree}: {body}");
            let copied: Vec<String> = paths_under(
                &vfs,
                Path::new(&format!("/market/{tree}/packs/tools/skills/a")),
            );
            assert_eq!(copied, vec!["SKILL.md".to_owned()], "{tree}");
        }

        let implicit: Vec<&DiscoveryWarning> = report
            .warnings
            .iter()
            .filter(|w| w.reason == "implicit-skill-call")
            .collect();
        assert_eq!(implicit.len(), 1, "{:?}", report.warnings);
        assert_eq!(
            implicit[0].path,
            "marketplaces/house/plugins/tools/skills/a.md"
        );
        assert!(
            implicit[0].detail.contains("/[[b]]"),
            "{}",
            implicit[0].detail
        );
    }

    #[test]
    fn a_call_naming_nothing_or_a_non_skill_is_refused() {
        let vfs = calls_vault("# a\n\nRun /[[nope]].\n");
        let err = export_refusal(&vfs);
        assert!(err.contains("skill-call-unresolved"), "{err}");

        let vfs = calls_vault("# a\n\nRun /[[plain]].\n");
        let err = export_refusal(&vfs);
        assert!(err.contains("skill-call-not-skill"), "{err}");
    }

    #[test]
    fn a_call_fragment_is_checked_then_dropped() {
        let vfs = calls_vault("# a\n\nRun /[[b#Missing]].\n");
        let err = export_refusal(&vfs);
        assert!(err.contains("fragment-unresolved"), "{err}");

        let vfs = calls_vault("# a\n\nRun /[[b#Steps]].\n");
        build(&vfs);
        let body = skill_md(&vfs, ".claude-plugin", "a");
        assert!(body.contains("Run `/tools:b`."), "{body}");
    }

    #[test]
    fn an_escaped_sigil_shows_the_notation() {
        let vfs = calls_vault(
            "# a\n\nWrite \\/[[plain]] in prose and `\\/[[b]]` in code.\n\nCite \\/[[b]] too.\n",
        );
        let report = build(&vfs);
        let body = skill_md(&vfs, ".claude-plugin", "a");
        // In prose and code alike the notation is written out, and nothing is
        // copied, even when it names a skill.
        assert!(body.contains("Write /[[plain]] in prose"), "{body}");
        assert!(body.contains("and `/[[b]]` in code."), "{body}");
        assert!(body.contains("Cite /[[b]] too."), "{body}");
        assert!(!body.contains("/tools:b"), "{body}");
        let copied = "/market/.claude-plugin/packs/tools/skills/a/references/vault";
        for note in [
            "notes/plain.md",
            "marketplaces/house/plugins/tools/skills/b.md",
        ] {
            assert!(
                !vfs.exists(Path::new(&format!("{copied}/{note}"))),
                "{note}"
            );
        }
        assert!(
            !report
                .warnings
                .iter()
                .any(|w| w.reason == "implicit-skill-call"),
            "{:?}",
            report.warnings
        );
    }

    #[test]
    fn a_call_to_a_skill_a_root_narrows_away_is_refused() {
        let vfs = calls_vault("# a\n\nRun /[[b]].\n");
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/b.md",
            &note_with_body("b", None, &["claude-code"], "# b\n"),
        );
        let err = export_refusal(&vfs);
        assert!(err.contains("skill-call-not-shipped"), "{err}");
        assert!(err.contains("tools:b"), "{err}");
        assert!(err.contains("skills/a.md"), "{err}");
    }

    #[test]
    fn a_literal_call_to_a_known_skill_is_refused() {
        let vfs = calls_vault("# a\n\nRun `$other:c` now.\n");
        let err = export_refusal(&vfs);
        assert!(err.contains("literal-skill-call"), "{err}");
        assert!(err.contains("`$other:c`"), "{err}");

        let vfs = calls_vault("# a\n\nRun `/tools:b` now.\n");
        assert!(export_refusal(&vfs).contains("`/tools:b`"));

        // Cursor's bare form, for a skill in a's own plugin.
        let vfs = calls_vault("# a\n\nRun /b now.\n");
        assert!(export_refusal(&vfs).contains("`/b`"));

        // A plugin or skill this vault does not hold is left alone: it may be
        // another vault's. So is a bare name from another plugin, and a path.
        let vfs = calls_vault(
            "# a\n\nRun `/tools:nope`, `/sdlc:task-work`, /c, or see src/b and /b/x.\n",
        );
        build(&vfs);
    }

    #[test]
    fn a_prefixed_name_is_the_directory_and_the_call() {
        assert_eq!(
            published_skill_name(SkillNaming::PluginPrefixed, "tools", "b").unwrap(),
            "tools-b"
        );
        assert_eq!(
            rendered_skill_call(RuntimeId::Pi, SkillNaming::PluginPrefixed, "tools", "b").unwrap(),
            "/skill:tools-b"
        );
        for naming in [SkillNaming::HostNamespaced, SkillNaming::Bare] {
            assert_eq!(published_skill_name(naming, "tools", "b").unwrap(), "b");
        }
        assert_eq!(
            rendered_skill_call(
                RuntimeId::ClaudeCode,
                SkillNaming::HostNamespaced,
                "tools",
                "b"
            )
            .unwrap(),
            "/tools:b"
        );
        assert_eq!(
            rendered_skill_call(RuntimeId::Cursor, SkillNaming::Bare, "tools", "b").unwrap(),
            "/b"
        );

        // 33 + 1 + 31 = 65 characters: refused, never truncated.
        let plugin = "p".repeat(33);
        let skill = "s".repeat(31);
        let err = published_skill_name(SkillNaming::PluginPrefixed, &plugin, &skill).unwrap_err();
        assert!(err.to_string().contains("published-name-invalid"), "{err}");
        let err = rendered_skill_call(RuntimeId::Pi, SkillNaming::PluginPrefixed, &plugin, &skill)
            .unwrap_err();
        assert!(err.to_string().contains("published-name-invalid"), "{err}");
    }

    #[test]
    fn the_pi_root_writes_a_package_per_plugin_with_prefixed_names() {
        let vfs = calls_vault(
            "# a\n\nRun /[[b]], then `${CLAUDE_PLUGIN_ROOT}/cli/sdlc go`.\n\n\
             Read `${CLAUDE_PLUGIN_ROOT}/skills/b/ref.md` and `${CLAUDE_PLUGIN_ROOT}/skills/c/x`.\n",
        );
        write(&vfs, "/host/cli/sdlc", "#!/bin/sh\n");
        let mut request = request(ExportMode::Build);
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: DEFAULT_SHIM_TARGET.to_owned(),
            plugin: Some("tools".to_owned()),
        }];
        let report = export_skills(&vfs, &request, &ap()).unwrap();

        assert_eq!(
            paths_under(&vfs, Path::new("/market/.pi")),
            vec![
                "packs/other/package.json",
                "packs/other/skills/other-c/SKILL.md",
                "packs/tools/cli/sdlc",
                "packs/tools/package.json",
                "packs/tools/skills/tools-a/SKILL.md",
                "packs/tools/skills/tools-a/scripts/sdlc",
                "packs/tools/skills/tools-b/SKILL.md",
            ]
        );
        assert_eq!(
            text_at(&vfs, "/market/.pi/packs/tools/package.json"),
            "{\n  \"name\": \"tools\",\n  \"version\": \"0.1.0\",\n  \"description\": \
             \"Skills: a, b.\",\n  \"license\": \"UNLICENSED\",\n  \"pi\": {\n    \
             \"skills\": [\n      \"./skills\"\n    ]\n  }\n}\n"
        );
        let b = text_at(&vfs, "/market/.pi/packs/tools/skills/tools-b/SKILL.md");
        assert!(b.contains("name: tools-b\n"), "{b}");
        let a = text_at(&vfs, "/market/.pi/packs/tools/skills/tools-a/SKILL.md");
        assert!(
            a.contains("Run `/skill:tools-b`, then `scripts/sdlc go`."),
            "{a}"
        );
        // A sibling's path follows its rename; another plugin's skill does not.
        assert!(
            a.contains(
                "Read `${CLAUDE_PLUGIN_ROOT}/skills/tools-b/ref.md` and \
                 `${CLAUDE_PLUGIN_ROOT}/skills/c/x`."
            ),
            "{a}"
        );
        let claude = text_at(&vfs, "/market/.claude-plugin/packs/tools/skills/a/SKILL.md");
        assert!(
            claude.contains("${CLAUDE_PLUGIN_ROOT}/skills/b/ref.md"),
            "{claude}"
        );
        assert!(vfs.is_executable(Path::new(
            "/market/.pi/packs/tools/skills/tools-a/scripts/sdlc"
        )));
        // No marketplace index, so no manifest unit either.
        assert!(!report.units.iter().any(|u| matches!(
            u,
            ExportUnit::Manifest { root, .. } if root == "pi"
        )));
        // A rebuild finds the tree its own, and unchanged.
        request.mode = ExportMode::Check;
        assert!(!export_skills(&vfs, &request, &ap()).unwrap().changed);
    }

    #[test]
    fn a_prefixed_name_over_the_limit_refuses_the_build() {
        let plugin = "p".repeat(33);
        let skill = "s".repeat(31);
        let vfs = MemVfs::new();
        let path = format!("/vault/marketplaces/house/plugins/{plugin}/skills/{skill}.md");
        write(&vfs, &path, &note(&skill, Some(&plugin), &[]));
        let err = export_refusal(&vfs);
        assert!(err.contains("published-name-invalid"), "{err}");
        assert!(paths_under(&vfs, Path::new("/market")).is_empty());

        // Narrowed away from Pi, the same skill builds.
        write(&vfs, &path, &note(&skill, Some(&plugin), &["claude"]));
        build(&vfs);
    }

    #[test]
    fn rewrite_sibling_paths_renames_only_whole_sibling_segments() {
        let siblings: BTreeSet<&str> = ["pr", "pr-check"].into_iter().collect();
        assert_eq!(
            rewrite_sibling_paths(
                "${CLAUDE_PLUGIN_ROOT}/skills/pr-check/a.sh ${CLAUDE_PLUGIN_ROOT}/skills/pr \
                 ${CLAUDE_PLUGIN_ROOT}/skills/prx/b plugins/sdlc/skills/pr/pr.md \
                 .claude/skills/pr/ ${CLAUDE_PLUGIN_ROOT}/skills/",
                "sdlc",
                &siblings,
            ),
            "${CLAUDE_PLUGIN_ROOT}/skills/sdlc-pr-check/a.sh ${CLAUDE_PLUGIN_ROOT}/skills/sdlc-pr \
             ${CLAUDE_PLUGIN_ROOT}/skills/prx/b plugins/sdlc/skills/pr/pr.md \
             .claude/skills/pr/ ${CLAUDE_PLUGIN_ROOT}/skills/"
        );
    }

    #[test]
    fn rewrite_cli_invocation_matches_only_the_exact_call_site() {
        // The plain case: one call site, rewritten, reported.
        let (out, rewrote) = rewrite_cli_invocation(
            "Run `${CLAUDE_PLUGIN_ROOT}/cli/sdlc task list`.",
            "cli/sdlc",
        );
        assert_eq!(out, "Run `scripts/sdlc task list`.");
        assert!(rewrote);

        // Every occurrence in the body, not just the first.
        let (out, rewrote) = rewrite_cli_invocation(
            "${CLAUDE_PLUGIN_ROOT}/cli/sdlc a; then ${CLAUDE_PLUGIN_ROOT}/cli/sdlc b",
            "cli/sdlc",
        );
        assert_eq!(out, "scripts/sdlc a; then scripts/sdlc b");
        assert!(rewrote);

        // A longer path sharing the same prefix is a different call site
        // entirely (the bundled entry the launcher itself execs) — must not
        // be truncated into a path this render never writes.
        let (out, rewrote) =
            rewrite_cli_invocation("See `${CLAUDE_PLUGIN_ROOT}/cli/sdlc.js`.", "cli/sdlc");
        assert_eq!(out, "See `${CLAUDE_PLUGIN_ROOT}/cli/sdlc.js`.");
        assert!(!rewrote);

        // A reference to something else under the same plugin root is
        // untouched.
        let (out, rewrote) = rewrite_cli_invocation(
            "See `${CLAUDE_PLUGIN_ROOT}/conventions/branch-naming.md`.",
            "cli/sdlc",
        );
        assert_eq!(
            out,
            "See `${CLAUDE_PLUGIN_ROOT}/conventions/branch-naming.md`."
        );
        assert!(!rewrote);

        // No call site at all.
        let (out, rewrote) = rewrite_cli_invocation("Nothing to see here.", "cli/sdlc");
        assert_eq!(out, "Nothing to see here.");
        assert!(!rewrote);
    }

    #[test]
    fn a_directory_asset_lands_as_a_tree_without_its_tests_or_fixtures() {
        let vfs = example_vault();
        write(&vfs, "/host/conventions/branch-naming.md", "# Branches\n");
        write(&vfs, "/host/conventions/nested/deep.md", "deep\n");
        write(&vfs, "/host/conventions/run.sh", "#!/bin/sh\n");
        vfs.set_executable(Path::new("/host/conventions/run.sh"), true)
            .unwrap();
        write(&vfs, "/host/conventions/tests/probe.test.ts", "test\n");
        write(&vfs, "/host/conventions/nested/deep.test.ts", "test\n");
        write(&vfs, "/host/conventions/nested/fixtures/f.md", "fixture\n");

        let mut request = request(ExportMode::Build);
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/conventions"),
            dest: "conventions".to_owned(),
            plugin: None,
        }];
        export_skills(&vfs, &request, &ap()).unwrap();

        let root = Path::new("/market/.claude-plugin/packs/tools/conventions");
        assert_eq!(
            vfs.read_file(&root.join("branch-naming.md")).unwrap(),
            b"# Branches\n"
        );
        assert_eq!(
            vfs.read_file(&root.join("nested/deep.md")).unwrap(),
            b"deep\n"
        );
        assert!(vfs.is_executable(&root.join("run.sh")));
        assert!(!vfs.exists(&root.join("tests")));
        assert!(!vfs.exists(&root.join("nested/fixtures")));
        assert!(!vfs.exists(&root.join("nested/deep.test.ts")));

        // A file added under the source directory is drift, same as an
        // edited single-file asset.
        let mut check_request = request.clone();
        check_request.mode = ExportMode::Check;
        assert!(!export_skills(&vfs, &check_request, &ap()).unwrap().changed);
        write(&vfs, "/host/conventions/new.md", "new\n");
        assert!(export_skills(&vfs, &check_request, &ap()).unwrap().changed);
    }

    #[test]
    fn an_asset_dest_escaping_the_plugin_root_via_dotdot_is_refused() {
        let vfs = example_vault();
        write(&vfs, "/host/cli/sdlc", "launcher\n");

        let mut request = request(ExportMode::Build);
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: "../../escaped".to_owned(),
            plugin: None,
        }];
        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unsafe-asset-dest"), "{err}");
        assert!(!vfs.exists(Path::new("/escaped")));
    }

    #[test]
    fn an_absolute_asset_dest_is_refused() {
        let vfs = example_vault();
        write(&vfs, "/host/cli/sdlc", "launcher\n");

        let mut request = request(ExportMode::Build);
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: "/etc/escaped".to_owned(),
            plugin: None,
        }];
        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unsafe-asset-dest"), "{err}");
        assert!(!vfs.exists(Path::new("/etc/escaped")));
    }

    #[test]
    fn an_asset_at_a_pack_manifest_path_is_refused() {
        let vfs = example_vault();
        write(&vfs, "/host/package.json", "{}\n");
        write(&vfs, "/host/tree/package.json", "{}\n");
        for (source, dest) in [
            ("/host/package.json", "package.json"),
            ("/host/package.json", "./package.json"),
            ("/host/tree", "."),
        ] {
            let mut request = request(ExportMode::Build);
            request.assets = vec![AssetSpec {
                source: PathBuf::from(source),
                dest: dest.to_owned(),
                plugin: None,
            }];
            let err = export_skills(&vfs, &request, &ap())
                .unwrap_err()
                .to_string();
            assert!(err.contains("asset-over-manifest"), "{dest}: {err}");
            assert!(err.contains("pi root"), "{dest}: {err}");
        }
        assert!(paths_under(&vfs, Path::new("/market")).is_empty());
    }

    #[test]
    fn an_asset_naming_a_plugin_the_vault_holds_nothing_for_is_refused() {
        let vfs = example_vault();
        write(&vfs, "/host/cli/sdlc", "launcher\n");

        let mut request = request(ExportMode::Build);
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: DEFAULT_SHIM_TARGET.to_owned(),
            plugin: Some("nonexistent".to_owned()),
        }];
        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unknown-asset-plugin"), "{err}");
        assert!(err.contains("nonexistent"), "{err}");
    }

    #[test]
    fn check_reports_drift_when_an_asset_changes_on_disk() {
        let vfs = example_vault();
        write(&vfs, "/host/cli/sdlc", "v1\n");
        let mut request = request(ExportMode::Build);
        request.assets = vec![AssetSpec {
            source: PathBuf::from("/host/cli/sdlc"),
            dest: DEFAULT_SHIM_TARGET.to_owned(),
            plugin: None,
        }];
        export_skills(&vfs, &request, &ap()).unwrap();

        // Unchanged: `check` agrees with what was just built.
        let mut check_request = request.clone();
        check_request.mode = ExportMode::Check;
        assert!(!export_skills(&vfs, &check_request, &ap()).unwrap().changed);

        // The source moves, out from under the build; `check` catches it the
        // same way it catches a rendered skill drifting.
        vfs.write_file(Path::new("/host/cli/sdlc"), b"v2\n")
            .unwrap();
        assert!(export_skills(&vfs, &check_request, &ap()).unwrap().changed);
    }

    #[test]
    fn a_plugin_narrowed_out_of_a_root_is_absent_from_it_entirely() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/plugins"))
            .unwrap();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/skills/rebase-guide.md",
            &note("rebase-guide", Some("git-tools"), &["claude"]),
        );
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/review-guide.md",
            &note("review-guide", None, &[]),
        );
        build(&vfs);

        // No directory, no plugin manifest, no marketplace listing.
        assert!(!vfs.exists(Path::new("/market/.agents/packs/git-tools")));
        let manifest = text_at(&vfs, "/market/.agents/plugins/marketplace.json");
        assert!(!manifest.contains("git-tools"), "{manifest}");
        // And in the root that admits it, all three are present.
        assert!(vfs.exists(Path::new(
            "/market/.claude-plugin/packs/git-tools/.claude-plugin/plugin.json"
        )));
        let manifest = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(manifest.contains("git-tools"), "{manifest}");
    }

    #[test]
    fn the_emitted_skill_md_is_compiled_stamped_and_stripped() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/plugins"))
            .unwrap();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/review-guide.md",
            "---\nname: review-guide\ndescription: Reviews things.\nap-kind: skill\n---\n\n\
             # Review Guide\n\n![[snippets/steps]]\n\nSee [[guides/style-guide]].\n",
        );
        write(&vfs, "/vault/snippets/steps.md", "Step prose to inline.\n");
        write(&vfs, "/vault/guides/style-guide.md", "# Style\n");
        build(&vfs);

        let text = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/skills/review-guide/SKILL.md",
        );
        assert!(text.contains("name: review-guide"), "{text}");
        assert!(text.contains("description: Reviews things."), "{text}");
        // The provenance marker, naming the vault-relative source.
        assert!(
            text.contains(
                "<!-- Generated by agent-pants from \
                 marketplaces/house/plugins/tools/skills/review-guide.md; do not edit. -->"
            ),
            "{text}"
        );
        // Compiled: the embed inlined, the link rewritten, nothing left to
        // resolve, and nothing of our namespace.
        assert!(text.contains("Step prose to inline."), "{text}");
        assert!(
            text.contains("(references/vault/guides/style-guide.md)"),
            "{text}"
        );
        assert!(!text.contains("[["), "{text}");
        assert!(!text.contains("ap-"), "{text}");
        // The linked file travelled as a resource, in the claude and codex roots.
        for packs in [".claude-plugin/packs", ".agents/packs"] {
            assert_eq!(
                vfs.read_file(
                    &Path::new("/market")
                        .join(packs)
                        .join("tools/skills/review-guide/references/vault/guides/style-guide.md")
                )
                .unwrap(),
                b"# Style\n",
                "{packs}"
            );
        }
    }

    fn nameonly_vault() -> MemVfs {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/tools.md",
            "---\nname: tools\n---\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/quiet.md",
            "---\nname: quiet\n---\n\n# Quiet\n",
        );
        vfs
    }

    #[test]
    fn a_name_without_a_description_publishes_the_filler_and_warns() {
        let vfs = nameonly_vault();
        let report = build(&vfs);
        let warned: Vec<(&str, &str)> = report
            .warnings
            .iter()
            .map(|w| (w.path.as_str(), w.reason.as_str()))
            .collect();
        assert_eq!(
            warned,
            [
                (
                    "marketplaces/house/plugins/tools/skills/quiet.md",
                    "missing-description"
                ),
                (
                    "marketplaces/house/plugins/tools/tools.md",
                    "missing-description"
                ),
                (
                    "marketplaces/house/plugins/tools/tools.md",
                    "missing-version"
                ),
            ]
        );
        let skill = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/skills/quiet/SKILL.md",
        );
        assert!(
            skill.contains(&format!("description: {MISSING_DESCRIPTION}")),
            "{skill}"
        );
        let manifest = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/.claude-plugin/plugin.json",
        );
        assert!(manifest.contains(MISSING_DESCRIPTION), "{manifest}");
    }

    /// A version from the note or from the config silences the warning, and
    /// the warning alone never trips `require_descriptions`.
    #[test]
    fn a_plugin_without_a_version_warns_until_one_is_stated() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/tools.md",
            "---\nname: tools\ndescription: Tools.\n---\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/said.md",
            "---\nname: said\ndescription: d\n---\n",
        );
        let mut request = request(ExportMode::Check);
        request.config.require_descriptions = true;
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        let reasons: Vec<&str> = report.warnings.iter().map(|w| w.reason.as_str()).collect();
        assert_eq!(reasons, ["missing-version"]);

        request.config.plugins.insert(
            "tools".to_owned(),
            PluginOverrides {
                version: Some("1.0.0".to_owned()),
                ..PluginOverrides::default()
            },
        );
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);

        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/tools.md",
            "---\nname: tools\ndescription: Tools.\nap-version: 2.0.0\n---\n",
        );
        request.config.plugins.clear();
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);
    }

    #[test]
    fn another_marketplaces_missing_description_neither_refuses_nor_warns() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/said.md",
            "---\nname: said\ndescription: d\n---\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/other/other.md",
            "---\nname: other\n---\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/other/plugins/kit/skills/quiet.md",
            "---\nname: quiet\n---\n",
        );
        let mut request = request(ExportMode::Build);
        request.marketplace = Some("house".to_owned());
        request.config.require_descriptions = true;
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);
    }

    #[test]
    fn require_descriptions_refuses_the_build_naming_each_note() {
        let vfs = nameonly_vault();
        let mut request = request(ExportMode::Build);
        request.config.require_descriptions = true;
        let message = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(message.contains("missing-description"), "{message}");
        assert!(message.contains("skills/quiet.md"), "{message}");
        assert!(message.contains("tools/tools.md"), "{message}");
        assert!(!vfs.exists(Path::new("/market")));
    }

    #[test]
    fn a_description_holding_a_colon_space_publishes_as_valid_yaml() {
        let vfs = MemVfs::new();
        let description = "Turn a review into a page: diagrams of the flows. Use when asked.";
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/flow.md",
            &format!("---\nname: flow\ndescription: \"{description}\"\n---\n\n# Flow\n"),
        );
        build(&vfs);
        let text = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/skills/flow/SKILL.md",
        );
        let frontmatter = text
            .strip_prefix("---\n")
            .and_then(|rest| rest.split_once("\n---\n"))
            .map(|(fm, _)| fm)
            .unwrap();
        let parsed: serde_yaml::Mapping = serde_yaml::from_str(frontmatter).unwrap();
        assert_eq!(
            parsed.get("description").and_then(|v| v.as_str()),
            Some(description)
        );
    }

    // `read_vault_skill` never fills `SkillContent::arguments` — `render_skill`
    // has to call `apply_arguments` itself, the same seam `publish` uses, or a
    // marketplace-published skill would carry no hint and no section at all.
    #[test]
    fn a_marketplace_skill_derives_its_hint_and_renders_the_section() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/plugins"))
            .unwrap();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/review-guide.md",
            "---\nname: review-guide\ndescription: Reviews things.\n\
             ap-arguments:\n  - name: pr-number\n    required: true\n    description: The PR.\n\
             ---\n\n# Review Guide\n",
        );
        build(&vfs);

        // Claude Code's dialect keeps `argument-hint`; Codex's dialect omits
        // every extension field — see
        // `agent_adapt::AGENT_SKILLS_EXTENSION_FIELDS` — so only the body
        // section, not the frontmatter hint, is common to both.
        let claude = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/skills/review-guide/SKILL.md",
        );
        assert!(
            claude.contains("argument-hint: \"<pr-number>\""),
            "{claude}"
        );
        assert!(claude.contains("arguments:\n  - pr-number"), "{claude}");
        assert!(claude.contains("$ARGUMENTS"), "{claude}");

        for tree in [".claude-plugin", ".agents"] {
            let text = text_at(
                &vfs,
                &format!("/market/{tree}/packs/tools/skills/review-guide/SKILL.md"),
            );
            assert!(text.contains("## Arguments"), "{tree}: {text}");
            assert!(
                text.contains("- `pr-number` (required): The PR."),
                "{tree}: {text}"
            );
        }

        let codex = text_at(
            &vfs,
            "/market/.agents/packs/tools/skills/review-guide/SKILL.md",
        );
        assert!(!codex.contains("argument-hint"), "{codex}");
        assert!(!codex.contains("arguments:"), "{codex}");
        assert!(!codex.contains("$ARGUMENTS"), "{codex}");
    }

    #[test]
    fn manifests_are_byte_deterministic() {
        let vfs = example_vault();
        build(&vfs);

        // Golden bytes: stable key order, plugins sorted by name, two-space
        // indentation, trailing newline.
        //
        // This vault's note names no owner, so the marketplace's own name
        // stands in. Claude marks `owner` required and rejects a bare string,
        // so an absent one is not an option — see `claude_marketplace_manifest`.
        assert_eq!(
            text_at(&vfs, "/market/.claude-plugin/marketplace.json"),
            r#"{
  "name": "demo-market",
  "owner": {
    "name": "demo-market"
  },
  "plugins": [
    {
      "name": "git-tools",
      "source": "./.claude-plugin/packs/git-tools",
      "description": "Skills: commit-helper, rebase-guide.",
      "version": "0.1.0"
    },
    {
      "name": "tools",
      "source": "./.claude-plugin/packs/tools",
      "description": "Skills: review-guide.",
      "version": "0.1.0"
    }
  ]
}
"#
        );
        assert_eq!(
            text_at(
                &vfs,
                "/market/.claude-plugin/packs/git-tools/.claude-plugin/plugin.json"
            ),
            r#"{
  "name": "git-tools",
  "version": "0.1.0",
  "description": "Skills: commit-helper, rebase-guide.",
  "license": "UNLICENSED",
  "keywords": [],
  "skills": "./skills/"
}
"#
        );
        // The codex output describes its *own* members: rebase-guide is
        // narrowed out of this root, so its manifest does not name it.
        assert_eq!(
            text_at(
                &vfs,
                "/market/.agents/packs/git-tools/.codex-plugin/plugin.json"
            ),
            r#"{
  "name": "git-tools",
  "version": "0.1.0",
  "description": "Skills: commit-helper.",
  "license": "UNLICENSED",
  "keywords": [],
  "skills": "./skills/",
  "interface": {
    "displayName": "git-tools",
    "category": "Productivity"
  }
}
"#
        );
        assert_eq!(
            text_at(&vfs, "/market/.agents/plugins/marketplace.json"),
            r#"{
  "name": "demo-market",
  "interface": {
    "displayName": "demo-market"
  },
  "plugins": [
    {
      "name": "git-tools",
      "source": {
        "source": "local",
        "path": "./.agents/packs/git-tools"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    },
    {
      "name": "tools",
      "source": {
        "source": "local",
        "path": "./.agents/packs/tools"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
"#
        );

        // And the whole output is byte-stable: a second vault, same content,
        // builds to identical bytes.
        let again = example_vault();
        build(&again);
        assert_eq!(
            files_under(&vfs, Path::new("/market")),
            files_under(&again, Path::new("/market"))
        );
    }

    #[test]
    fn config_overrides_and_the_author_fallback_reach_the_manifests() {
        let vfs = example_vault();
        let mut request = request(ExportMode::Build);
        request.config.owner = Some(json!({ "name": "Kelly" }));
        request.config.display_name = Some("Demo Market".to_owned());
        request.config.plugins.insert(
            "git-tools".to_owned(),
            PluginOverrides {
                version: Some("2.0.0".to_owned()),
                description: Some("Git helpers.".to_owned()),
                license: Some("MIT".to_owned()),
                keywords: Some(vec!["git".to_owned()]),
                category: Some("Development".to_owned()),
                display_name: Some("Git Tools".to_owned()),
                author: None,
            },
        );
        export_skills(&vfs, &request, &ap()).unwrap();

        let plugin = text_at(
            &vfs,
            "/market/.claude-plugin/packs/git-tools/.claude-plugin/plugin.json",
        );
        assert!(plugin.contains("\"version\": \"2.0.0\""), "{plugin}");
        assert!(
            plugin.contains("\"description\": \"Git helpers.\""),
            "{plugin}"
        );
        assert!(plugin.contains("\"license\": \"MIT\""), "{plugin}");
        assert!(plugin.contains("\"git\""), "{plugin}");
        // No author, no plugin-level author override — the owner steps in,
        // already an object and passed through.
        assert!(plugin.contains("\"author\": {"), "{plugin}");
        assert!(plugin.contains("\"name\": \"Kelly\""), "{plugin}");

        let codex = text_at(
            &vfs,
            "/market/.agents/packs/git-tools/.codex-plugin/plugin.json",
        );
        assert!(codex.contains("\"displayName\": \"Git Tools\""), "{codex}");
        assert!(codex.contains("\"category\": \"Development\""), "{codex}");

        let market = text_at(&vfs, "/market/.agents/plugins/marketplace.json");
        assert!(
            market.contains("\"displayName\": \"Demo Market\""),
            "{market}"
        );
        assert!(market.contains("\"category\": \"Development\""), "{market}");

        let market = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(market.contains("\"owner\""), "{market}");
        assert!(
            market.contains("\"description\": \"Git helpers.\""),
            "{market}"
        );
        assert!(market.contains("\"version\": \"2.0.0\""), "{market}");
    }

    #[test]
    fn an_up_to_date_destination_is_reported_unchanged_and_untouched() {
        let vfs = example_vault();
        build(&vfs);
        let before = files_under(&vfs, Path::new("/market"));

        let report = build(&vfs);

        assert!(!report.changed, "{report:?}");
        assert!(
            report.units.iter().all(|unit| matches!(
                unit,
                ExportUnit::Plugin {
                    status: UnitStatus::Unchanged,
                    ..
                } | ExportUnit::Manifest {
                    status: UnitStatus::Unchanged,
                    ..
                }
            )),
            "{report:?}"
        );
        // Not one byte, not one rename — no stage was even created.
        assert_eq!(files_under(&vfs, Path::new("/market")), before);
        assert!(!vfs.exists(Path::new("/market/.agent-pants-stage")));
        assert!(!vfs.exists(Path::new("/market/.agent-pants-stage")));
    }

    // --- Version bump suggestions -----------------------------------------

    /// One plugin with its own container note — carrying `ap-version`, which
    /// [`resolve_config`] folds into `MarketplaceConfig.plugins` — and one
    /// member skill.
    fn vault_with_versioned_plugin() -> MemVfs {
        let vfs = MemVfs::new();
        let base = "/vault/marketplaces/house/plugins/git-tools";
        write(
            &vfs,
            &format!("{base}/git-tools.md"),
            "---\nname: git-tools\ndescription: Git helpers.\nap-kind: plugin\nap-version: 2.1.0\n---\n\nThe pack.\n",
        );
        write(
            &vfs,
            &format!("{base}/skills/commit-helper.md"),
            "---\nname: commit-helper\ndescription: Writes commits.\n---\n\nCommit well.\n",
        );
        vfs
    }

    // The case the callout exists for: a member changed and nothing moved
    // `ap-version` to say so.
    #[test]
    fn a_changed_member_with_an_unmoved_version_suggests_a_bump() {
        let vfs = vault_with_versioned_plugin();
        build(&vfs);

        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md",
            "---\nname: commit-helper\ndescription: Writes better commits.\n---\n\nCommit well.\n",
        );

        let report = check(&vfs);
        assert_eq!(
            plugin_status(&report, "claude", "git-tools"),
            UnitStatus::Drift
        );
        assert_eq!(
            plugin_version_bump(&report, "claude", "git-tools"),
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
        let vfs = vault_with_versioned_plugin();
        build(&vfs);

        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md",
            "---\nname: commit-helper\ndescription: Writes better commits.\n---\n\nCommit well.\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/git-tools.md",
            "---\nname: git-tools\ndescription: Git helpers.\nap-kind: plugin\nap-version: 2.2.0\n---\n\nThe pack.\n",
        );

        let report = check(&vfs);
        assert_eq!(
            plugin_status(&report, "claude", "git-tools"),
            UnitStatus::Drift
        );
        assert_eq!(plugin_version_bump(&report, "claude", "git-tools"), None);
    }

    // Nothing changed, so the plugin is `ok` and there is nothing to suggest
    // either.
    #[test]
    fn an_unchanged_plugin_suggests_nothing() {
        let vfs = vault_with_versioned_plugin();
        build(&vfs);

        let report = check(&vfs);
        assert_eq!(
            plugin_status(&report, "claude", "git-tools"),
            UnitStatus::Ok
        );
        assert_eq!(plugin_version_bump(&report, "claude", "git-tools"), None);
    }

    // `example_vault`'s plugins have no container note at all, so there is
    // no `ap-version` anywhere to compare a bump against.
    #[test]
    fn a_plugin_with_no_container_note_never_suggests_a_bump() {
        let vfs = example_vault();
        build(&vfs);

        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md",
            "---\nname: commit-helper\ndescription: Use commit-helper, but better.\nap-plugin: git-tools\n---\n\n# commit-helper\n",
        );

        let report = check(&vfs);
        assert_eq!(
            plugin_status(&report, "claude", "git-tools"),
            UnitStatus::Drift
        );
        assert_eq!(plugin_version_bump(&report, "claude", "git-tools"), None);
    }

    #[test]
    fn check_writes_nothing_under_any_outcome() {
        // Outcome one: everything drifted (no destination at all).
        let vfs = example_vault();
        let report = check(&vfs);
        assert!(report.changed);
        assert!(
            !vfs.exists(Path::new("/market")),
            "check created the destination"
        );

        // Outcome two: clean.
        build(&vfs);
        let before = files_under(&vfs, Path::new("/market"));
        let report = check(&vfs);
        assert!(!report.changed, "{report:?}");
        assert_eq!(files_under(&vfs, Path::new("/market")), before);

        // Outcome three: drifted over an existing destination.
        vfs.write_file(
            Path::new("/market/.claude-plugin/packs/tools/skills/review-guide/SKILL.md"),
            b"tampered\n",
        )
        .unwrap();
        let before = files_under(&vfs, Path::new("/market"));
        let report = check(&vfs);
        assert!(report.changed);
        assert_eq!(files_under(&vfs, Path::new("/market")), before);
    }

    #[test]
    fn check_reports_ok_and_drift_per_plugin_per_root() {
        let vfs = example_vault();
        build(&vfs);
        // One plugin, one root: everything else must stay OK.
        vfs.write_file(
            Path::new("/market/.claude-plugin/packs/tools/skills/review-guide/SKILL.md"),
            b"tampered\n",
        )
        .unwrap();

        let report = check(&vfs);

        assert!(report.changed);
        assert_eq!(plugin_status(&report, "claude", "tools"), UnitStatus::Drift);
        assert_eq!(
            plugin_status(&report, "claude", "git-tools"),
            UnitStatus::Ok
        );
        assert_eq!(plugin_status(&report, "codex", "tools"), UnitStatus::Ok);
        assert_eq!(plugin_status(&report, "codex", "git-tools"), UnitStatus::Ok);
        assert!(
            report.units.iter().all(|u| !matches!(
                u,
                ExportUnit::Manifest {
                    status: UnitStatus::Drift,
                    ..
                }
            )),
            "{report:?}"
        );
    }

    #[test]
    fn stale_content_is_reported_by_check_and_swept_by_build() {
        let vfs = example_vault();
        build(&vfs);
        // A whole stale plugin, a stray root-level file, an empty directory.
        write(
            &vfs,
            "/market/.claude-plugin/packs/legacy/junk.md",
            "junk\n",
        );
        write(&vfs, "/market/.claude-plugin/README.md", "stray\n");
        vfs.create_dir_all(Path::new("/market/.agents/empty"))
            .unwrap();

        let report = check(&vfs);
        assert!(report.changed);
        assert_eq!(
            stale_set(&report),
            BTreeSet::from([
                (
                    "claude".to_owned(),
                    ".claude-plugin/README.md".to_owned(),
                    StaleKind::File,
                ),
                (
                    "claude".to_owned(),
                    ".claude-plugin/packs/legacy".to_owned(),
                    StaleKind::Plugin,
                ),
                (
                    "codex".to_owned(),
                    ".agents/empty".to_owned(),
                    StaleKind::EmptyDir
                ),
            ]),
            "one unit per stale thing — the stale plugin's files do not \
             double-report: {report:?}"
        );
        // The vault's own plugins are still OK; staleness is the only drift.
        assert_eq!(plugin_status(&report, "claude", "tools"), UnitStatus::Ok);

        let report = build(&vfs);
        assert!(report.changed);
        assert_eq!(stale_set(&report).len(), 3, "{report:?}");
        assert!(!vfs.exists(Path::new("/market/.claude-plugin/packs/legacy")));
        assert!(!vfs.exists(Path::new("/market/.claude-plugin/README.md")));
        assert!(!vfs.exists(Path::new("/market/.agents/empty")));
        assert!(!check(&vfs).changed);
    }

    #[test]
    fn check_build_check_verdicts_agree() {
        let vfs = example_vault();
        build(&vfs);
        // Three kinds of drift at once: tampered bytes in one root, a missing
        // plugin manifest in the other, and a stale plugin.
        vfs.write_file(
            Path::new("/market/.agents/packs/tools/skills/review-guide/SKILL.md"),
            b"tampered\n",
        )
        .unwrap();
        vfs.remove(Path::new(
            "/market/.claude-plugin/packs/git-tools/.claude-plugin/plugin.json",
        ))
        .unwrap();
        write(
            &vfs,
            "/market/.claude-plugin/packs/legacy/junk.md",
            "junk\n",
        );

        let verdict = check(&vfs);
        assert!(verdict.changed);

        let built = build(&vfs);
        assert!(built.changed);
        // What check called drift is exactly what build wrote, unit for unit,
        // and the stale sets are the same set.
        assert_eq!(differing(&verdict), differing(&built));
        assert_eq!(stale_set(&verdict), stale_set(&built));
        assert_eq!(
            differing(&verdict),
            BTreeSet::from([
                ("claude".to_owned(), "git-tools".to_owned()),
                ("codex".to_owned(), "tools".to_owned()),
            ])
        );

        // And after the build, the same check finds nothing.
        let after = check(&vfs);
        assert!(!after.changed, "{after:?}");
        assert!(differing(&after).is_empty());
        assert!(stale_set(&after).is_empty());
    }

    #[test]
    fn a_stale_execute_bit_is_drift_and_build_repairs_it() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/plugins"))
            .unwrap();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/tool-pack/tool-pack.md",
            &note("tool-pack", None, &[]),
        );
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/tool-pack/scripts/run.sh",
            "#!/bin/sh\n",
        );
        vfs.set_executable(
            Path::new("/vault/marketplaces/house/plugins/tools/skills/tool-pack/scripts/run.sh"),
            true,
        )
        .unwrap();
        build(&vfs);

        let published =
            Path::new("/market/.claude-plugin/packs/tools/skills/tool-pack/scripts/run.sh");
        assert!(vfs.is_executable(published), "the bit travelled");

        vfs.set_executable(published, false).unwrap();
        let report = check(&vfs);
        assert!(report.changed, "{report:?}");
        assert_eq!(plugin_status(&report, "claude", "tools"), UnitStatus::Drift);
        assert_eq!(plugin_status(&report, "codex", "tools"), UnitStatus::Ok);

        build(&vfs);
        assert!(vfs.is_executable(published), "the bit was repaired");
    }

    /// A wrapper that fails the next `remaining` renames onto one path — the
    /// injection a mid-swap failure test needs.
    struct FailingRename<'a> {
        inner: &'a MemVfs,
        to: PathBuf,
        remaining: Cell<u32>,
    }

    impl Vfs for FailingRename<'_> {
        fn read_file(&self, path: &Path) -> Result<Vec<u8>, CoreError> {
            self.inner.read_file(path)
        }
        fn read_dir(&self, path: &Path) -> Result<Vec<crate::vfs::DirEntry>, CoreError> {
            self.inner.read_dir(path)
        }
        fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
            self.inner.write_file(path, bytes)
        }
        fn create_dir_all(&self, path: &Path) -> Result<(), CoreError> {
            self.inner.create_dir_all(path)
        }
        fn exists(&self, path: &Path) -> bool {
            self.inner.exists(path)
        }
        fn is_executable(&self, path: &Path) -> bool {
            self.inner.is_executable(path)
        }
        fn set_executable(&self, path: &Path, yes: bool) -> Result<(), CoreError> {
            self.inner.set_executable(path, yes)
        }
        fn rename(&self, from: &Path, to: &Path) -> Result<(), CoreError> {
            if normalize(to) == self.to && self.remaining.get() > 0 {
                self.remaining.set(self.remaining.get() - 1);
                return Err(CoreError::io(to, std::io::Error::other("injected failure")));
            }
            self.inner.rename(from, to)
        }
        fn remove(&self, path: &Path) -> Result<(), CoreError> {
            self.inner.remove(path)
        }
    }

    #[test]
    fn a_failed_swap_rolls_back_every_root_already_swapped() {
        let vfs = example_vault();
        build(&vfs);
        // Drift every root, so the swap has several units and a later one can fail
        // after the first landed.
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md",
            "---\nname: commit-helper\ndescription: Use commit-helper.\nap-plugin: git-tools\n---\n\nRevised body.\n",
        );
        let before = files_under(&vfs, Path::new("/market"));

        // The swap unit is an entry, so the injected failure names one.
        let failing = FailingRename {
            inner: &vfs,
            to: PathBuf::from("/market/.agents"),
            remaining: Cell::new(1),
        };
        let err = export_skills(&failing, &request(ExportMode::Build), &ap()).unwrap_err();
        let message = err.to_string();

        assert!(matches!(err, CoreError::SwapFailed(_)), "{message}");
        assert!(message.contains("rolled back"), "{message}");
        // Claude had already swapped; the rollback put it back. Byte for
        // byte, bit for bit, the destination is as it was — and the stage is
        // gone.
        assert_eq!(files_under(&vfs, Path::new("/market")), before);
        assert!(!vfs.exists(Path::new("/market/.agent-pants-stage")));
        assert!(!vfs.exists(Path::new("/market/.agent-pants-stage")));

        // The failure was transient, not structural: the same build succeeds
        // once the filesystem cooperates.
        let report = build(&vfs);
        assert!(report.changed);
        assert!(!check(&vfs).changed);
    }

    #[test]
    fn a_failed_rollback_keeps_the_backup_and_names_it() {
        let vfs = example_vault();
        build(&vfs);
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/git-tools/skills/commit-helper.md",
            "---\nname: commit-helper\ndescription: Use commit-helper.\nap-plugin: git-tools\n---\n\nRevised body.\n",
        );

        // Two failures on the same path: the swap-in, then the restore.
        let failing = FailingRename {
            inner: &vfs,
            to: PathBuf::from("/market/.agents"),
            remaining: Cell::new(2),
        };
        let err = export_skills(&failing, &request(ExportMode::Build), &ap()).unwrap_err();
        let message = err.to_string();

        assert!(matches!(err, CoreError::SwapFailed(_)), "{message}");
        // The message names what could not be restored and where its bytes
        // survive; the stage is deliberately not deleted.
        assert!(message.contains(".agents"), "{message}");
        assert!(message.contains("backup survives"), "{message}");
        assert!(
            vfs.exists(Path::new(
                "/market/.agent-pants-stage/backup/.agents/packs/git-tools/.codex-plugin/plugin.json"
            )),
            "the old entry's bytes are still in the backup"
        );
        // The root that did swap was still rolled back.
        assert!(vfs.exists(Path::new("/market/.claude-plugin/marketplace.json")));
    }

    // --- the repository as its own marketplace ---------------------------

    /// A repository holding a vault, a `.git`, and a file of its own.
    fn repo_vault(vfs: &MemVfs) -> ExportRequest {
        write(
            vfs,
            "/repo/src/marketplaces/house/plugins/tools/skills/review-guide.md",
            &note("review-guide", None, &[]),
        );
        write(vfs, "/repo/README.md", "# A repository\n");
        write(vfs, "/repo/.git/HEAD", "ref: refs/heads/main\n");
        let mut request = request(ExportMode::Build);
        request.vault_root = PathBuf::from("/repo/src");
        request.out_root = PathBuf::from("/repo");
        request
    }

    #[test]
    fn a_host_that_cannot_see_links_refuses_an_ancestor_of_the_vault() {
        // A wasm host without link methods: a link under the out root could
        // route the swap into the vault, and this host cannot see it.
        let mem = MemVfs::new();
        let request = repo_vault(&mem);
        let vfs = crate::vfs::LinkBlindVfs(mem);
        let message = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(message.contains("unsafe-root"), "{message}");
        assert!(
            !vfs.exists(Path::new("/repo/.claude-plugin")),
            "nothing staged"
        );
    }

    /// A host that sees links, as a host with its own `Vfs` may: the
    /// repository root still builds, and a swapped tree linked into the vault
    /// is refused before anything is staged.
    #[cfg(unix)]
    #[test]
    fn a_host_that_sees_links_builds_at_the_repository_root_and_refuses_a_link_into_the_vault() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        let note_path = repo.join("src/marketplaces/house/plugins/tools/skills/review-guide.md");
        std::fs::create_dir_all(note_path.parent().unwrap()).unwrap();
        std::fs::write(&note_path, note("review-guide", None, &[])).unwrap();
        let mut request = request(ExportMode::Build);
        request.vault_root = repo.join("src");
        request.out_root = repo.clone();

        let vfs = crate::vfs::NativeVfs;
        assert!(export_skills(&vfs, &request, &ap()).unwrap().changed);
        assert!(repo.join(".claude-plugin/marketplace.json").exists());

        // The same layout, with one swapped tree a link into the vault.
        let linked = tmp.path().join("linked");
        let note_path = linked.join("src/marketplaces/house/plugins/tools/skills/review-guide.md");
        std::fs::create_dir_all(note_path.parent().unwrap()).unwrap();
        std::fs::write(&note_path, note("review-guide", None, &[])).unwrap();
        std::fs::create_dir_all(linked.join("src/skills")).unwrap();
        std::os::unix::fs::symlink(linked.join("src/skills"), linked.join(".claude-plugin"))
            .unwrap();
        request.vault_root = linked.join("src");
        request.out_root = linked.clone();
        let message = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(message.contains("unsafe-root"), "{message}");
        assert_eq!(
            std::fs::read_dir(linked.join("src/skills"))
                .unwrap()
                .count(),
            0,
            "nothing was written into the vault"
        );
    }

    #[test]
    fn the_repository_root_is_a_marketplace_directory_like_any_other() {
        // The whole point: every harness's manifest at the path its harness
        // reads, so a bare repository URL registers with all of them.
        let vfs = MemVfs::new();
        let report = export_skills(&vfs, &repo_vault(&vfs), &ap()).unwrap();
        assert!(report.changed);

        assert!(vfs.exists(Path::new("/repo/.claude-plugin/marketplace.json")));
        assert!(vfs.exists(Path::new("/repo/.agents/plugins/marketplace.json")));
        assert!(vfs.exists(Path::new(
            "/repo/.claude-plugin/packs/tools/skills/review-guide/SKILL.md"
        )));
        assert!(vfs.exists(Path::new(
            "/repo/.agents/packs/tools/skills/review-guide/SKILL.md"
        )));
    }

    #[test]
    fn a_build_at_a_repository_root_touches_nothing_it_did_not_render() {
        // A root owns one top-level entry per harness and nothing else, so
        // the swap can never name `.git`, the vault, or a file of the
        // repository's own — the render produces no path beginning with one.
        let vfs = MemVfs::new();
        export_skills(&vfs, &repo_vault(&vfs), &ap()).unwrap();

        assert_eq!(
            vfs.read_file(Path::new("/repo/README.md")).unwrap(),
            b"# A repository\n"
        );
        assert!(vfs.exists(Path::new("/repo/.git/HEAD")));
        assert!(vfs.exists(Path::new(
            "/repo/src/marketplaces/house/plugins/tools/skills/review-guide.md"
        )));
    }

    #[test]
    fn the_two_harnesses_never_collide_at_one_directory() {
        // Each renders the same skill, and they cannot share the file: the
        // two harnesses spell a skill's tool names differently. Separate
        // trees is what makes one directory possible at all.
        let vfs = MemVfs::new();
        export_skills(&vfs, &repo_vault(&vfs), &ap()).unwrap();
        let claude = "/repo/.claude-plugin/packs/tools/skills/review-guide/SKILL.md";
        let codex = "/repo/.agents/packs/tools/skills/review-guide/SKILL.md";
        assert_ne!(claude, codex);
        assert!(vfs.exists(Path::new(claude)) && vfs.exists(Path::new(codex)));
        // And each manifest points at its own tree.
        let manifest = text_at(&vfs, "/repo/.claude-plugin/marketplace.json");
        assert!(
            manifest.contains("./.claude-plugin/packs/tools"),
            "{manifest}"
        );
        let manifest = text_at(&vfs, "/repo/.agents/plugins/marketplace.json");
        assert!(manifest.contains("./.agents/packs/tools"), "{manifest}");
    }

    #[test]
    fn a_repository_marketplace_is_clean_on_the_check_that_follows() {
        let vfs = MemVfs::new();
        let request = repo_vault(&vfs);
        export_skills(&vfs, &request, &ap()).unwrap();

        let mut checking = request.clone();
        checking.mode = ExportMode::Check;
        let report = export_skills(&vfs, &checking, &ap()).unwrap();
        assert!(!report.changed, "{:?}", report.units);
        // The repository around it is not drift, and never reported.
        assert!(
            !report
                .units
                .iter()
                .any(|unit| matches!(unit, ExportUnit::Stale { .. })),
            "{:?}",
            report.units
        );
    }

    #[test]
    fn a_pack_removed_from_the_vault_disappears_from_every_tree() {
        let vfs = MemVfs::new();
        let request = repo_vault(&vfs);
        write(
            &vfs,
            "/repo/src/marketplaces/house/plugins/extra/skills/spare.md",
            &note("spare", Some("extra"), &[]),
        );
        export_skills(&vfs, &request, &ap()).unwrap();
        assert!(vfs.exists(Path::new("/repo/.claude-plugin/packs/extra")));

        vfs.remove(Path::new("/repo/src/marketplaces/house/plugins/extra"))
            .unwrap();
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert!(!vfs.exists(Path::new("/repo/.claude-plugin/packs/extra")));
        assert!(!vfs.exists(Path::new("/repo/.agents/packs/extra")));
        assert!(!vfs.exists(Path::new("/repo/.cursor-plugin/packs/extra")));
        assert!(!vfs.exists(Path::new("/repo/.pi/packs/extra")));
        // Once per harness, each naming its own path.
        let stale: Vec<&str> = report
            .units
            .iter()
            .filter_map(|unit| match unit {
                ExportUnit::Stale { path, .. } => Some(path.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(
            stale,
            vec![
                ".claude-plugin/packs/extra",
                ".agents/packs/extra",
                ".cursor-plugin/packs/extra",
                ".pi/packs/extra",
            ]
        );
    }

    #[test]
    fn a_harness_can_be_selected_and_the_others_are_not_rendered() {
        let vfs = MemVfs::new();
        let mut request = repo_vault(&vfs);
        request.harnesses.insert("claude".to_owned());

        export_skills(&vfs, &request, &ap()).unwrap();
        assert!(vfs.exists(Path::new("/repo/.claude-plugin/marketplace.json")));
        assert!(!vfs.exists(Path::new("/repo/.agents")));
    }

    #[test]
    fn a_harness_this_build_cannot_render_is_refused_by_name() {
        // Silently publishing less than was asked for is the failure this
        // crate exists to prevent.
        let vfs = MemVfs::new();
        let mut request = repo_vault(&vfs);
        request.harnesses.insert("windsurf".to_owned());

        let err = export_skills(&vfs, &request, &ap()).unwrap_err();
        let message = err.to_string();
        assert!(matches!(err, CoreError::Refused(_)), "{message}");
        assert!(message.contains("unknown-harness"), "{message}");
        assert!(message.contains("windsurf"), "{message}");
        assert!(!vfs.exists(Path::new("/repo/.claude-plugin")));
    }

    #[test]
    fn a_marketplace_directory_that_would_be_the_vault_is_refused() {
        let vfs = MemVfs::new();
        let mut request = repo_vault(&vfs);
        request.out_root = PathBuf::from("/repo/src");

        let err = export_skills(&vfs, &request, &ap()).unwrap_err();
        let message = err.to_string();
        assert!(matches!(err, CoreError::Refused(_)), "{message}");
        assert!(message.contains("unsafe-root"), "{message}");
    }

    #[test]
    fn a_marketplace_directory_containing_the_vault_is_allowed() {
        // The ancestor rule would refuse this, and it is the whole case: a
        // repository root contains its own vault and still publishes itself.
        let vfs = MemVfs::new();
        let report = export_skills(&vfs, &repo_vault(&vfs), &ap()).unwrap();
        assert!(report.changed);
    }

    /// Every row's `packs` must begin with its own `tree()`, or that
    /// component would sit outside the swap unit: never replaced, never
    /// swept, never reported stale, with `check` saying `ok` about it
    /// forever. The module header calls the ownership structural; this is
    /// what makes that true of the table rather than of a comment.
    #[test]
    fn every_root_keeps_its_packs_inside_the_tree_it_owns() {
        for spec in &ROOTS {
            assert!(
                spec.packs == spec.tree() || spec.packs.starts_with(&format!("{}/", spec.tree())),
                "{}: packs `{}` is outside its tree `{}`",
                spec.name,
                spec.packs,
                spec.tree()
            );
        }
    }

    #[test]
    fn a_tree_this_vault_did_not_build_is_refused() {
        let vfs = MemVfs::new();
        let request = repo_vault(&vfs);
        write(&vfs, "/repo/.claude-plugin/plugin.json", "{}\n");

        let err = export_skills(&vfs, &request, &ap()).unwrap_err();
        let message = err.to_string();
        assert!(matches!(err, CoreError::Refused(_)), "{message}");
        assert!(message.contains("foreign-tree"), "{message}");
        assert!(message.contains(".claude-plugin"), "{message}");
        // And it stopped before writing anything.
        assert_eq!(
            vfs.read_file(Path::new("/repo/.claude-plugin/plugin.json"))
                .unwrap(),
            b"{}\n"
        );
    }

    /// The case the fixture above does not reach, and the one that matters:
    /// a repository that already *is* a marketplace. Its manifest sits at the
    /// path this build renders one to, so every rendered-path test says
    /// "ours" and the swap takes the tree without a word. Provenance is what
    /// tells them apart.
    #[test]
    fn a_hand_written_marketplace_at_the_same_path_is_refused_not_replaced() {
        let vfs = MemVfs::new();
        let request = repo_vault(&vfs);
        let manifest = "{\n  \"name\": \"hand\",\n  \"plugins\": []\n}\n";
        write(&vfs, "/repo/.claude-plugin/marketplace.json", manifest);
        write(
            &vfs,
            "/repo/.claude-plugin/packs/hand/skills/by-hand/SKILL.md",
            "---\nname: by-hand\n---\n\nWritten by a person.\n",
        );

        let err = export_skills(&vfs, &request, &ap()).unwrap_err();
        let message = err.to_string();
        assert!(matches!(err, CoreError::Refused(_)), "{message}");
        assert!(message.contains("foreign-tree"), "{message}");
        // Not one byte of it moved.
        assert_eq!(
            vfs.read_file(Path::new("/repo/.claude-plugin/marketplace.json"))
                .unwrap(),
            manifest.as_bytes()
        );
        assert!(vfs.exists(Path::new(
            "/repo/.claude-plugin/packs/hand/skills/by-hand/SKILL.md"
        )));
    }

    /// The residue, pinned so it is a decision rather than a surprise. A
    /// tree holding only a `marketplace.json` — no marker to read — is
    /// claimed as ours on the strength of the path alone, because a
    /// commands-only plugin leaves exactly that tree for the harness whose
    /// plugin format carries no commands. A hand-written Claude marketplace
    /// laid out the documented way looks identical, and is replaced. See
    /// [`DestTree::built_here`].
    #[test]
    fn a_tree_holding_only_a_manifest_is_claimed_on_its_path_alone() {
        let vfs = MemVfs::new();
        let request = repo_vault(&vfs);
        write(
            &vfs,
            "/repo/.claude-plugin/marketplace.json",
            "{\n  \"name\": \"someone-elses\",\n  \"plugins\": []\n}\n",
        );

        // No refusal: the one file present is a path this render produces.
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert!(report.changed);
    }

    #[test]
    fn a_tree_that_built_here_before_is_not_mistaken_for_a_foreign_one() {
        // Every rebuild finds its tree occupied. What tells the two cases
        // apart is that a previous build's manifest is still there, at a path
        // this render names — even after every pack has been renamed.
        let vfs = MemVfs::new();
        let request = repo_vault(&vfs);
        export_skills(&vfs, &request, &ap()).unwrap();

        vfs.remove(Path::new("/repo/src/marketplaces/house/plugins/tools"))
            .unwrap();
        write(
            &vfs,
            "/repo/src/marketplaces/house/plugins/gear/skills/review-guide.md",
            &note("review-guide", None, &[]),
        );

        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert!(report.changed);
        assert!(vfs.exists(Path::new(
            "/repo/.claude-plugin/packs/gear/.claude-plugin/plugin.json"
        )));
        assert!(!vfs.exists(Path::new("/repo/.claude-plugin/packs/tools")));
    }

    #[test]
    fn the_rail_refuses_a_destination_overlapping_the_vault() {
        // Inside the vault and the vault itself — refused before discovery
        // reads a note. A directory that merely CONTAINS the vault is not
        // here: that is a repository publishing itself, and it is the case
        // the marketplace directory exists for.
        for out in ["/vault/market", "/vault"] {
            let vfs = example_vault();
            let mut request = request(ExportMode::Build);
            request.out_root = PathBuf::from(out);
            let err = export_skills(&vfs, &request, &ap()).unwrap_err();
            let message = err.to_string();

            assert!(matches!(err, CoreError::Refused(_)), "{out}: {message}");
            assert!(message.contains("unsafe-root"), "{out}: {message}");
            // Nothing was staged anywhere.
            assert!(!vfs.exists(Path::new("/vault/market")), "{out}");
            assert!(!vfs.exists(Path::new("/vault/.agent-pants-stage")), "{out}");
        }
    }

    /// Two marketplaces, each holding a `core` plugin holding a `review`:
    /// legal in the vault, and one output root cannot hold both.
    fn two_marketplaces() -> MemVfs {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/acme/plugins/core/skills/review.md",
            &note("review", Some("core"), &[]),
        );
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/skills/review.md",
            &note("review", Some("core"), &[]),
        );
        vfs
    }

    /// A vault that names its own marketplace and its own pack.
    fn vault_with_container_notes() -> MemVfs {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/demo-market/demo-market.md",
            "---\nname: demo-market\ndescription: The house marketplace.\n\
             ap-owner:\n  name: kelly/house\nap-author: house-team\n\
             ap-display-name: The House\n---\n\nProse.\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/demo-market/plugins/tools/tools.md",
            "---\nname: tools\ndescription: Everyday tools.\nap-kind: plugin\n\
             ap-version: 2.1.0\nap-license: MIT\nap-keywords:\n  - editing\n\
             ap-category: Writing\n---\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/demo-market/plugins/tools/skills/review.md",
            &note("review", None, &[]),
        );
        vfs
    }

    /// The whole point: a vault that says who owns it publishes that, and a
    /// build flag is not where a marketplace's identity lives.
    #[test]
    fn the_marketplace_note_supplies_the_identity_the_config_used_to() {
        let vfs = vault_with_container_notes();
        build(&vfs);

        let manifest = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(manifest.contains(r#""name": "demo-market""#), "{manifest}");
        assert!(manifest.contains(r#""name": "kelly/house""#), "{manifest}");

        // Codex takes the display name; Claude's dialect has no field for it.
        let codex = text_at(&vfs, "/market/.agents/plugins/marketplace.json");
        assert!(codex.contains("The House"), "{codex}");
    }

    /// The vault behind every license scenario: a marketplace note whose
    /// `ap-license` line is the variable, one plugin that says nothing about
    /// its license, and one that licenses itself differently.
    fn vault_with_licenses(market_license: Option<&str>) -> MemVfs {
        let vfs = MemVfs::new();
        let line = market_license
            .map(|spdx| format!("ap-license: {spdx}\n"))
            .unwrap_or_default();
        write(
            &vfs,
            "/vault/marketplaces/demo-market/demo-market.md",
            &format!(
                "---\nname: demo-market\ndescription: The house marketplace.\n\
                 {line}---\n"
            ),
        );
        write(
            &vfs,
            "/vault/marketplaces/demo-market/plugins/tools/skills/review.md",
            &note("review", Some("tools"), &[]),
        );
        write(
            &vfs,
            "/vault/marketplaces/demo-market/plugins/vendor/vendor.md",
            "---\nname: vendor\ndescription: Vendored work.\nap-kind: plugin\n\
             ap-license: Apache-2.0\n---\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/demo-market/plugins/vendor/skills/other.md",
            &note("other", Some("vendor"), &[]),
        );
        vfs
    }

    /// The license one pack manifest published.
    fn license_of(vfs: &dyn Vfs, plugin: &str) -> String {
        let manifest = text_at(
            vfs,
            &format!("/market/.claude-plugin/packs/{plugin}/.claude-plugin/plugin.json"),
        );
        serde_json::from_str::<serde_json::Value>(&manifest)
            .unwrap_or_else(|err| panic!("{plugin} manifest is not JSON: {err}\n{manifest}"))["license"]
            .as_str()
            .unwrap_or_else(|| panic!("{plugin} manifest carries no license\n{manifest}"))
            .to_owned()
    }

    /// The point of the rung: a distribution licensed as a whole says so once.
    /// Before it existed, a note that licensed itself still published
    /// `UNLICENSED` into every pack manifest it shipped.
    #[test]
    fn a_plugin_inherits_the_marketplace_note_license() {
        let vfs = vault_with_licenses(Some("MIT"));
        build(&vfs);
        assert_eq!(license_of(&vfs, "tools"), "MIT");
    }

    /// Inheritance is a default, not a policy: one plugin under a differently
    /// licensed marketplace is the case a vendored dependency makes.
    #[test]
    fn a_plugin_licensing_itself_overrides_its_marketplace() {
        let vfs = vault_with_licenses(Some("MIT"));
        build(&vfs);
        assert_eq!(license_of(&vfs, "vendor"), "Apache-2.0");
    }

    /// Nothing anywhere still means the documented default, so adding the rung
    /// did not quietly license an unlicensed distribution.
    #[test]
    fn a_silent_vault_and_a_silent_project_file_stay_unlicensed() {
        let vfs = vault_with_licenses(None);
        build(&vfs);
        assert_eq!(license_of(&vfs, "tools"), "UNLICENSED");
        // The plugin that licensed itself is unaffected by the marketplace's
        // silence — its own note was always the first rung.
        assert_eq!(license_of(&vfs, "vendor"), "Apache-2.0");
    }

    /// A vault with no marketplace note at all still has somewhere to say it.
    #[test]
    fn the_project_file_licenses_a_marketplace_no_note_licenses() {
        let vfs = vault_with_licenses(None);
        let config = MarketplaceConfig {
            license: Some("MIT".to_owned()),
            ..config()
        };
        build_with(&vfs, config);
        assert_eq!(license_of(&vfs, "tools"), "MIT");
    }

    /// The vault is the source of truth the project file falls back to, the
    /// same precedence `owner` and `author` already follow.
    #[test]
    fn the_marketplace_note_beats_the_project_file() {
        let vfs = vault_with_licenses(Some("MIT"));
        let config = MarketplaceConfig {
            license: Some("GPL-3.0-only".to_owned()),
            ..config()
        };
        build_with(&vfs, config);
        assert_eq!(license_of(&vfs, "tools"), "MIT");
    }

    /// The narrowest rung still wins: a per-plugin override is how a project
    /// file relicenses one pack without touching the vault.
    #[test]
    fn a_per_plugin_override_beats_the_marketplace_license() {
        let vfs = vault_with_licenses(Some("MIT"));
        let config = MarketplaceConfig {
            license: Some("MIT".to_owned()),
            plugins: [(
                "tools".to_owned(),
                PluginOverrides {
                    license: Some("BSD-3-Clause".to_owned()),
                    ..PluginOverrides::default()
                },
            )]
            .into_iter()
            .collect(),
            ..config()
        };
        build_with(&vfs, config);
        assert_eq!(license_of(&vfs, "tools"), "BSD-3-Clause");
    }

    /// The note's `description` reached the pack manifests and stopped there,
    /// so a marketplace that described itself published an index that did not
    /// — `claude plugin validate` warns about the absence.
    #[test]
    fn a_marketplace_note_describes_its_own_index() {
        let vfs = vault_with_container_notes();
        build(&vfs);

        // Claude takes a top-level `description`; its documentation prefers
        // that to `metadata.description`, which it keeps for compatibility.
        let claude = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(
            claude.contains(r#""description": "The house marketplace.""#),
            "{claude}"
        );

        // Cursor documents no top-level description — `metadata` is the
        // object holding it.
        let cursor = text_at(&vfs, "/market/.cursor-plugin/marketplace.json");
        assert!(
            cursor.contains(r#""metadata": {"#) && cursor.contains("The house marketplace."),
            "{cursor}"
        );

        // Codex documents no description field at all, so it gets none rather
        // than one written to a key invented for the occasion.
        let codex = text_at(&vfs, "/market/.agents/plugins/marketplace.json");
        assert!(!codex.contains("The house marketplace."), "{codex}");
    }

    /// `new marketplace --owner kelly` writes `ap-owner: kelly`, a bare
    /// string, and Claude rejects it outright — `owner: Invalid input`. The
    /// note's spelling is a convenience; the object is the manifest's shape.
    #[test]
    fn a_bare_owner_name_becomes_the_object_both_dialects_require() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/demo-market/demo-market.md",
            "---\nname: demo-market\ndescription: The house marketplace.\n\
             ap-owner: kelly\n---\n",
        );
        write(
            &vfs,
            "/vault/marketplaces/demo-market/plugins/tools/skills/review.md",
            &note("review", None, &[]),
        );
        build(&vfs);

        for tree in [
            ".claude-plugin/marketplace.json",
            ".cursor-plugin/marketplace.json",
        ] {
            let manifest = text_at(&vfs, &format!("/market/{tree}"));
            assert!(
                manifest.contains("\"owner\": {\n    \"name\": \"kelly\"\n  }"),
                "{tree}: {manifest}"
            );
        }
    }

    /// A plugin note describes its own pack, in the same `description` a skill
    /// note uses for itself — and the generated `Skills: …` list is the
    /// fallback for a pack with no note, not an override of one.
    #[test]
    fn the_plugin_note_supplies_its_manifest_rather_than_the_generated_default() {
        let vfs = vault_with_container_notes();
        build(&vfs);

        let manifest = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/.claude-plugin/plugin.json",
        );
        assert!(
            manifest.contains(r#""description": "Everyday tools.""#),
            "{manifest}"
        );
        assert!(!manifest.contains("Skills: review"), "{manifest}");
        assert!(manifest.contains(r#""version": "2.1.0""#), "{manifest}");
        assert!(manifest.contains(r#""license": "MIT""#), "{manifest}");
        assert!(manifest.contains("editing"), "{manifest}");
        // The author falls through the marketplace note, which is the only
        // place it was said — a bare string in the note, promoted to the
        // object Claude's schema requires.
        assert!(manifest.contains(r#""author": {"#), "{manifest}");
        assert!(manifest.contains(r#""name": "house-team""#), "{manifest}");

        let codex = text_at(
            &vfs,
            "/market/.agents/packs/tools/.codex-plugin/plugin.json",
        );
        assert!(codex.contains("Writing"), "{codex}");
    }

    /// An author already shaped as an object passes through untouched,
    /// `email` included — normalization only promotes a bare string.
    #[test]
    fn an_object_author_passes_through_with_its_email() {
        let vfs = example_vault();
        let mut request = request(ExportMode::Build);
        request.config.plugins.insert(
            "git-tools".to_owned(),
            PluginOverrides {
                author: Some(json!({ "name": "Ada", "email": "ada@example.com" })),
                ..Default::default()
            },
        );
        export_skills(&vfs, &request, &ap()).unwrap();

        let plugin = text_at(
            &vfs,
            "/market/.claude-plugin/packs/git-tools/.claude-plugin/plugin.json",
        );
        assert!(plugin.contains(r#""author": {"#), "{plugin}");
        assert!(plugin.contains(r#""name": "Ada""#), "{plugin}");
        assert!(plugin.contains(r#""email": "ada@example.com""#), "{plugin}");
    }

    /// Field by field, not block by block: a request naming one thing and a
    /// note naming another must produce a manifest carrying both.
    #[test]
    fn a_configured_field_survives_beside_one_the_note_supplies() {
        let vfs = vault_with_container_notes();
        let mut request = request(ExportMode::Build);
        request.config.plugins.insert(
            "tools".to_owned(),
            PluginOverrides {
                keywords: Some(vec!["configured".to_owned()]),
                ..PluginOverrides::default()
            },
        );
        export_skills(&vfs, &request, &ap()).unwrap();

        let manifest = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/.claude-plugin/plugin.json",
        );
        // The note spoke about keywords too, and outranks the request there.
        assert!(manifest.contains("editing"), "{manifest}");
        assert!(!manifest.contains("configured"), "{manifest}");
        // And the fields only the note gave are still there — the request's
        // block did not blank them.
        assert!(manifest.contains(r#""license": "MIT""#), "{manifest}");
    }

    /// Silence is not an assertion. A vault with no container notes is legal
    /// and the request is its whole identity.
    #[test]
    fn a_vault_with_no_container_notes_still_builds_from_the_request_alone() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/plugins/tools/skills/review.md",
            &note("review", None, &[]),
        );
        build(&vfs);

        let manifest = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(manifest.contains(r#""name": "demo-market""#), "{manifest}");
        let plugin = text_at(
            &vfs,
            "/market/.claude-plugin/packs/tools/.claude-plugin/plugin.json",
        );
        assert!(plugin.contains("Skills: review."), "{plugin}");
    }

    /// The vault names it, so a configured name is beside the point rather
    /// than in conflict with it.
    ///
    /// The field used to be required and a mismatch used to be refused, which
    /// read it as the caller's *intent* about which marketplace to build.
    /// That intent has its own field, validated against what the vault holds —
    /// and requiring this one too made every host reimplement "find the
    /// marketplace this vault names" before it could ask a question the core
    /// was about to answer. A second host walked straight into it.
    #[test]
    fn the_note_names_the_marketplace_whatever_the_build_was_configured_with() {
        let vfs = vault_with_container_notes();
        let mut request = request(ExportMode::Build);
        request.config.name = Some("something-else".to_owned());

        export_skills(&vfs, &request, &ap()).unwrap();

        let manifest = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(manifest.contains(r#""name": "demo-market""#), "{manifest}");
        assert!(!manifest.contains("something-else"), "{manifest}");
    }

    /// A distribution nobody named. The one field with no sensible default,
    /// so it is the one absence that refuses instead of falling back.
    #[test]
    fn a_marketplace_neither_the_vault_nor_the_build_names_is_refused() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/plugins/tools/skills/review.md",
            &note("review", None, &[]),
        );
        let mut request = request(ExportMode::Build);
        request.config.name = None;

        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unnamed-marketplace"), "{err}");
        assert!(paths_under(&vfs, Path::new("/market")).is_empty());
    }

    /// A marketplace directory with no note in it. The folder named the level,
    /// and that is enough to name the distribution — a marketplace called
    /// `house` on disk should not need a second place to say so.
    #[test]
    fn a_marketplace_folder_with_no_note_is_named_by_its_folder() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/tools/skills/review.md",
            &note("review", None, &[]),
        );
        let mut request = request(ExportMode::Build);
        request.config.name = None;

        export_skills(&vfs, &request, &ap()).unwrap();
        let manifest = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(manifest.contains(r#""name": "house""#), "{manifest}");
    }

    /// A vault with no marketplace level at all, and a build that names one:
    /// there is no set to select from, so the name is simply what the output
    /// is called rather than a selection that could be wrong.
    #[test]
    fn naming_a_marketplace_a_vault_does_not_hold_names_the_output() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/plugins/tools/skills/review.md",
            &note("review", None, &[]),
        );
        let mut request = request(ExportMode::Build);
        request.config.name = None;
        request.marketplace = Some("house".to_owned());

        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert_eq!(
            report.checked, 1,
            "the promoted skill belongs to whichever is built"
        );
        let manifest = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(manifest.contains(r#""name": "house""#), "{manifest}");
    }

    /// But a vault that DOES hold marketplaces still refuses a name that is not
    /// one of them: there, the selection can be wrong, and a typo must not
    /// quietly build something else.
    #[test]
    fn naming_a_marketplace_a_populated_vault_lacks_is_still_refused() {
        let vfs = two_marketplaces();
        let request = ExportRequest {
            marketplace: Some("gamma".to_owned()),
            ..request(ExportMode::Build)
        };
        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unknown-marketplace"), "{err}");
        assert!(err.contains("`acme`") && err.contains("`beta`"), "{err}");
    }

    #[test]
    fn two_marketplaces_are_refused_rather_than_flattened_onto_one_tree() {
        let vfs = two_marketplaces();
        let err = export_skills(&vfs, &request(ExportMode::Build), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("ambiguous-marketplace"), "{err}");
        assert!(err.contains("`acme`"), "{err}");
        assert!(err.contains("`beta`"), "{err}");
        // The refusal is the rail: nothing was rendered on the way to it.
        assert!(paths_under(&vfs, Path::new("/market")).is_empty());
    }

    #[test]
    fn naming_a_marketplace_builds_that_one_and_leaves_the_other_out() {
        let vfs = two_marketplaces();
        let request = ExportRequest {
            marketplace: Some("acme".to_owned()),
            ..request(ExportMode::Build)
        };
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert_eq!(report.checked, 1);
        assert!(
            text_at(
                &vfs,
                "/market/.claude-plugin/packs/core/skills/review/SKILL.md"
            )
            .contains("Use review.")
        );
    }

    #[test]
    fn an_unknown_marketplace_is_refused_naming_the_ones_there_are() {
        let vfs = two_marketplaces();
        let request = ExportRequest {
            marketplace: Some("gamma".to_owned()),
            ..request(ExportMode::Build)
        };
        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("unknown-marketplace"), "{err}");
        assert!(err.contains("it holds `acme` and `beta`"), "{err}");
    }

    /// A marketplace that exists and holds nothing this verb renders is told
    /// so, rather than told it is not there. Commands render now (see
    /// `a_commands_only_plugin_still_gets_a_marketplace_entry`), so an agent
    /// — a kind no root has a pack layout for — is what stays genuinely
    /// uncarried.
    #[test]
    fn a_marketplace_holding_no_skill_or_command_is_empty_rather_than_unknown() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/acme/plugins/core/skills/review.md",
            &note("review", Some("core"), &[]),
        );
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/agents/reviewer.md",
            &note("reviewer", Some("core"), &[]),
        );

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("empty-marketplace"), "{err}");
        assert!(err.contains("`beta`"), "{err}");
    }

    /// A plugin with no skills at all, only a command, still builds — on the
    /// Claude root, which has a place for one — and still gets a marketplace
    /// index entry, or nothing could ever install it.
    #[test]
    fn a_commands_only_plugin_still_gets_a_marketplace_entry() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/commands/ship.md",
            &note("ship", Some("core"), &[]),
        );

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        let report = export_skills(&vfs, &request, &ap()).unwrap();
        assert_eq!(report.mode, ExportMode::Build);
        assert!(
            vfs.exists(Path::new(
                "/market/.claude-plugin/packs/core/commands/ship.md"
            )),
            "the command file itself"
        );
        assert!(
            vfs.exists(Path::new(
                "/market/.claude-plugin/packs/core/.claude-plugin/plugin.json"
            )),
            "the plugin still gets a manifest"
        );
        let marketplace_manifest = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(
            marketplace_manifest.contains("\"core\""),
            "the plugin is listed even with no skills: {marketplace_manifest}"
        );
        // Codex has no place for a command, so the plugin is absent from
        // that root entirely: no directory, no manifest, no listing.
        assert!(
            !vfs.exists(Path::new("/market/.agents/packs/core")),
            "codex has no layout for a commands-only plugin"
        );
    }

    /// The refusal runs after the compile, so a peer the *body* reaches —
    /// not just one seeded by a bundle folder — is refused rather than
    /// silently dropped from the plugin.
    #[test]
    fn a_command_embedding_a_file_from_elsewhere_in_the_vault_is_refused() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/commands/ship.md",
            "---\nname: ship\ndescription: Cuts a release.\nap-plugin: core\n---\n\n             Cut it.\n\n![[team-logo.png]]\n",
        );
        vfs.create_dir_all(Path::new("/vault/assets")).unwrap();
        vfs.write_file(Path::new("/vault/assets/team-logo.png"), b"PNG")
            .unwrap();

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        let err = export_skills(&vfs, &request, &ap()).unwrap_err();

        let message = err.to_string();
        assert!(message.contains("no-renderer"), "{message}");
        assert!(message.contains("team-logo.png"), "{message}");
        assert!(
            !vfs.exists(Path::new(
                "/market/.claude-plugin/packs/core/commands/ship.md"
            )),
            "nothing is committed from a refused build"
        );
    }

    /// A plugin carrying no skills is still a plugin at a root that has a
    /// place for its commands: the diff admits it, so a build reports it and
    /// a following check does not call its own correct output stale.
    #[test]
    fn a_commands_only_plugin_is_reported_and_never_stale() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/commands/ship.md",
            &note("ship", Some("core"), &[]),
        );

        let build = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        let report = export_skills(&vfs, &build, &ap()).unwrap();
        assert!(
            report.units.iter().any(|unit| matches!(
                unit,
                ExportUnit::Plugin { root, name, .. } if root == "claude" && name == "core"
            )),
            "the build reports the plugin: {:?}",
            report.units
        );

        let checked = export_skills(
            &vfs,
            &ExportRequest {
                marketplace: Some("beta".to_owned()),
                ..request(ExportMode::Check)
            },
            &ap(),
        )
        .unwrap();
        assert!(!checked.changed, "{:?}", checked.units);
        assert!(
            !checked
                .units
                .iter()
                .any(|unit| matches!(unit, ExportUnit::Stale { .. })),
            "nothing is stale: {:?}",
            checked.units
        );
    }

    /// A hook note, as an author writes one: typed frontmatter and a body
    /// that is the script.
    fn hook_note(name: &str, event: &str, extra: &str, body: &str) -> String {
        format!(
            "---\nname: {name}\ndescription: Use {name}.\nap-plugin: core\nevent: {event}\n{extra}---\n\n{body}\n"
        )
    }

    /// AC-3: a build writes `hooks/hooks.json` under the plugin root, in the
    /// nested shape the harness reads, with the body as the script.
    #[test]
    fn a_plugin_build_writes_its_hooks_json() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/skills/review.md",
            &note("review", Some("core"), &[]),
        );
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/hooks/lint-on-write.md",
            &hook_note(
                "lint-on-write",
                "PreToolUse",
                "matcher: Edit|Write\ntimeout: 5000\n",
                "just lint",
            ),
        );

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        export_skills(&vfs, &request, &ap()).unwrap();

        let hooks = text_at(&vfs, "/market/.claude-plugin/packs/core/hooks/hooks.json");
        let value: serde_json::Value = serde_json::from_str(&hooks).unwrap();
        let group = &value["hooks"]["PreToolUse"][0];
        assert_eq!(group["matcher"], "Edit|Write");
        assert_eq!(group["hooks"][0]["type"], "command");
        assert_eq!(group["hooks"][0]["command"], "just lint");
        assert_eq!(group["hooks"][0]["timeout"], 5);
        let codex = text_at(&vfs, "/market/.agents/packs/core/hooks/hooks.json");
        let codex: serde_json::Value = serde_json::from_str(&codex).unwrap();
        assert_eq!(
            codex["hooks"]["PreToolUse"][0]["hooks"][0]["command"],
            "just lint"
        );
        let cursor = text_at(&vfs, "/market/.cursor-plugin/packs/core/hooks/hooks.json");
        let cursor: serde_json::Value = serde_json::from_str(&cursor).unwrap();
        assert_eq!(cursor["hooks"]["preToolUse"][0]["command"], "just lint");
        let manifest = text_at(
            &vfs,
            "/market/.cursor-plugin/packs/core/.cursor-plugin/plugin.json",
        );
        assert!(
            manifest.contains("\"hooks\": \"./hooks/hooks.json\""),
            "{manifest}"
        );
        assert!(!vfs.exists(Path::new("/market/.pi/packs/core/hooks/hooks.json")));
    }

    /// Exercises the one-document-per-plugin contract documented on `render_hooks_for_root` above.
    #[test]
    fn every_hook_of_a_plugin_lands_in_one_document() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/hooks/lint.md",
            &hook_note("lint", "PreToolUse", "matcher: Edit\n", "just lint"),
        );
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/hooks/report.md",
            &hook_note("report", "Stop", "", "just report"),
        );

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        export_skills(&vfs, &request, &ap()).unwrap();

        let hooks = text_at(&vfs, "/market/.claude-plugin/packs/core/hooks/hooks.json");
        let value: serde_json::Value = serde_json::from_str(&hooks).unwrap();
        assert_eq!(
            value["hooks"]["PreToolUse"][0]["hooks"][0]["command"],
            "just lint"
        );
        assert_eq!(
            value["hooks"]["Stop"][0]["hooks"][0]["command"],
            "just report"
        );
        // See marketplace_manifest's doc: a hooks-only plugin still gets an index entry.
        let marketplace_manifest = text_at(&vfs, "/market/.claude-plugin/marketplace.json");
        assert!(
            marketplace_manifest.contains("\"core\""),
            "{marketplace_manifest}"
        );
    }

    /// AC-5: an event the root's runtime does not carry stops the build,
    /// naming the event and the target, rather than writing a hooks file
    /// missing one hook.
    #[test]
    fn an_event_the_target_does_not_carry_refuses_the_build() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/hooks/watch.md",
            // Codex's own event, which Claude Code documents no point for;
            // `ap-targets` pins the note to the Claude root so it is not
            // simply left off it for a root that does carry the event.
            &hook_note(
                "watch",
                "Interrupt",
                "ap-targets:\n  - claude\n",
                "just watch",
            ),
        );

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("Interrupt"), "{err}");
        assert!(err.contains("claude-code"), "{err}");
        assert!(
            !vfs.exists(Path::new(
                "/market/.claude-plugin/packs/core/hooks/hooks.json"
            )),
            "nothing partial is written"
        );
    }

    /// A note with no `ap-targets` is left off a root that cannot carry its
    /// event when another root does, as `ap-targets` would narrow it.
    #[test]
    fn an_untargeted_note_skips_a_root_that_cannot_carry_it() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/hooks/notify.md",
            &hook_note("notify", "Notification", "", "just notify"),
        );

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        export_skills(&vfs, &request, &ap()).unwrap();
        let claude = "/market/.claude-plugin/packs/core/hooks/hooks.json";
        let text = String::from_utf8(vfs.read_file(Path::new(claude)).unwrap()).unwrap();
        assert!(text.contains("just notify"), "{text}");
        assert!(
            !vfs.exists(Path::new(
                "/market/.cursor-plugin/packs/core/hooks/hooks.json"
            )),
            "cursor has no Notification event, so the note is left off it"
        );
    }

    /// The step-5 rule: a note that states its payload twice is refused
    /// rather than silently preferring one.
    #[test]
    fn a_hook_with_both_a_body_and_a_command_key_is_refused() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/hooks/twice.md",
            &hook_note("twice", "PreToolUse", "command: just lint\n", "just fmt"),
        );

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        let err = export_skills(&vfs, &request, &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("hook-payload-twice"), "{err}");
        assert!(err.contains("twice"), "{err}");
    }

    /// A plugin with both a skill and a command: the Claude root carries
    /// both, the Codex root carries the skill alone — its own plugin format
    /// simply has no place for the command, the same silent narrowing
    /// `ap-targets` already does per root.
    #[test]
    fn a_mixed_plugin_carries_its_command_only_where_the_root_has_a_layout() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/skills/review.md",
            &note("review", Some("core"), &[]),
        );
        write(
            &vfs,
            "/vault/marketplaces/beta/plugins/core/commands/ship.md",
            &note("ship", Some("core"), &[]),
        );

        let request = ExportRequest {
            marketplace: Some("beta".to_owned()),
            ..request(ExportMode::Build)
        };
        export_skills(&vfs, &request, &ap()).unwrap();

        assert!(vfs.exists(Path::new(
            "/market/.claude-plugin/packs/core/skills/review/SKILL.md"
        )));
        assert!(vfs.exists(Path::new(
            "/market/.claude-plugin/packs/core/commands/ship.md"
        )));
        assert!(vfs.exists(Path::new(
            "/market/.agents/packs/core/skills/review/SKILL.md"
        )));
        assert!(
            !vfs.exists(Path::new("/market/.agents/packs/core/commands")),
            "codex's own plugin has no commands/ directory at all"
        );
    }

    /// Promotion, read from the far end: a skill above every marketplace is
    /// shared by all of them, so it renders into each build rather than none.
    #[test]
    fn a_skill_promoted_above_the_marketplaces_renders_into_each_one() {
        let vfs = two_marketplaces();
        write(&vfs, "/vault/skills/tone.md", &note("tone", None, &[]));

        for market in ["acme", "beta"] {
            let out = PathBuf::from(format!("/market-{market}"));
            let request = ExportRequest {
                marketplace: Some(market.to_owned()),
                out_root: out.clone(),
                ..request(ExportMode::Build)
            };
            let report = export_skills(&vfs, &request, &ap()).unwrap();
            assert_eq!(report.checked, 2, "{market}");
            let paths = paths_under(&vfs, &out);
            // `tone` has no `ap-plugin`, so it lands in the configured default.
            assert!(
                paths.contains(&".claude-plugin/packs/tools/skills/tone/SKILL.md".to_owned()),
                "{market}: {paths:?}"
            );
            assert!(
                paths.contains(&".claude-plugin/packs/core/skills/review/SKILL.md".to_owned()),
                "{market}: {paths:?}"
            );
        }
    }

    /// The one collision discovery cannot see: two legal files in two places,
    /// meeting only because this build renders both into one tree.
    #[test]
    fn a_promoted_skill_colliding_with_a_marketplace_s_own_is_refused_naming_both() {
        let vfs = MemVfs::new();
        write(
            &vfs,
            "/vault/marketplaces/acme/plugins/core/skills/review.md",
            &note("review", Some("core"), &[]),
        );
        write(
            &vfs,
            "/vault/skills/review.md",
            &note("review", Some("core"), &[]),
        );

        let err = export_skills(&vfs, &request(ExportMode::Build), &ap())
            .unwrap_err()
            .to_string();
        assert!(err.contains("path-collision"), "{err}");
        assert!(
            err.contains("marketplaces/acme/plugins/core/skills/review.md"),
            "{err}"
        );
        assert!(err.contains("skills/review.md"), "{err}");
    }

    /// A vault with no marketplaces at all still builds — every skill is
    /// promoted to the top, and the config alone names the marketplace.
    #[test]
    fn a_vault_holding_no_marketplace_builds_into_the_configured_one() {
        let vfs = MemVfs::new();
        write(&vfs, "/vault/skills/tone.md", &note("tone", None, &[]));

        let report = export_skills(&vfs, &request(ExportMode::Build), &ap()).unwrap();
        assert_eq!(report.checked, 1);
        assert!(
            paths_under(&vfs, Path::new("/market"))
                .contains(&".claude-plugin/packs/tools/skills/tone/SKILL.md".to_owned())
        );
    }

    #[test]
    fn an_empty_vault_is_refused_not_built() {
        let vfs = MemVfs::new();
        vfs.create_dir_all(Path::new("/vault/marketplaces/house/plugins"))
            .unwrap();
        write(
            &vfs,
            "/vault/marketplaces/house/plugins/draft.md",
            "# Not publishable\n",
        );

        let err = export_skills(&vfs, &request(ExportMode::Build), &ap()).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("empty-marketplace"), "{message}");
        assert!(!vfs.exists(Path::new("/market")));
    }

    #[test]
    fn the_wire_forms_are_kebab_case() {
        let report = ExportReport {
            mode: ExportMode::Check,
            checked: 3,
            changed: true,
            units: vec![
                ExportUnit::Plugin {
                    root: "claude".to_owned(),
                    name: "tools".to_owned(),
                    skills: 2,
                    status: UnitStatus::Drift,
                    version_bump_suggestion: None,
                },
                ExportUnit::Manifest {
                    root: "codex".to_owned(),
                    status: UnitStatus::Ok,
                },
                ExportUnit::Stale {
                    root: "claude".to_owned(),
                    path: "plugins/old".to_owned(),
                    kind: StaleKind::Plugin,
                },
            ],
            warnings: Vec::new(),
        };
        assert_eq!(
            serde_json::to_string(&report).unwrap(),
            r#"{"mode":"check","checked":3,"changed":true,"units":[{"unit":"plugin","root":"claude","name":"tools","skills":2,"status":"drift","version_bump_suggestion":null},{"unit":"manifest","root":"codex","status":"ok"},{"unit":"stale","root":"claude","path":"plugins/old","kind":"plugin"}],"warnings":[]}"#
        );
        // And a request with no mode means build — the write, as with
        // `PublishMode`.
        let request: ExportRequest = serde_json::from_str(
            r#"{"vault_root":"/v","out_root":"/m","config":{"name":"m","default_plugin":"tools"}}"#,
        )
        .unwrap();
        assert_eq!(request.mode, ExportMode::Build);
        assert!(request.skills_root.is_none());
    }

    /// A build that quietly omitted an agent would be the failure this crate
    /// is built around. It has no place for one — a pack declares only
    /// `skills/` — so it names it instead, once, with no root.
    #[test]
    fn a_component_no_pack_can_hold_is_named_rather_than_dropped() {
        let vfs = MemVfs::new();
        let base = "/vault/marketplaces/house/plugins/core";
        write(
            &vfs,
            &format!("{base}/skills/review.md"),
            "---\nname: review\ndescription: Reviews.\n---\n\nRead it.\n",
        );
        write(
            &vfs,
            &format!("{base}/agents/triage.md"),
            "---\nname: triage\ndescription: Triages.\n---\n\nSort it.\n",
        );

        let report = check(&vfs);

        let named: Vec<&ExportUnit> = report
            .units
            .iter()
            .filter(|u| matches!(u, ExportUnit::NotCarried { .. }))
            .collect();
        assert_eq!(named.len(), 1, "{:?}", report.units);
        let ExportUnit::NotCarried { root, path, kind } = named[0] else {
            unreachable!()
        };
        assert_eq!(*root, None);
        assert_eq!(path, "marketplaces/house/plugins/core/agents/triage.md");
        assert_eq!(kind, "agent");
        // And the skill still built.
        assert!(
            report
                .units
                .iter()
                .any(|u| matches!(u, ExportUnit::Plugin { .. })),
            "{:?}",
            report.units
        );
    }

    /// A command on a root whose pack format has no place for one is named
    /// on that root, not dropped from it. The root that carries it reports
    /// nothing extra, and a root `ap-targets` narrowed away stays silent.
    #[test]
    fn a_command_a_root_cannot_carry_is_named_on_that_root() {
        let vfs = MemVfs::new();
        let base = "/vault/marketplaces/house/plugins/core";
        write(
            &vfs,
            &format!("{base}/skills/review.md"),
            &note("review", None, &[]),
        );
        write(
            &vfs,
            &format!("{base}/commands/ship.md"),
            &note("ship", None, &[]),
        );
        write(
            &vfs,
            &format!("{base}/commands/codex-only.md"),
            &note("codex-only", None, &["codex"]),
        );

        let report = check(&vfs);

        let named: Vec<(Option<&str>, &str, &str)> = report
            .units
            .iter()
            .filter_map(|u| match u {
                ExportUnit::NotCarried { root, path, kind } => {
                    Some((root.as_deref(), path.as_str(), kind.as_str()))
                }
                _ => None,
            })
            .collect();
        let ship = "marketplaces/house/plugins/core/commands/ship.md";
        let codex_only = "marketplaces/house/plugins/core/commands/codex-only.md";
        assert_eq!(
            named,
            vec![
                (Some("codex"), codex_only, "command"),
                (Some("codex"), ship, "command"),
                (Some("cursor"), ship, "command"),
                (Some("pi"), ship, "command"),
            ],
            "{:?}",
            report.units
        );
    }

    /// A hook on the one root with no hooks file (pi) is named there, and
    /// on no root that carries it.
    #[test]
    fn a_hook_a_root_cannot_carry_is_named_on_that_root() {
        let vfs = MemVfs::new();
        let base = "/vault/marketplaces/beta/plugins/core";
        write(
            &vfs,
            &format!("{base}/skills/review.md"),
            &note("review", Some("core"), &[]),
        );
        write(
            &vfs,
            &format!("{base}/hooks/lint-on-write.md"),
            &hook_note(
                "lint-on-write",
                "PreToolUse",
                "matcher: Edit\n",
                "just lint",
            ),
        );

        let report = export_skills(
            &vfs,
            &ExportRequest {
                marketplace: Some("beta".to_owned()),
                ..request(ExportMode::Check)
            },
            &ap(),
        )
        .unwrap();

        let named: Vec<(Option<&str>, &str, &str)> = report
            .units
            .iter()
            .filter_map(|u| match u {
                ExportUnit::NotCarried { root, path, kind } => {
                    Some((root.as_deref(), path.as_str(), kind.as_str()))
                }
                _ => None,
            })
            .collect();
        assert_eq!(
            named,
            vec![(
                Some("pi"),
                "marketplaces/beta/plugins/core/hooks/lint-on-write.md",
                "hook"
            )],
            "{:?}",
            report.units
        );
    }

    /// The committed fixture, end to end on a real filesystem: a
    /// bundled skill with an embed, built into every root and clean on the
    /// check that follows.
    #[test]
    fn the_committed_fixture_builds_on_a_real_filesystem() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/agent-skills-vault");
        let dir = tempfile::tempdir().unwrap();
        let request = ExportRequest {
            vault_root: fixture,
            skills_root: None,
            marketplace: None,
            out_root: dir.path().join("market"),
            harnesses: BTreeSet::new(),
            mode: ExportMode::Build,
            config: config(),
            assets: Vec::new(),
            hooks: Vec::new(),
        };

        let report = export_skills(&NativeVfs, &request, &ap()).unwrap();
        assert_eq!(report.checked, 1);
        assert!(report.changed);

        let skill = dir
            .path()
            .join("market/.claude-plugin/packs/tools/skills/workflow-checklist");
        let text = std::fs::read_to_string(skill.join("SKILL.md")).unwrap();
        assert!(text.contains("name: workflow-checklist"), "{text}");
        assert!(
            text.contains(
                "marketplaces/house/plugins/tools/skills/workflow-checklist/workflow-checklist.md; \
                 do not edit."
            ),
            "{text}"
        );
        // The embed inlined its body; the bundle file still travels.
        assert!(text.contains("Understand the requested outcome."), "{text}");
        assert!(!text.contains("![["), "{text}");
        assert!(skill.join("references/steps.md").exists());
        assert!(
            dir.path()
                .join("market/.agents/packs/tools/skills/workflow-checklist/SKILL.md")
                .exists()
        );

        let check = ExportRequest {
            mode: ExportMode::Check,
            ..request
        };
        let report = export_skills(&NativeVfs, &check, &ap()).unwrap();
        assert!(!report.changed, "{report:?}");
    }
}

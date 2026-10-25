/**
 * GENERATED FILE — do not edit. Run `cargo run -p tradecraft-typegen`.
 *
 * The request and response types of every `#[wasm_bindgen]` export in
 * `tradecraft-wasm/src/lib.rs`, read out of the Rust source that defines
 * them. The wire is a JSON string in and a JSON string out, so nothing in
 * TypeScript checks its shape; this file is what makes the compiler check it.
 * `cargo test -p tradecraft-typegen` fails when this file is stale, so a Rust
 * type that moves without its TypeScript fails the pull request.
 *
 * Optionality follows the direction. A request field serde can default is
 * optional here; a response field is `| null` unless the Rust side skips it
 * when empty.
 *
 * Doc comments are the Rust ones, verbatim, so there is one description of
 * each field rather than two that can disagree.
 */

/**
 * What crosses the boundary as `request_json`: the core's `PublishRequest`,
 * plus the one field this layer adds.
 *
 * A field on the request rather than a third parameter, so the exported arity
 * does not move: hosts call `publishSkill(vfs, requestJson)`.
 * `#[serde(default)]` makes the field optional, so a request serialized
 * without it still deserializes and publishes under `tc`.
 *
 * It is a `String` stem rather than a `Namespace` because the core
 * deliberately gives `Namespace` no `Deserialize`: every construction goes
 * through [`Namespace::new`], so a stem that arrives over the wire is
 * validated at the same gate a stem typed at a terminal is, and the same
 * [`InvalidStem`] comes back.
 */
export interface PublishRequest {
  /** Absolute path to the vault note. Not a directory — a skill is a note. */
  skill_path: string;

  /**
   * Absolute path to the destination root. Target-specific directories
   * (`.claude/skills/…`, `.agents/skills/…`) are computed under it.
   */
  destination_root: string;

  /** A name from [`KNOWN_TARGETS`]. See `runtime_target_for`. */
  target: string;

  /**
   * Write, or classify only. Absent on the wire means
   * [`PublishMode::Write`].
   */
  mode?: PublishMode;

  /**
   * The VAULT root this note lives under — the whole vault, never a
   * subfolder of it. Two duties ride on it.
   *
   * The kind gate asks the folders under this root what the note is — the
   * same root [`crate::discover`] scans. And the rail protects exactly
   * this tree: passing `/vault/skills` here would shrink protection to
   * that subtree and make the real vault root a publishable ancestor.
   *
   * Absent means "no structural layer" — the note's own `tc-kind`, or the
   * default, decides, and the rail falls back to the note's own directory
   * with the wider ancestor refusal. A caller that has the vault root
   * should pass it: a command sitting in `commands/` and
   * declaring no `tc-kind` is a skill to a gate that only reads
   * frontmatter, and publishing it writes a `SKILL.md` for something that
   * is not a skill.
   */
  skills_root?: string;

  /**
   * When this run happened, RFC 3339, from the caller's clock.
   *
   * This crate reads no clock — the same rule [`crate::adopt::AdoptRequest`]
   * follows, and the reason both are deterministic under test. Absent, the
   * manifest records no time and a conflict report says so rather than
   * inventing one.
   */
  published_at?: string;

  /**
   * Destination-root-relative paths whose refusal the caller has explicitly
   * acknowledged, and which this run may therefore overwrite.
   *
   * Per file and named, never a run-wide force. A conflicted file holds the
   * only copy of an edit somebody made at the destination, so discarding it
   * is a decision about *that file* — a switch that resolved every conflict
   * at once would make the decision invisible at the moment it is taken.
   */
  overwrite?: string[];

  /**
   * The vault's frontmatter namespace, as a stem — `tc`, or whatever the
   * host configured. Absent means [`Namespace::default`].
   */
  namespace?: string;
}

/**
 * Whether a publish writes, or only reports what it would write.
 *
 * A field on the request rather than a second entry point, so there is one
 * publish path and no `dry_run_skill` copy of [`publish_skill`]'s order to
 * keep in step. It is also how previewing crosses the wasm boundary: that
 * boundary serializes a [`PublishRequest`], so `#[serde(default)]` lets a
 * host opt in with one extra key while every existing caller keeps meaning
 * `write`. A third argument would not ride the wire: the boundary would need
 * a wrapper type for it, a second wire shape for the same request.
 */
export type PublishMode = "write" | "dry-run";

/**
 * Every file the publish considered, in path order. A refused publish still
 * reports all of them — a silent skip is how a destination rots unnoticed.
 */
export interface PublishReport {
  /** Every file considered, in path order. */
  files: PublishedFile[];

  /**
   * Why there are no files: set exactly when `tc-targets` excluded this
   * destination, and `None` on every other report.
   *
   * Prose, not one of the publish spec's reason tokens. Those
   * name outcomes, and exclusion is the absence of one — nothing here was a
   * candidate, so nothing here has a status. Omitted from the wire when
   * unset, so the ordinary report is the shape it always was.
   */
  not_published?: string;

  /**
   * Vault-relative paths of members this projection could not carry.
   *
   * A pack declares only `skills/`, so an agent or a command belonging to
   * one has no place inside it. Reporting beats refusing the pack — a
   * plugin holding four skills and an agent is an ordinary vault and the
   * four should travel — and it beats dropping them, which is the failure
   * this crate is built around. Both kinds publish to a destination on
   * their own, which is what a reader does about it.
   *
   * Empty on every report but a pack's, and omitted from the wire when
   * empty, so the ordinary report is the shape it always was.
   */
  not_carried?: string[];

  /**
   * `tc-overrides` keys this destination's render already wrote, each as
   * its own reason line.
   *
   * A diagnostic that travels with the report and never blocks a write:
   * the files below published exactly as they would have without the key.
   * Empty on every ordinary report, and omitted from the wire when empty.
   */
  redundant_overrides?: PublishReason[];
}

/** One line of a [`PublishReport`]. */
export interface PublishedFile {
  /** Destination-root-relative, forward-slashed. */
  path: string;

  /** What happened to the file. */
  status: PublishStatus;

  /**
   * Which rule decided [`PublishedFile::status`]. The distinction a status
   * cannot carry — a first write against a rewrite of stale output, a
   * destination edit against a foreign file.
   */
  outcome: PublishOutcome;

  /**
   * Why, when there is a why: every refusal carries one, and so does a file
   * claimed into the manifest because its bytes were already ours.
   */
  reason: PublishReason | null;
}

/** What happened to one file. */
export type PublishStatus = "written" | "unchanged" | "refused";

/**
 * Which of `classify`'s rules produced a file's [`PublishStatus`].
 *
 * A status alone collapses cases a reader has to tell apart. `written` is
 * both a first write into an empty destination and a rewrite of our own
 * output that the source note has moved past, and those two are the
 * difference between installing a unit and repairing a stale one. `refused`
 * is both a destination edit and a file we never wrote. The status says what
 * happened to the bytes; this says which state of the world it happened in.
 *
 * A closed set, and the same tokens on every surface — the wire spelling is
 * the kebab-case rename below, and no consumer re-words it.
 */
export type PublishOutcome = "first-write" | "rewrite" | "claimed" | "overwritten" | "unchanged" | "conflict" | "foreign" | "blocked" | "manifest";

/**
 * Why a report line reads the way it does: the closed-set token, and the
 * prose that varies with the occurrence.
 *
 * Both halves are needed. The token is what a script matches on; the detail
 * carries the path, the timestamp or the member name that tells a person what
 * to do about it, and no closed set can hold those.
 */
export interface PublishReason {
  /** The closed-set token a script matches on. */
  token: ReasonToken;

  /** Prose for a human. Omitted from the wire when there is none. */
  detail?: string;
}

/**
 * The closed set of reasons a report line can carry — the publish spec's
 * outbound vocabulary, plus the one non-refusal note a line has to say about
 * itself.
 *
 * Closed: a report, a `--json` document, `tradecraft status` and a later UI
 * all read the same token, so it may not be free text that drifts from the
 * table it reproduces.
 */
export type ReasonToken = "conflict" | "foreign" | "unsafe-path" | "io" | "no-renderer" | "plugin-managed" | "stopped" | "cycle" | "unsafe-root" | "bad-manifest" | "path-collision" | "unknown-target" | "unknown-override-key" | "unknown-kind" | "member-unresolved" | "empty-plugin" | "mixed-frontmatter-shape" | "claimed" | "redundant-override" | "overwritten";

/**
 * What crosses as `request_json` for [`discover_components`].
 *
 * The one wire shape in this crate that does not `flatten` a core struct,
 * because there is no core struct to flatten: `discover_components` takes its
 * vault root and skills root as loose parameters. So this is not a second
 * copy of anything — it is the parameter list, spelled once, in the only
 * place it has to cross a wire.
 */
export interface DiscoverRequest {
  /** Absolute path to the vault. */
  vault_root: string;

  /**
   * The content root to scan. Absent means the vault root, exactly as the
   * core reads it.
   */
  skills_root?: string;

  /**
   * The vault's frontmatter namespace, as a stem. Absent means
   * [`Namespace::default`].
   */
  namespace?: string;
}

/**
 * What one scan found, and what it could not read.
 *
 * Two lists rather than a `Result`, because a vault is a shared tree and a
 * note nobody else owns must not decide whether everybody else's publish
 * runs. Every caller reads both: the components are the roster, and
 * [`Self::skipped`] is the part of the vault this answer does not cover.
 */
export interface DiscoveryReport {
  /** Every publishable note, sorted by name. */
  components: DiscoveredComponent[];

  /** Every note the scan could not read, in path order. */
  skipped: SkippedNote[];

  /** Notes admitted with something filled in for them, in path order. */
  warnings: DiscoveryWarning[];
}

/**
 * One component, as discovery hands it to the verbs.
 *
 * `targets` keeps the three-outcome `tc-targets` reading instead of being
 * expanded to an explicit all-targets list, so the layer that knows what
 * "every destination" means today is the one that decides it.
 */
export interface DiscoveredComponent {
  /** The frontmatter `name`, already validated against the Agent Skills spec. */
  name: string;

  /**
   * The frontmatter `description`, ≤1024 characters, or
   * [`MISSING_DESCRIPTION`] when the note wrote none.
   */
  description: string;

  /** `description` is [`MISSING_DESCRIPTION`], not the note's own. */
  description_filled: boolean;

  /** What this component is, resolved across the layers that can decide it. */
  kind: EntityKind;

  /**
   * Which layer produced [`Self::kind`], straight from
   * [`crate::frontmatter::resolve_kind`].
   */
  kind_source: KindSource;

  /**
   * What the structure said this was, before frontmatter was read. `None`
   * where structure said nothing — a component at the root has no folder
   * above it naming a kind.
   *
   * Kept beside the resolved value rather than discarded so a caller can
   * tell "the folder and the note agree" from "the note overruled the
   * folder".
   */
  folder_kind: EntityKind | null;

  /**
   * `tc-targets` exactly as [`VaultFrontmatter::targets`] read it, every
   * name checked against [`KNOWN_TARGETS`]. `None` is absent — every
   * destination; `Some(vec![])` is nowhere.
   */
  targets: string[] | null;

  /**
   * The plugin holding this component. `None` is a bare component, sitting
   * at the root and belonging to no plugin.
   *
   * The containing folder decides it and `tc-plugin` overrules it. Where a
   * marketplace needs every skill under *some* plugin directory,
   * [`crate::export`] supplies the configured default — that is a
   * publication concern, not a fact about the vault.
   */
  plugin: string | null;

  /** The plugin the folder put it in, before `tc-plugin` was read. */
  folder_plugin: string | null;

  /**
   * The marketplace this belongs to — the directory holding the `plugins/`
   * folder it sits under. `None` only for a marketplace's own note.
   *
   * Structural, with no frontmatter counterpart. `tc-kind` and `tc-plugin`
   * exist because a note may reasonably disagree with where it sits about
   * *what* it is or *which pack* it joins; disagreeing about which
   * distribution it ships in is a move, not an annotation, and a key that
   * let a note claim another marketplace would let it claim one whose
   * directory does not exist.
   */
  marketplace: string | null;

  /** Absolute path of the entry note. */
  entry_path: string;

  /**
   * The directory this component owns — everything under it ships with a
   * skill. `None` for a lone note, which travels alone.
   */
  bundle_root: string | null;

  /**
   * Files this component owns, relative to [`Self::bundle_root`] and
   * forward-slashed, sorted.
   *
   * Ownership is *deepest* directory wins, so a plugin holding
   * `skills/code-review/scripts/check.py` does not claim it —
   * `code-review` does. Without that rule a plugin reads as a flat dump of
   * its own subtree.
   */
  resources: string[];

  /**
   * The entry's path relative to the vault root, forward-slashed — the
   * spelling reports and provenance markers print.
   */
  vault_relative_path: string;

  /**
   * A hook note's routing and payload, as a reader of the tree needs them:
   * `None` on every other kind.
   *
   * Carried here because a hook's file name says nothing about what fires
   * it — a lister that only had the name would have to open each note to
   * tell one hook from another.
   */
  hook: DiscoveredHook | null;

  /**
   * The manifest fields this note publishes under, read from its own
   * frontmatter.
   *
   * Carried for every kind and consulted for two: a marketplace note names
   * the distribution, a plugin note names the pack. A skill's is silent in
   * every vault worth having, because a skill's manifest entry is derived
   * from the skill and a second spelling of it could only disagree.
   *
   * Surfaced here rather than left in the note because the scan is the only
   * pass that reads a container note at all — [`crate::export`] renders
   * from what discovery hands it and never opens a file of its own.
   */
  identity: ContainerIdentity;
}

/**
 * Which publishable unit a note is — what `tc-kind` names.
 *
 * Absent means [`EntityKind::Skill`]: a vault of skills declares nothing at
 * all, and the key appears only on the notes that are something else. That
 * default is for **absence only**. An unrecognised value is a typo, and
 * defaulting it would publish a `SKILL.md` at every destination for something
 * that is not a skill — silently, and as a write.
 *
 * `mcp-server` is named by the decision as a later kind and is deliberately
 * not a variant yet.
 *
 * # A kind in the vocabulary need not be publishable
 *
 * Entering the vocabulary makes a note *discoverable* — the workbench can
 * list it and say what it is — while [`crate::publish`]'s kind gate refuses it
 * `no-renderer` until a projection exists. `Marketplace` and `Hook` are the
 * kinds sitting there now. Outside the vocabulary a note is `unknown-kind`: a typo.
 */
export type EntityKind = "skill" | "plugin" | "command" | "agent" | "hook" | "marketplace";

/**
 * Which layer decided a note's kind.
 *
 * Carried alongside the kind because the answer to "why is this a plugin"
 * is a different sentence per layer, and a report that only had the kind
 * could not write any of them.
 */
export type KindSource = "override" | "frontmatter" | "directory" | "default";

/**
 * What a hook note routes on and what it runs, summarised for a listing.
 *
 * A summary, not the projection: [`crate::projection::to_adapt_hook`] stays
 * the authority on what a hook renders to and on every refusal. This reads
 * the same keys with none of the refusals, because a tree has to draw a
 * half-written hook too.
 */
export interface DiscoveredHook {
  /**
   * `event` — what fires the hook. `None` where the note names none, which
   * the projection refuses and a listing still has to show.
   */
  event: string | null;

  /** `matcher` — pipe-delimited tool names. `None` matches every tool. */
  matcher: string | null;

  /**
   * `type`, defaulted to `command` exactly as the projection defaults it.
   * An unrecognised spelling is carried verbatim; naming it a typo is the
   * projection's job.
   */
  hook_type: string;

  /**
   * The `command`, `prompt` or `url` this hook runs, whichever its type
   * licenses — the key when the note writes one, otherwise the body's
   * first non-empty line, which is where a `command` or `prompt` hook may
   * instead put it. `None` for `mcp_tool` and `agent`, which carry their
   * payload elsewhere.
   */
  payload: string | null;
}

/**
 * What a container note says about the thing it names — the manifest fields
 * a marketplace or a plugin publishes under.
 *
 * Meaningful only on a container. A skill note may spell these keys and they
 * are read the same way, but nothing consults them: a skill's manifest entry
 * is derived from the skill, and there is no second place for it to disagree.
 *
 * **Every field is optional and every absence has a default**, resolved by
 * [`crate::export`] rather than here, because the defaults are a property of
 * the manifest dialect being written and not of the note. Reading them is
 * this module's job; deciding what a missing `license` means is not.
 *
 * `owner` and `author` are [`Value`] rather than `String` because an author
 * may spell either as `{name, email, url}`, and narrowing them here would
 * refuse a shape the manifest accepts. The converse is not true for `owner`:
 * Claude and Cursor both require an object there, so a bare name written
 * here is normalised on the way into a manifest rather than passed through —
 * see [`crate::export::MarketplaceConfig::owner`].
 */
export interface ContainerIdentity {
  /** `tc-owner` — the marketplace's owner, free-shaped. */
  owner: unknown;

  /**
   * `tc-author` — the author a plugin publishes under, free-shaped. On a
   * marketplace note it is the default for every plugin under it.
   */
  author: unknown;

  /**
   * `tc-display-name` — the human-facing name where a dialect carries one
   * separately from the slug.
   */
  display_name: string | null;

  /** `tc-license` — an SPDX identifier, unread and passed through. */
  license: string | null;

  /** `tc-keywords`. */
  keywords: string[] | null;

  /** `tc-category` — Codex's plugin category. */
  category: string | null;

  /** `tc-version` — the plugin's own version. */
  version: string | null;
}

/** One note the scan could not read, and why. */
export interface SkippedNote {
  /**
   * The note's path relative to the vault root, forward-slashed — the same
   * spelling every other report prints.
   */
  path: string;

  /**
   * A closed-set reason token. The refusals that already carry one keep it
   * (`unknown-target`, `unknown-kind`); everything else — frontmatter that
   * will not parse, a name the Agent Skills spec does not admit, an unreadable file —
   * is `unreadable-note`, the vocabulary's entry for "this note does not
   * parse", which had none before.
   */
  reason: string;

  /** The sentence naming what is wrong, as the error stated it. */
  detail: string;

  /**
   * The pack this note would have joined: its own `tc-plugin` where the
   * read got far enough to see that key, else the plugin folder holding
   * it.
   *
   * A pack publish checks its own members against this. The publish spec forbids
   * installing a subset silently, and a member declaring `tc-plugin` from
   * outside the pack's folder is still a member — so the declared key is
   * consulted first and the folder is the floor beneath it. `None` where
   * neither answers: the note joins no pack, and no pack is blocked.
   */
  plugin: string | null;
}

/** One note the scan admitted, with what it filled in. */
export interface DiscoveryWarning {
  /** Vault-relative and forward-slashed, as [`SkippedNote::path`]. */
  path: string;

  /**
   * A closed-set token: `missing-description` from the scan;
   * [`crate::export`] adds `missing-version` for a plugin.
   */
  reason: string;

  /** Extra detail for a person to read. */
  detail: string;
}

/**
 * What crosses as `request_json` for [`export_skills`]: the core's
 * [`ExportRequest`], flattened, plus the namespace stem this layer adds.
 */
export interface ExportRequest {
  /**
   * Absolute path to the vault. Discovery, compilation, and the provenance
   * markers all resolve against it.
   */
  vault_root: string;

  /**
   * The content root to scan; `None` means the vault root, exactly as
   * [`discover_components`] reads it.
   */
  skills_root?: string;

  /**
   * Which marketplace this build renders. `None` names the vault's only
   * one; a vault holding more than one is refused rather than flattened,
   * because one `out_root` holds one marketplace.
   */
  marketplace?: string;

  /**
   * The marketplace directory: one directory holding one marketplace,
   * which every harness this build renders reads from.
   *
   * Each harness owns exactly one top-level entry under it — its own tree
   * (`RootSpec::tree`) — and nothing else here is read, compared or
   * replaced. So this may be a directory holding other things, including
   * a repository's own root, which is what lets a repository be its own
   * marketplace.
   */
  out_root: string;

  /**
   * Which harnesses to render, by name. Empty means every harness this
   * build supports.
   *
   * A name no harness answers to is refused rather than ignored: it is a
   * typo or a harness this build cannot produce, and silently publishing
   * less than was asked for is the failure this crate is built around.
   */
  harnesses?: string[];

  /**
   * Build, or check. Absent on the wire means [`ExportMode::Build`] — the
   * same default-to-the-write choice [`crate::publish::PublishMode`] makes,
   * for the same reason.
   */
  mode?: ExportMode;

  /** The marketplace's own identity and per-plugin overrides. */
  config: MarketplaceConfig;

  /**
   * Files copied verbatim into a built plugin's own root — a CLI, a wasm
   * artifact, a launcher: authored on disk, never as a vault note.
   *
   * Paths are absolute, resolved by the caller: this core never reads an
   * ambient project file, so it has nothing to resolve a relative asset
   * path against (see the crate doc's wasm-boundary note on
   * [`MarketplaceConfig`]). The CLI resolves `assets:` entries against the
   * project file's own directory before building this request.
   */
  assets?: AssetSpec[];

  /** Canonical hooks files; see [`HookFileSpec`]. */
  hooks?: HookFileSpec[];

  /**
   * The vault's frontmatter namespace, as a stem. Absent means
   * [`Namespace::default`], exactly as on [`WireRequest`].
   */
  namespace?: string;
}

/** Whether an export writes the marketplace, or only reports its drift. */
export type ExportMode = "build" | "check";

/**
 * What the *build* says about the marketplace and its plugins — the fallback
 * under what the vault's own container notes say.
 *
 * `resolve_config` folds the two, note over request, field by field: a
 * marketplace note is the marketplace, and a build flag is one invocation of
 * it.
 *
 * `name` and `default_plugin` stay required, because a vault holding no
 * marketplace directory at all is legal and has no note to read.
 * `default_plugin` is never in a note at all: what to do with a skill that
 * names no plugin is a property of the build.
 */
export interface MarketplaceConfig {
  /**
   * The name both manifests publish under, **when the vault does not supply
   * one**. A marketplace note names itself, and that name wins.
   *
   * A fallback, not an assertion. Which marketplace to build has its own
   * field ([`ExportRequest::marketplace`]), validated against what the vault
   * actually holds; one selector is enough.
   *
   * `None` with no marketplace note is the one case with no answer, and it
   * is refused rather than defaulted: a distribution nobody named is a
   * configuration fault, not a marketplace called `default`.
   */
  name?: string;

  /** Codex's `interface.displayName`; the name when absent. */
  display_name?: string;

  /**
   * The marketplace `owner`. JSON rather than a string because an author
   * may spell it `{name, email, url}`, but a bare name is **not** a shape
   * any dialect accepts: Claude and Cursor both mark `owner` required and
   * both require an object. A string here is normalised to `{name: …}` on
   * the way into a manifest rather than refused, because the note's
   * spelling is a convenience and the manifest's shape is the dialect's.
   */
  owner?: unknown;

  /**
   * The marketplace's own one-line description, from its note. Optional in
   * every dialect, and placed differently by each — see
   * `claude_marketplace_manifest` and `cursor_marketplace_manifest`.
   */
  description?: string;

  /** Default plugin author; falls back to `owner` when absent. */
  author?: unknown;

  /**
   * Default plugin license, as an SPDX identifier. A distribution is
   * licensed as a whole, so the marketplace note states it once and every
   * plugin under it inherits; a plugin licensed differently says so on its
   * own note.
   */
  license?: string;

  /** The plugin a note with no `tc-plugin` belongs to. */
  default_plugin: string;

  /** Per-plugin manifest overrides, keyed by plugin name. */
  plugins?: Record<string, PluginOverrides>;

  /**
   * Refuse the build when a note has a `name` and no `description`,
   * instead of publishing [`crate::discover::MISSING_DESCRIPTION`] and
   * reporting it in [`ExportReport::warnings`].
   */
  require_descriptions?: boolean;

  /**
   * Where the per-skill `scripts/sdlc` shim looks for this plugin's own
   * launcher asset, relative to the plugin's root — and the `dest` an
   * asset must carry for `render_root` to emit that shim at all (see
   * `sdlc_shim_script`'s parent-walk). Project-file authors declare it
   * as `marketplace.shim_target`; [`crate::settings::MarketplaceSettings::to_config`]
   * defaults it to [`DEFAULT_SHIM_TARGET`] when the project file is
   * silent, so a project that never mentions it keeps resolving
   * `cli/sdlc`.
   */
  shim_target?: string;
}

/**
 * Manifest fields one plugin overrides. Every absence has a documented
 * default, so an empty override block means the defaults wholesale.
 */
export interface PluginOverrides {
  /** Default `0.1.0`. */
  version?: string;

  /** Default `Skills: <names>.` over the root's own member list. */
  description?: string;

  /** Default the marketplace `author`, then `owner`. */
  author?: unknown;

  /** Default the marketplace `license`, then `UNLICENSED`. */
  license?: string;

  /** Default empty. */
  keywords?: string[];

  /** Codex only. Default `Productivity`. */
  category?: string;

  /** Codex only. Default the plugin's name. */
  display_name?: string;
}

/**
 * One file, or one directory tree, an export copies verbatim into a built
 * plugin's own root, rather than rendering it from a vault note.
 *
 * Bundle resources ([`crate::compile::CompileSource::bundle_root`]) already
 * cover a skill's own peers; this is for what a *plugin* carries once, no
 * matter which skill happens to shell out to it. A `cli/sdlc` launcher is the
 * motivating file case, and shared reference docs the skills read
 * (`conventions/`) the motivating directory case.
 */
export interface AssetSpec {
  /**
   * Absolute host path to the source file or directory. A directory
   * lands as its whole tree, under the same fixed `tests`/`fixtures`
   * exclude a skill's bundle sweep applies, and minus `*.test.*` files.
   */
  source: string;

  /**
   * Destination, relative to the built plugin's own root
   * (`<packs>/<plugin>/`), forward-slashed. For a directory source, the
   * directory its tree lands under.
   */
  dest: string;

  /**
   * Which plugin's root this asset lands in. `None` means
   * [`MarketplaceConfig::default_plugin`].
   */
  plugin?: string;
}

/**
 * One canonical hooks file a build renders into a plugin's packs. At most
 * one per plugin; its gap report goes in every pack. See
 * [`crate::hooks_file`].
 */
export interface HookFileSpec {
  /**
   * Absolute host path to the file, resolved by the caller the way an
   * [`AssetSpec::source`] is.
   */
  source: string;

  /**
   * The path relative to the project file, after token expansion.
   * Refusals and the gap report's `source` name the file by this, so the
   * report holds no host path.
   */
  from: string;

  /**
   * Which plugin's packs carry it. `None` means
   * [`MarketplaceConfig::default_plugin`].
   */
  plugin?: string;
}

/** What one export did, or would do — per plugin, per root. */
export interface ExportReport {
  /**
   * The mode the report describes, so `ok`/`drift` and
   * `written`/`unchanged` read against the right verb.
   */
  mode: ExportMode;

  /** How many publishable skills discovery found. */
  checked: number;

  /** Check: anything drifted or stale. Build: anything was swapped. */
  changed: boolean;

  /**
   * One unit per plugin per root, one per marketplace manifest, plus whatever the
   * destination holds that the vault no longer produces, plus the members a
   * layout cannot carry. Ordered: the members no root carries first; then roots in
   * `claude`, `codex`, `cursor`, `pi` order; within a root, plugins by name, then the
   * manifest, then stale paths, then the members that root cannot carry.
   */
  units: ExportUnit[];

  /** Notes the scan admitted with something filled in, in path order. */
  warnings: DiscoveryWarning[];
}

/** One comparable unit of the marketplace. */
export type ExportUnit =
  /** One plugin directory in one root — its manifest and its skills. */
  | {
      unit: "plugin";
      /** The harness root the plugin sits in. */
      root: string;
      /** The plugin's name. */
      name: string;
      /** Member skills admitted to this root. */
      skills: number;
      /** Whether the plugin matches what is installed. */
      status: UnitStatus;
      /**
       * This plugin's members drifted from what is installed here, with
       * its own `tc-version` unmoved since — the one-click bump a build
       * report can offer alongside `drift`/`written`. `None` for a plugin
       * that does not meet the rule, or that carries no `tc-version` to
       * compare. See [`VersionBumpSuggestion`].
       */
      version_bump_suggestion: VersionBumpSuggestion | null;
    }
  /** One root's marketplace manifest. */
  | {
      unit: "manifest";
      /** The harness root the manifest sits in. */
      root: string;
      /** Whether the manifest matches what is installed. */
      status: UnitStatus;
    }
  /**
   * Present at the destination, absent from the render. `check` reports
   * it as drift; `build`'s swap removes it.
   *
   * `kind` is the difference between losing a whole pack and losing a
   * leftover file, which is not a difference a reader should have to
   * infer from the path.
   */
  | {
      unit: "stale";
      /** The harness root the path sits in. */
      root: string;
      /** The stale path, relative to the destination. */
      path: string;
      /** What the stale path is. */
      kind: StaleKind;
    }
  /**
   * A component the marketplace layout has no place for, named rather than
   * dropped.
   *
   * A pack has a place for skills, for commands on a root whose
   * [`crate::publish::plugin_format_carries_commands`] is `true`, and for
   * hooks on a root whose [`crate::publish::plugin_format_carries_hooks`]
   * is. Everything else is named here rather than dropped; what a build
   * must not do is leave silently. This is the same fact
   * [`crate::publish::PublishReport::not_carried`] reports on the other
   * path, in this report's own vocabulary.
   *
   * `root` is the root that cannot carry it — a command on Codex, say.
   * `None` when no root can, as for an agent: the reason is the layout's,
   * so it is listed once. A member `tc-targets` narrowed away from a root
   * is not named there; the author asked for that.
   */
  | {
      unit: "not-carried";
      /** The root that cannot carry the component, or `None` when no root can. */
      root: string | null;
      /** The component's path in the vault. */
      path: string;
      /** The component's kind. */
      kind: string;
    };

/**
 * One unit's outcome. `check` speaks `ok`/`drift`; `build` speaks
 * `written`/`unchanged` — the same comparison, two verbs.
 */
export type UnitStatus = "ok" | "drift" | "written" | "unchanged";

/**
 * A plugin whose members changed since it was last published here, with its
 * own `tc-version` unmoved since — the callout
 * [`UnitStatus::version_bump_suggestion`] carries so a publish screen can
 * offer a one-click bump.
 *
 * Not a sixth [`PublishState`]: the state stays `stale`, exactly as it would
 * without this. This is a suggestion about what to do next, not a verdict
 * about the destination.
 *
 * # Where "the version at the last publish" comes from
 *
 * The manifest records no version of its own — adding one would be a schema
 * bump for a fact the destination already carries. A plugin's pack manifest
 * (`plugin.json`) is written with whatever `tc-version` was current at
 * publish time, so the installed file's own `"version"` field IS that
 * record, read back rather than tracked twice.
 */
export interface VersionBumpSuggestion {
  /** The note's current `tc-version`. */
  current_version: string;

  /**
   * The `version` the installed pack manifest carries. Equal to
   * `current_version` by construction — a suggestion exists exactly
   * because nothing moved to answer the members having changed.
   */
  published_version: string;
}

/**
 * What a stale path is, which decides how much a reader should care.
 *
 * The swap removes all three the same way. They are not the same news: a
 * plugin is a whole pack the marketplace stops carrying, a file is one
 * leftover, and a directory is a shape the destination kept after its
 * contents went. Reported separately rather than left to be read off the
 * path, which only says `plugins/<name>` for the first of them by
 * coincidence of layout.
 */
export type StaleKind = "plugin" | "file" | "empty-dir";

/**
 * What crosses as `request_json` for [`adopt_skills`]: the core's
 * [`AdoptRequest`], flattened, plus the namespace stem this layer adds.
 */
export interface AdoptRequest {
  /**
   * Absolute path to what is being adopted: a skill directory (holds a
   * `SKILL.md`), a plugin directory (holds `skills/`), or a directory of
   * skill directories.
   */
  source: string;

  /** Absolute path to the vault root. */
  vault_root: string;

  /**
   * The content root written under — the vault root when `None`, which is
   * the same root [`crate::discover::discover_components`] scans by default.
   * The two must name the same tree: an adoption the scan cannot find is an
   * import that silently went nowhere.
   *
   * This is a *content* root, not a plugins directory. Adoption spells the
   * `plugins/<plugin>/skills/` levels under it, so a vault gets
   * `<vault>/plugins/adopted/skills/…` and a root configured to `library/`
   * gets `library/plugins/adopted/skills/…` — each one a tree a scan from
   * that root reads.
   */
  skills_root?: string;

  /**
   * The plugin group stamped as `tc-plugin`;
   * [`DEFAULT_ADOPTED_PLUGIN`] when `None`. Validated with the skills
   * spec's name rule — it becomes a directory name.
   */
  plugin?: string;

  /**
   * What [`Self::source`] is CALLED in `tc-source`, when the path is not
   * the honest answer.
   *
   * A source fetched from a repository lives in a cache directory whose
   * path says nothing about where the skill came from and will not
   * survive a cache sweep. The caller that fetched it knows the durable
   * spelling — `<url>@<sha>` — and hands it over here. The re-adopt
   * comparison reads this too, so a note stamped with a URL is compared
   * against that URL rather than against the checkout it happens to sit
   * in this run.
   *
   * `None` stamps the source path, which is what a local adoption wants.
   */
  source_label?: string;

  /**
   * The harness layout stamped as `tc-format` — `claude`, `codex`, and
   * the rest of [`crate::skill::RUNTIME_DIRS`]'s second column.
   *
   * `None` derives one from the source path, so a caller that knows the
   * answer (a picker naming the harness) states it and a caller that does
   * not gets the heuristic. See [`detect_format`].
   */
  format?: string;

  /**
   * Further roots to cross-reference for `tc-also-at`: every other place
   * this machine holds the same skill. Three outcomes, like
   * [`Self::targets`] — see the module doc's `tc-also-at` row.
   */
  also_scan?: string[];

  /**
   * What lands in `tc-targets`, with the key's own three-outcome contract:
   * `None` writes no key (every destination), an empty list writes `[]`
   * (nowhere), names are validated against [`KNOWN_TARGETS`].
   */
  targets?: string[];

  /**
   * Adopt only these skills, matched by source directory basename or
   * source-relative path. A name that matches nothing is refused.
   */
  skills?: string[];

  /**
   * Vault notes whose replacement the caller has explicitly acknowledged,
   * and which this run may therefore overwrite.
   *
   * Per note and named, never a run-wide force — the same rule and the
   * same spelling as [`crate::publish::PublishRequest::overwrite`]. A note
   * matches by its entry path: the absolute spelling the report prints, or
   * that path relative to the vault root or the content root.
   */
  overwrite?: string[];

  /** Write, or classify only. Absent on the wire means [`AdoptMode::Write`]. */
  mode?: AdoptMode;

  /**
   * The timestamp stamped as `tc-adopted-at`, supplied by the caller —
   * the layer that has a clock. See the module doc.
   */
  adopted_at: string;

  /**
   * The vault's frontmatter namespace, as a stem. Absent means
   * [`Namespace::default`]. It decides how the provenance keys the adoption
   * stamps are spelled, so a vault configured to `x` gets `x-source` and
   * reads it back as its own.
   */
  namespace?: string;
}

/**
 * Whether an adoption writes, or only reports what it would write.
 *
 * The same shape as [`crate::publish::PublishMode`], for the same reasons:
 * one code path, previewing a property of the request so it rides the wire,
 * and a default that does the thing harder to undo rather than the thing
 * that silently does nothing.
 */
export type AdoptMode = "write" | "dry-run";

/**
 * Every skill the adoption considered, sorted by name. A refused skill is
 * still a line — a silent skip is how an import quietly loses half its
 * skills.
 */
export interface AdoptReport {
  /** One entry per skill considered, sorted by name. */
  skills: AdoptedSkill[];
}

/** One line of an [`AdoptReport`]. */
export interface AdoptedSkill {
  /**
   * The adopted name: the source frontmatter's `name` slugified, or the
   * source directory's basename where the frontmatter is silent.
   */
  name: string;

  /** The plugin it was grouped under — stamped as `tc-plugin`. */
  plugin: string;

  /** Whether the source carried resources beside its `SKILL.md`. */
  bundle: boolean;

  /** The source directory this skill was read from. */
  source_dir: string;

  /**
   * Where the entry note landed (or would land):
   * `<content-root>/plugins/<plugin>/skills/<name>/<name>.md`.
   */
  entry_path: string;

  /** What the adoption did, or would do, with this skill. */
  status: AdoptStatus;

  /**
   * Why. Always set on [`AdoptStatus::Refused`]; also set on an
   * [`AdoptStatus::Unchanged`] the note's own edits produced, and on an
   * [`AdoptStatus::Updated`] that an acknowledged overwrite forced, so a
   * discarded edit is stated rather than silent.
   */
  reason: string | null;
}

/** What happened to one skill. */
export type AdoptStatus = "adopted" | "updated" | "unchanged" | "refused";

/**
 * What crosses as `request_json` for [`status_of`]: the core's
 * [`StatusRequest`], flattened, plus the namespace stem this layer adds.
 */
export interface StatusRequest {
  /** Path of the skill's note. */
  skill_path: string;

  /** Root of the destination to compare against. */
  destination_root: string;

  /** The runtime target to project for. */
  target: string;

  /** Root of the vault, when the caller knows it. */
  skills_root?: string;

  /**
   * The vault's frontmatter namespace, as a stem. Absent means
   * [`Namespace::default`], exactly as on [`WireRequest`].
   */
  namespace?: string;
}

/**
 * The request each export deserializes, by the name JavaScript calls it.
 */
export interface WasmRequests {
  publishSkill: PublishRequest;
  discoverComponents: DiscoverRequest;
  exportSkills: ExportRequest;
  adoptSkills: AdoptRequest;
  statusOf: StatusRequest;
}

/**
 * The report each export serializes back.
 */
export interface WasmResponses {
  publishSkill: PublishReport;
  knownTargets: string[];
  discoverComponents: DiscoveryReport;
  exportSkills: ExportReport;
  adoptSkills: AdoptReport;
  statusOf: UnitStatus;
}

/**
 * Exports with no JSON on either side, so nothing here can drift for them.
 * `validateNamespace(stem: string): void` is the whole signature.
 */
export type WasmExportsWithoutJson = "validateNamespace" | "canonicalTarget" | "publishableKinds";

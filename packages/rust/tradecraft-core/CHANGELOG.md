# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.39.1] - Unreleased

First public release. A file-canonical model of a vault of markdown skill notes: scan it, validate
each note against the Agent Skills specification, and publish or build it into each coding-agent
tool's own on-disk format, through a filesystem seam that also runs under WebAssembly. The crate was
developed as `agent-adapt-core`; it is published as `tradecraft-core`, imported as
`tradecraft_core`.

### Added

- `authoring::draft_refusal_for`. A hook note that cannot be rendered is refused when it is written.

### Changed

- The crate is named `tradecraft-core` (`tradecraft_core` in code). Replace `agent-adapt-core` and
  `agent_adapt_core`.
- The dependencies are the published crates: `agent-adapt` 0.19, `markdown-link` 0.5 (it replaces
  `wikilink`), `path-guard` 0.3, `yaml-splice` 0.3 and `frontmatter-lossless` 1.1. `yaml-splice`'s
  `Value` appears in `authoring::FieldEdit`.
- `assert_destination_allowed` and the other destination checks refuse an empty or relative path
  with `refused: unsafe-path`. `path-guard` 0.3 compares absolute paths only.
- The crate turns on `serde_json`'s `preserve_order` feature. A parsed hooks
  file or manifest keeps its source order, so reports list entries as the author wrote them.

### Known limitations

- Windows is not supported yet. The crate builds there, but its tests are not run on Windows.

## History before the first public release

These versions were never published. They were developed in a private repository under the
name `agent-adapt-core`, and are rebuilt from its git history.

### [0.39.0] - 2026-10-16 (unpublished)

#### Changed

- Breaking: ExportUnit::NotCarried gains field root; builds name members a root cannot carry per
  root.

### [0.38.2] - 2026-10-11 (unpublished)

#### Fixed

- A skill-call escape drops its backslash only for a known skill.

### [0.38.1] - 2026-10-11 (unpublished)

#### Fixed

- `computed_skill_dirs` accepts `cursor` and `pi`, and refuses targets that render no skills.

### [0.38.0] - 2026-10-11 (unpublished)

#### Changed

- Breaking: assert_destination_allowed takes a &dyn Vfs first; Vfs gains defaulted read_link. Path
  guard resolves links.

### [0.37.1] - 2026-10-11 (unpublished)

#### Fixed

- Code-span lexing moved to a dependency; compile behaviour is unchanged.

### [0.37.0] - 2026-10-10 (unpublished)

#### Removed

- Breaking: Target gemini-cli removed from KNOWN_TARGETS and publish; antigravity added;
  RUNTIME_DIRS drops .gemini.

### [0.36.0] - 2026-10-06 (unpublished)

#### Changed

- Breaking: ReasonToken::EmptyPack renamed EmptyPlugin (token string changes).

### [0.35.3] - 2026-10-06 (unpublished)

#### Added

- Re-exports Diagnostic, DiagnosticCode, DiagnosticScope and Severity from agent_adapt.

### [0.35.2] - 2026-10-06 (unpublished)

#### Added

- Adds export::marketplace_manifest_path and plugin_manifest_path.

### [0.35.1] - 2026-10-06 (unpublished)

#### Fixed

- Heading selectors keep a trailing `#` that is part of the heading text.

### [0.35.0] - 2026-10-05 (unpublished)

#### Changed

- Breaking: render_plugin_manifest takes a new hooks argument; ExportRequest gains pub field hooks.
  Adds hooks_file module.

### [0.34.0] - 2026-10-02 (unpublished)

#### Changed

- Breaking: a hand-written skill call (`/plugin:skill`, `$plugin:skill`) in a skill or command body
  is now refused with `literal-skill-call`. It was a warning before.

### [0.33.0] - 2026-10-02 (unpublished)

#### Changed

- Breaking: PluginDialect gains Pi; KNOWN_TARGETS gains pi.

### [0.32.0] - 2026-10-02 (unpublished)

#### Changed

- Breaking: `CompileSource`, `Closure`, `RelatedSplit` and `ManifestEntry` gained a `calls` field.
  Added `CallContext`, `SkillIndex` and `SkillNaming` for rendering skill calls per runtime.

### [0.31.0] - 2026-09-26 (unpublished)

#### Changed

- Breaking: MarketplaceConfig gains pub field shim_target; MarketplaceSettings gains shim_target.
  Adds DEFAULT_SHIM_TARGET.

### [0.30.0] - 2026-09-26 (unpublished)

#### Changed

- Breaking: ExportRequest gains pub field assets; adds AssetSpec.

### [0.29.2] - 2026-09-26 (unpublished)

#### Added

- Adds is_skill_entry, SKILL_ENTRY and MISSING_DESCRIPTION_REASON; SKILL.md entries are recognised
  in discovery.

### [0.29.1] - 2026-09-22 (unpublished)

#### Added

- Adds settings module: parse_project_marketplace, ProjectMarketplace, MarketplaceSettings.

### [0.29.0] - 2026-09-22 (unpublished)

#### Changed

- Breaking: DiscoveredComponent gains description_filled; DiscoveryReport and ExportReport gain
  warnings; MarketplaceConfig gains require_descriptions.

### [0.28.0] - 2026-09-22 (unpublished)

#### Changed

- Breaking: MarketplaceConfig gains pub field license.

### [0.27.0] - 2026-09-20 (unpublished)

#### Changed

- Breaking: MarketplaceConfig gains pub field description.

### [0.26.0] - 2026-09-20 (unpublished)

#### Changed

- Breaking: ExportUnit::Stale gains field kind; PluginDialect gains Cursor; ExportRequest gains
  harnesses field. Adds StaleKind and root_trees.

### [0.25.4] - 2026-09-18 (unpublished)

#### Fixed

- Discovery no longer walks the trash folder.

### [0.25.3] - 2026-09-18 (unpublished)

#### Added

- Adds semver module (next_version, BumpLevel) and authoring::read_field; version bump rewrites
  ap-version.

### [0.25.2] - 2026-09-18 (unpublished)

#### Fixed

- Plugin manifests render `author` as an object.

### [0.25.1] - 2026-09-18 (unpublished)

#### Added

- Adds authoring module: note placement, create, rename, move, delete and convert plans.

### [0.25.0] - 2026-09-13 (unpublished)

#### Changed

- Breaking: DiscoveredComponent gains field hook; PublishOutcome and ReasonToken gain Overwritten.
  Adds DiscoveredHook, kind_has_renderer.

### [0.24.1] - 2026-09-11 (unpublished)

#### Added

- Adds name_refusal, description_refusal, compatibility_refusal and the length constants; name cap
  loosened from 63 to 64 characters.

### [0.24.0] - 2026-09-10 (unpublished)

#### Changed

- Breaking: ExportUnit::Plugin gains field version_bump_suggestion; status::UnitStatus gains the
  same field. Adds VersionBumpSuggestion.

### [0.23.1] - 2026-09-10 (unpublished)

#### Added

- Adds compile::related_of, RelatedSplit; vault::bundle_root made public.

### [0.23.0] - 2026-09-10 (unpublished)

#### Changed

- Breaking: SkillContent gains pub fields compatibility, license and metadata.

### [0.22.0] - 2026-09-10 (unpublished)

#### Changed

- Breaking: EntityKind gains variant Hook; KIND_DIRS gains hooks. Adds project_plugin_hooks,
  plugin_format_carries_hooks.

### [0.21.0] - 2026-09-10 (unpublished)

#### Changed

- Breaking: project_command takes a new overrides_target argument; SkillContent, VaultFrontmatter
  and PublishReport gain fields; ReasonToken gains UnknownOverrideKey and RedundantOverride.
  Per-target overrides added.

### [0.20.0] - 2026-09-10 (unpublished)

#### Changed

- Breaking: AdoptRequest gains pub fields also_scan, format, source_label. Adds detect_format,
  harness_dirs, user_harness_dirs, manager_owned_trees.

### [0.19.3] - 2026-09-07 (unpublished)

#### Added

- Adds plugin_format_carries_commands; a pack publish carries commands where the format has a slot.

### [0.19.2] - 2026-09-07 (unpublished)

#### Added

- canonical_target made public; adds canonical_targets.

### [0.19.1] - 2026-09-07 (unpublished)

#### Changed

- Commands publish to every harness with a command format; KNOWN_TARGETS gains copilot and
  github-copilot.

### [0.19.0] - 2026-09-06 (unpublished)

#### Changed

- Breaking: SkillContent gains pub fields arguments and argument_names; VaultFrontmatter gains
  arguments. Skills declare their arguments.

### [0.18.0] - 2026-09-06 (unpublished)

#### Removed

- Breaking: publish_plugin removed (also from the root re-export).

### [0.17.1] - 2026-09-01 (unpublished)

#### Fixed

- `user_root` finds the home directory through the renderer's user anchor.

### [0.17.0] - 2026-08-31 (unpublished)

#### Changed

- Breaking: discover_components returns DiscoveryReport instead of Vec<DiscoveredComponent>; adds
  SkippedNote and default_name.

### [0.16.0] - 2026-08-31 (unpublished)

#### Changed

- Breaking: AdoptStatus gains Unchanged and Updated; AdoptRequest.force: bool replaced by overwrite:
  Vec<String>.

### [0.15.0] - 2026-08-31 (unpublished)

#### Changed

- Breaking: PublishedFile gains pub field outcome (PublishOutcome); adds PublishOutcome enum.

### [0.14.0] - 2026-08-30 (unpublished)

#### Changed

- Breaking: PublishedFile.reason changes from Option<String> to Option<PublishReason>; adds
  ReasonToken and PublishReason.

### [0.13.0] - 2026-08-29 (unpublished)

#### Changed

- Breaking: ExportUnit gains variant NotCarried; PublishReport gains not_carried field.

### [0.12.4] - 2026-08-29 (unpublished)

#### Added

- Adds projection::project_command; a command note publishes where a command layout exists.

### [0.12.3] - 2026-08-29 (unpublished)

#### Added

- Adds export::render_plugin_manifest and PluginDialect; a plugin publishes to a destination as a
  pack.

### [0.12.2] - 2026-08-29 (unpublished)

#### Added

- Adds projection::project_agent; an agent note publishes.

### [0.12.1] - 2026-08-29 (unpublished)

#### Added

- Adds status module: status_of, units_depending_on, PublishState, StatusRequest.

### [0.12.0] - 2026-08-29 (unpublished)

#### Changed

- Breaking: PublishRequest gains pub fields overwrite and published_at; publish records a manifest
  and refuses to overwrite files it did not write.

### [0.11.1] - 2026-08-29 (unpublished)

#### Fixed

- `publish_skill` compiles embeds and links, so an installed skill is one a harness can read.

### [0.11.0] - 2026-08-29 (unpublished)

#### Changed

- Breaking: compile_projection returns BTreeMap<String, Closure> instead of (); CompiledNote gains
  closures field; links to nothing are no longer refused.

### [0.10.1] - 2026-08-29 (unpublished)

#### Added

- Adds manifest module: DestinationManifest, read_manifest, write_manifest.

### [0.10.0] - 2026-08-28 (unpublished)

#### Changed

- Breaking: assert_destination_allowed_for_vault now takes a &dyn Vfs first; Vfs gains defaulted
  sees_links; vault rail resolves links on every write path.

### [0.9.1] - 2026-08-28 (unpublished)

#### Added

- Adds guard::assert_destination_allowed_for_vault; publish compares write paths, not only the root.

### [0.9.0] - 2026-08-26 (unpublished)

#### Changed

- Breaking: DiscoveredComponent and VaultFrontmatter gain identity field (ContainerIdentity);
  MarketplaceConfig.name is now Option<String>. Adds folder_placement and FolderPlacement.

### [0.8.1] - 2026-08-26 (unpublished)

#### Fixed

- Publish and adopt write the `plugins/<plugin>/skills` layout. `AdoptRequest.skills_root` is now a
  content root, not a plugins directory.

### [0.8.0] - 2026-08-26 (unpublished)

#### Changed

- Breaking: ExportRequest gains pub field marketplace; one export now builds one marketplace.

### [0.7.0] - 2026-08-25 (unpublished)

#### Changed

- Breaking: folder_kind signature changed (vfs dropped, content_root); discover_components takes
  content_root; EntityKind gains Marketplace; DiscoveredComponent gains marketplace field.

### [0.6.0] - 2026-08-25 (unpublished)

#### Changed

- Breaking: PublishRequest gains pub field skills_root; adds discover::folder_kind and the publish
  kind gate.

### [0.5.1] - 2026-08-25 (unpublished)

#### Added

- Adds KindSource::as_str.

### [0.5.0] - 2026-08-25 (unpublished)

#### Changed

- Breaking: DiscoveredSkill and discover_skills renamed to DiscoveredComponent and
  discover_components; EntityKind gains Command and Agent; KIND_DIRS added.

### [0.4.1] - 2026-08-23 (unpublished)

#### Added

- discover::slugify becomes public.

### [0.4.0] - 2026-08-22 (unpublished)

#### Changed

- Breaking: CoreError gains variant SwapFailed (exhaustive matches break). Adds export module:
  export_skills, ExportRequest, ExportReport.

### [0.3.2] - 2026-08-22 (unpublished)

#### Added

- Adds adopt module: adopt_skills, AdoptRequest, AdoptReport, rewrite_to_wikilinks.

### [0.3.1] - 2026-08-22 (unpublished)

#### Added

- Added the compile pass: `compile_note`, `compile_projection`, `CompileSource` and `CompiledNote`.

### [0.3.0] - 2026-08-22 (unpublished)

#### Changed

- Breaking: Vfs trait gains required methods rename and remove (implementors break);
  VaultFrontmatter gains pub field plugin. Adds discover module, PlannedOp, Vfs::is_symlink.

### [0.2.1] - 2026-08-16 (unpublished)

#### Added

- Adds guard::resolve_write_path and a default Vfs::canonicalize; write-path containment now
  resolves links.

### [0.2.0] - 2026-08-16 (unpublished)

#### Changed

- Breaking: scan_root, scan_roots and read_detail now take a &dyn Vfs first; project_skill now takes
  a &Namespace; adds frontmatter, namespace, publish, vault and vfs modules.

### [0.1.0] - 2026-08-08 (unpublished)

#### Added

- Initial API: corpus roots, the skill scan, projection, publish guard rails and `CoreError`.

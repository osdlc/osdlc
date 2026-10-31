# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.19.3](https://github.com/osdlc/osdlc/compare/agent-adapt/v0.19.2...agent-adapt/v0.19.3) - 2026-10-31

### Other

- Remove the skillwright code that moved to osdlc/skillwright ([#556](https://github.com/osdlc/osdlc/pull/556))

## [0.19.2](https://github.com/osdlc/osdlc/compare/agent-adapt/v0.19.1...agent-adapt/v0.19.2) - 2026-10-29

### Other

- Rename the Tradecraft CLI to skillwright ([#546](https://github.com/osdlc/osdlc/pull/546))

## [0.19.1] - Unreleased

First release from this repository. `agent-adapt` is a Rust library for authoring coding-agent
assets (skills, agents, commands, hooks, scripts and MCP server config) in one
host-neutral model. It renders that model into the on-disk format each supported
runtime expects.

### Added

- Constructors for the types that are now `#[non_exhaustive]`:
  `Hook::new`, `RuntimePaths::new` and `RuntimeCapabilities::new`, beside the
  existing `Skill::new`, `Command::new` and `Hook::command`.

### Changed

- **Breaking:** `Error`, `RuntimeId`, `RuntimePaths`, `Skill`, `Command`, `Hook`
  and `RuntimeCapabilities` are `#[non_exhaustive]`. Outside the crate, build
  them with their constructors rather than struct literals, and give a `match`
  on `Error` or `RuntimeId` a `_` arm. New fields and variants are then not
  breaking changes.
- **Breaking:** `capabilities::all()` is now `capabilities::all_declarations()`,
  so it no longer clashes with `runtimes::all()` in a `use`.
- **Breaking:** the `install::install_skill`, `install_agent`, `install_hooks`,
  `install_script` and `install_mcp_server` helpers honour their `scope`
  argument. `Scope::User` writes under the home directory (`install::user_anchor`)
  at the runtime's user-scope path and ignores `project_root`. It is an error
  when no home directory is set. Before, every call installed at project scope.
- `Marketplace` and `DiagnosticCode` are marked experimental. They may change in
  a minor release.

### Removed

- **Breaking:** the helpers the built-in runtimes share are no longer public:
  the `runtimes::standard` module, and `render::render_command_md_reporting`,
  `render::render_hooks_json_reporting` and `render::render_skill_md_reporting`.
  The runtime renderers give the same output.
- **Breaking:** the items the runtimes build their capability declarations from
  are no longer public: `capabilities::behaviours`, `derived_fields`,
  `derived_assets`, `derived_tools`, `derived_override_keys`, `override_keys`,
  `harness_key`, `OBSERVED`, `HOOKS_OBSERVED`, `UNVERSIONED`,
  `OVERRIDE_KEYS_OBSERVED`, `AGENT_SKILLS_SPEC`, `HOOK_EVENT_VOCABULARY`,
  `CODEX_ONLY_HOOK_EVENT_VOCABULARY` and `HARNESS_SURVEY`, and
  `skill_call::SKILL_CALL_OBSERVED`. Every claim, with its evidence, is still
  read through `capabilities::all_declarations()` and `capabilities::matrix`.
- `runtimes::redundant_skill_overrides` is hidden from the docs and is outside
  the semver promise.

### Fixed

- `RuntimeId::skill_call` refuses a name or namespace holding any character
  outside `[A-Za-z0-9_.-]`, not only `:` or whitespace. Its documented contract
  was always a valid skill name, and these characters were never valid in one,
  so the looser check was the bug. A caller passing such a name gets an error.

## History before the first public release

Versions 0.1.1, 0.2.0 and 0.3.0 were published to crates.io from an earlier
repository (latest: 0.3.0). The versions after
0.3.0 were never published. They are rebuilt from the git history, one version
per change.

### [0.19.0] - 2026-10-10 (unpublished)

#### Changed

- **Breaking:** Antigravity (`agy`) replaces Gemini CLI, with no aliases.
  `RuntimeId::GeminiCli` (`"gemini-cli"`) is now `RuntimeId::Antigravity`
  (`"antigravity"`), and `runtimes::GeminiCli` is `runtimes::Antigravity`.
  Skills land in `.agents/skills/` (project) and
  `~/.gemini/antigravity-cli/skills/` (user). MCP config is
  `.agents/mcp_config.json` / `~/.gemini/config/mcp_config.json`.
  `mcp::render::render_gemini_json` is now `render_antigravity_json`, which
  writes `serverUrl` for HTTP servers. Read from
  <https://antigravity.google/docs/cli/gcli-migration> and
  <https://antigravity.google/docs/cli/headless> on 2026-10-09.
- **Breaking:** commands, hooks, agents and scripts are no longer rendered for
  Antigravity, which documents no format for them. `command_renderer_for`,
  `hook_renderer_for`, `agent_renderer_for` and `script_renderer_for` return
  `None` for it, and every hook event is `rejected`.

#### Removed

- **Breaking:** `render::render_command_toml`, `render_command_toml_reporting`
  and `runtimes::standard::render_command_toml`. Gemini CLI's TOML command format
  was their only user.
- **Breaking:** `capabilities::GEMINI_ONLY_HOOK_EVENTS` and its evidence record.
  The hook-event union is 34, not 37.

### [0.18.0] - 2026-10-06 (unpublished)

#### Added

- `model::Marketplace`: the container one level above `Plugin`, naming a
  collection of plugins under one identity (`display_name`, `owner`, `author`,
  `plugins`). It holds the data only; this crate does not render a marketplace
  manifest from it yet.

#### Changed

- **Breaking:** `Pack` is now `Plugin` and `PackBundle` is now `PluginBundle`.
  `compose::render_pack*`, `install::install_pack*` and
  `render::render_pack_manifest` are now `*_plugin*`. No aliases; rename at the
  call site.
- **Breaking:** `PluginBundle`'s metadata field serializes as `plugin`, not
  `pack`. A bundle saved as `{"pack": {...}}` no longer deserializes; rewrite it
  with the new key.

### [0.17.1] - 2026-10-06 (unpublished)

#### Added

- `Diagnostic`, `DiagnosticCode`, `DiagnosticScope` and `Severity`: a structured
  report of a non-fatal problem, such as a tool with no counterpart on a runtime
  or a redundant override.
- `Support` serializes and deserializes, in kebab case.

### [0.17.0] - 2026-10-05 (unpublished)

#### Added

- Cursor renders hooks to `.cursor/hooks.json` in Cursor's own
  `{ "version": 1, "hooks": {…} }` shape, through the new
  `render::render_cursor_hooks_json`. `hook_renderer_for(RuntimeId::Cursor)`
  returns `Some`.
- `runtimes::standard::wrap_hooks_file`, `Support::is_carried`,
  `render::hook_refusal` (why a runtime's hooks file cannot carry a hook, without
  rendering), `capabilities::HOOKS_OBSERVED` and `capabilities::BEHAVIOURS`.

#### Changed

- **Breaking:** `RuntimeCapabilities` gains a `behaviours` field, so a struct
  literal outside the crate must set it. The first behaviour is
  `stop-continue`: whether a `Stop` hook's output can keep the agent working.
- Cursor's hook-event claims move from `ignored` to `translated` for every event
  Cursor documents (<https://cursor.com/docs/hooks>, read 2026-10-05). Codex
  CLI's hook claims cite <https://developers.openai.com/codex/hooks>.

### [0.16.0] - 2026-10-01 (unpublished)

#### Added

- `RuntimeId::skill_call(namespace, name)`: the token a user types to invoke a
  skill on that runtime, such as `/ns:name` for Claude Code or `$ns:name` for
  Codex CLI. `RuntimeId::skill_call_syntax` returns the `SkillCallSyntax` behind
  it, with a source and a read date. `SkillCallError` says why a call was
  refused.
- `runtimes::Pi`: skills only, into `.pi/skills/<slug>/SKILL.md`.

#### Changed

- **Breaking:** `RuntimeId` gains a `Pi` variant. Exhaustive matches need a new
  arm. `runtimes::all()` returns nine runtimes.

### [0.15.2] - 2026-09-23 (unpublished)

#### Fixed

- `hooks.json` output sorts its keys at every depth, so the output is stable.

### [0.15.1] - 2026-09-22 (unpublished)

#### Fixed

- A frontmatter scalar whose plain form would break YAML (`: `, `#`, a leading
  indicator, a trailing `:`, edge whitespace) is double-quoted, and
  `FrontmatterBuilder::scalar_quoted` escapes its value.

### [0.15.0] - 2026-09-20 (unpublished)

#### Changed

- **Breaking:** `RuntimeId` gains a `Cursor` variant, and `runtimes::Cursor`
  renders skills. Cursor keeps `disable-model-invocation` and omits the other
  extension keys.
- **Breaking:** `CLAUDE_CODE_EXTENSION_FIELDS` is renamed
  `AGENT_SKILLS_EXTENSION_FIELDS`: the keys this crate renders that the Agent
  Skills specification does not define.

### [0.14.1] - 2026-09-13 (unpublished)

#### Added

- `render::render_role_md` and `render::role_path`. Both plugin compositions
  write each role as `roles/<slug>.md`; before, roles were silently dropped.
- `render::render_command_md_reporting`.

#### Fixed

- `render_command_md` applies `Command::overrides`; before, they were dropped.
- Tool references in a body are translated only as whole words.

### [0.14.0] - 2026-09-10 (unpublished)

#### Changed

- **Breaking:** `Skill` gains the `license`, `compatibility` and `metadata`
  fields of the Agent Skills specification.

### [0.13.0] - 2026-09-10 (unpublished)

#### Added

- `HookType` and `capabilities::hook_event_spelling`.

#### Changed

- **Breaking:** `Hook::command` is now `Option<String>`, and `Hook` gains
  `type`, `url`, `prompt`, `if`, `async` and `once`. Use `Hook::command(...)` to
  build a command hook.

### [0.12.0] - 2026-09-10 (unpublished)

#### Added

- Per-target overrides: `FrontmatterBuilder::apply_overrides`,
  `render_skill_md_reporting`, `render_hooks_json_reporting`,
  `runtimes::redundant_skill_overrides`, and the override-key claims
  (`capabilities::override_keys`, `derived_override_keys`, `harness_key`,
  `OVERRIDE_KEYS_OBSERVED`).

#### Changed

- **Breaking:** `Skill`, `Command` and `Hook` gain an `overrides` field, and
  `RuntimeCapabilities` gains `overrides`. Struct literals outside the crate
  must set them.

### [0.11.0] - 2026-09-09 (unpublished)

#### Added

- `capabilities::hook_events`, `CODEX_ONLY_HOOK_EVENTS` and the vocabulary
  evidence records. The capability vocabulary carries every hook event each
  runtime documents.

#### Changed

- **Breaking:** `capabilities::HOOK_EVENTS` is renamed `CLAUDE_HOOK_EVENTS`.

### [0.10.1] - 2026-09-08 (unpublished)

#### Added

- The `capabilities` module: every runtime declares what it does with each asset
  type, frontmatter field, tool, permission and hook event, with a source and a
  date. `RuntimeCapabilities`, `Claim`, `Evidence`, `Support`,
  `CapabilityMatrix` and `DeclaresCapabilities`.
- `runtimes::declaration_for`, `hook_renderer_for`, `mcp_renderer_for`,
  `script_renderer_for` and `RuntimeId::ALL`.

### [0.10.0] - 2026-09-07 (unpublished)

#### Added

- Commands publish to Codex CLI, Gemini CLI, OpenCode and GitHub Copilot, not
  only Claude Code. `render::CommandFields` names which optional keys a
  runtime's command format accepts. `runtimes::Copilot` renders commands only,
  to `.github/prompts/<slug>.prompt.md`.
- `render::ArgumentSite` (`Skill` or `Command`).

#### Changed

- **Breaking:** `render_arguments_section` takes an `ArgumentSite`.
  `render_command_md` takes `&CommandFields` instead of `&FrontmatterDialect`.
  `runtimes::standard::render_command` takes `fields` and `suffix`.
- **Breaking:** `RuntimeId` gains a `GithubCopilot` variant.

### [0.9.0] - 2026-09-06 (unpublished)

#### Added

- `Argument`, `render::derive_argument_hint`, `render::derive_argument_names`
  and `render::render_arguments_section`: skills and commands declare their
  arguments.

#### Changed

- **Breaking:** `Skill` and `Command` gain the `arguments` and `argument_names`
  fields.

### [0.8.1] - 2026-09-01 (unpublished)

#### Added

- `install::user_anchor`: the current user's home directory, the anchor for
  user-scope paths.

### [0.8.0] - 2026-08-29 (unpublished)

#### Added

- `Command`, `CommandCapability` and `render::render_command_md`: a command
  publishes where a runtime documents a command layout.

#### Changed

- **Breaking:** `RuntimePaths` gains a `commands_dir` field.

### [0.7.2] - 2026-08-29 (unpublished)

#### Added

- `runtimes::agent_renderer_for`, the agent peer of `skill_renderer_for`.

### [0.7.1] - 2026-08-24 (unpublished)

#### Fixed

- All runtimes share one tool registry instead of building their own.

### [0.7.0] - 2026-08-16 (unpublished)

#### Changed

- **Breaking:** rendered skill frontmatter conforms to the Agent Skills
  specification. `allowed-tools` is a space-separated string
  (`allowed-tools: Read Grep`), not a YAML list. Unmodelled keys go under
  `metadata:` instead of the top level, and a non-string value there is written
  as its JSON text. Gemini CLI, Codex CLI, OpenCode, Amp and the npm package
  target no longer emit `argument-hint`, `model`, `context`, `user-invocable` or
  `disable-model-invocation`. A reader of the old output must change.

#### Fixed

- A body that already ends in a newline no longer gains a second one, so
  parse-and-render round trips are byte-stable.

### [0.6.0] - 2026-08-16 (unpublished)

#### Added

- `runtimes::Portable`: a target for the Agent Skills specification itself,
  rendering `SKILL.md` into `.agents/skills/<slug>/`. Skills only.
- `AGENT_SKILLS_FIELDS` and `CLAUDE_CODE_EXTENSION_FIELDS`.

#### Changed

- **Breaking:** `RuntimeId` gains a `Portable` variant.

### [0.5.0] - 2026-08-09 (unpublished)

#### Security

- A peer resource could be written outside its skill directory: a path such as
  `../../etc/evil.sh` or `/absolute/evil.md` was joined with no containment
  check. Skill, agent and script renders now refuse such a path.

#### Added

- `paths::join_within`: joins a caller-supplied relative path onto a root and
  refuses anything that would escape it.

#### Changed

- **Breaking:** `Error` gains an `UnsafePath { path, reason }` variant, returned
  whenever a path is refused.

### [0.4.0] - 2026-08-09 (unpublished)

#### Changed

- **Breaking:** `naming::slugify_skill_name`, `render::render_skill_md` and
  `render::render_pack_manifest` return `Result`. A skill name that slugs to the empty string is
  refused; before, it published to `<skills_dir>/SKILL.md` and a second such skill overwrote the
  first.

### [0.3.0] - 2026-07-20

#### Added

- `Skill::annotations`: unrecognized frontmatter keys carried on the model and
  re-emitted by every skill render.
- `Skill::resources` and `SkillResource`: peer files rendered beside `SKILL.md`,
  with a per-file executable flag.
- `ExportedFile::executable` and the `ExportedFileType::Resource` variant.
- `runtimes::skill_renderer_for(id)` and `FrontmatterBuilder::raw_entry`.

#### Changed

- **Breaking:** `Skill` and `ExportedFile` gained public fields; struct literals
  must add them (`Skill::new` and `ExportedFile::text_file` are unaffected).
  `ExportedFileType` gained a `Resource` variant.

### [0.2.0] - 2026-04-07

#### Removed

- **Breaking:** the legacy `providers/` module (`AgentConfigProvider`,
  `ClaudeProvider`, `CodexProvider`, `GeminiProvider`, `all_providers`,
  `install_to_all`). `install::install_mcp_server` and the `runtimes::*`
  capability traits replace it.

### [0.1.1] - 2026-04-07

#### Added

- Initial crate: six runtime adapters, pack composition and install helpers.

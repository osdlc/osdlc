---
title: What is a plugin skill called in each harness?
description: How Claude Code, Codex, Cursor and Pi name, namespace and invoke a skill shipped in a plugin, and how one skill should name another.
retrieved: 2026-10-01
---

# What is a plugin skill called in each harness, and how should one skill name another?

## Why it matters

A publisher may build one skill source into packs for several harnesses. Skills often name other
skills, usually in Claude syntax written as literal text. If each harness spells a plugin skill
differently, a pack built for another harness tells the agent and the user to run commands that do
not exist there.

Two questions follow: what name to emit per target, and how a source should record "call that
skill" so a build can spell it per target.

## Answer

**The authored name, the runtime name, and the invocation syntax are three different values.
Only the first belongs in source.** Packaging a skill in a plugin does not give it a namespace
everywhere: Codex and Claude prefix the plugin name, Pi keeps one flat name space, and Cursor
documents no plugin namespace at all.

For a plugin `acme-tools` (manifest `name`) containing `skills/review/SKILL.md` with
`name: review`:

| Harness | Runtime name | User invocation | How the agent loads it | Confidence |
|---|---|---|---|---|
| Claude Code | `acme-tools:review` | `/acme-tools:review` | The `Skill` tool, by name | Docs + changelog |
| Codex | `acme-tools:review` | `$acme-tools:review` | Reads the advertised skill file | Source, not run |
| Cursor IDE | `review` | `/review`, or pick it from the `/` menu | Selected by description, or explicitly | Docs; collisions undocumented |
| Pi | `review` — the package name is never prepended | `/skill:review` | Model reads `SKILL.md`; the command inlines the body | Source, not run |

The prefixes `/`, `$`, and `/skill:` are invocation syntax. None of them belongs in a `name`
field. In Pi, `skill:` names the command family, not the owning package.

So:

1. **Source stays unqualified.** `name` equals the directory, lowercase ASCII letters, digits,
   and single hyphens, at most 64 characters.
2. **Never write `name: acme-tools:review`.** The Agent Skills spec forbids `:`. Codex
   prepends its namespace regardless and would produce `acme-tools:acme-tools:review`. Claude
   only stopped doubling it in 2.1.246.
3. **A reference to another skill is a value, rendered per target.** Logical skill
   `acme-tools/review` becomes `/acme-tools:review`, `$acme-tools:review`, `/review`, or
   `/skill:review` (or `/skill:acme-tools-review` if the Pi target prefixes for collisions).
4. **Pi and Cursor have no plugin namespace**, so collision avoidance there is the publisher's choice:
   emit `<plugin>-<skill>` as both directory and `name`, and check the 64-character limit on the
   result. Keep it a per-target policy, because Cursor's own first-party plugins use plain names
   such as `deslop`.
5. **Install identity is not a callable name.** Marketplace, version, `name@marketplace` ids,
   display names, and cache paths stay separate. Never derive an invocation from a cache path.
6. **User invocation and agent instruction differ.** A slash command is input syntax, not
   something an agent runs. When a skill tells the agent to use another skill, render that
   harness's loading mechanism (Claude's `Skill` tool; reading the file elsewhere). There is no
   universal `invoke_skill` API.

## Evidence

Retrieved or inspected 2026-10-01. "Source, not run" means read in the open-source repo at the
pinned commit; no fixture plugin was installed and no live invocation was tried in any product.

### Shared standard — agentskills.io

- Spec text for `name`: "Must be 1-64 characters. May only contain unicode lowercase
  alphanumeric characters (`a-z`, `0-9`) and hyphens (`-`). Must not start or end with a hyphen
  (`-`). Must not contain consecutive hyphens (`--`). Must match the parent directory name."
- `description` is 1–1024 characters; `compatibility` is 1–500.
- Source: <https://agentskills.io/specification>.

### Agent Plugins standard

- A cross-vendor plugin format, 1.0.0, published 2026-08-06 by maintainers from Amazon, Cursor,
  Microsoft, OpenAI, and Vercel. Root `plugin.json`, optional `skills/<name>/SKILL.md`, optional
  `mcp.json`, reverse-domain directories for client extensions. Covers skills and MCP only.
- Schema id: `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`.
- Read by Codex (source) and Cursor (docs).
- Sources: <https://agent-plugins.org/>, and secondary launch posts at
  <https://aaif.io/blog/from-skills-and-tools-to-portable-agent-plugins> and
  <https://developers.googleblog.com/agent-plugins-package-your-skills-tools-and-more/>. Only
  page summaries were read, not the spec text.

### Claude Code — docs and CHANGELOG, local CLI 2.1.286

- Name: "The command you type to invoke a skill comes from the frontmatter `name` field (if set),
  else the directory name." A `SKILL.md` at a plugin root has no directory fallback and needs
  `name`.
- Namespace: the plugins reference says "Claude Code namespaces every component under it", where
  "it" is the manifest `name`. `displayName` "isn't used for namespacing or lookup". When a
  marketplace entry's `name` differs, components still use the manifest name, while
  `enabledPlugins` uses the entry name.
- Without `plugin.json`, the plugin name comes from the marketplace entry, or from the directory
  under `--plugin-dir`.
- Layout: `.claude-plugin/plugin.json`; `skills/<name>/SKILL.md`.
- Pre-qualified names: changelog 2.1.246, "Fixed plugin skills whose frontmatter `name` already
  includes the `<plugin>:` prefix showing it doubled in the slash menu (e.g.
  `/plugin:plugin:skill`)". Earlier, 2.1.216 fixed such skills losing the prefix in autocomplete.
- Bare alias: the skills page says, of a plugin skill whose frontmatter `name` is `fancy`, "The
  bare `/fancy` also invokes the skill unless another command already uses that name". It does not
  say whether the bare name works for a plugin skill named by its directory, nor whether the
  model's `Skill` tool resolves a bare plugin name. The qualified name is the only safe form.
- `disable-model-invocation: true`: the model cannot invoke the skill, the user still can with
  `/name`, and the description is not loaded into context.
- Collisions: two plugins exporting `review` stay distinct as `a:review` and `b:review`. The
  same plugin name from two marketplaces has distinct install ids (`name@marketplace`) but an
  identical skill prefix. No tiebreak is documented.
- Sources: <https://code.claude.com/docs/en/skills>,
  <https://code.claude.com/docs/en/plugins-reference>,
  <https://code.claude.com/docs/en/plugins/marketplace-reference>,
  <https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md>.

### Codex — `openai/codex` at `57ac6f51639f7cad705a48ac4bd8073034a2f150`, local CLI 0.159.2

Paths are under `codex-rs/`.

- Name: frontmatter `name`, else the parent directory (`skills/src/parser.rs:64-69`,
  `ext/skills/src/loader/environment.rs:385-386`). Only the length is validated, against
  `MAX_NAME_LEN`, and a separate `MAX_QUALIFIED_NAME_LEN` applies after prefixing.
- Prefix: `format!("{namespace}:{base_name}")` (`ext/skills/src/loader/environment.rs:259`). The
  namespace is the nearest manifest's `name`, and nothing strips an existing prefix. A
  pre-qualified name doubling is inferred from this code, not observed.
- The model is told "Skills from this plugin are prefixed with `{skill_namespace}:`"
  (`core/src/plugins/render.rs:44`).
- Invocation: `$name` tokens are extracted from user text (`skills/src/selection.rs:30`).
  Structured `UserInput::Skill { name, path }` mentions resolve by path first.
- Manifests: the Agent Plugins root `plugin.json`, or legacy `.codex-plugin/plugin.json`
  (`core-plugins/src/manifest.rs:37-40`). Legacy discovery also accepts
  `.claude-plugin/plugin.json` and `.cursor-plugin/plugin.json`
  (`exec-server-protocol/src/protocol.rs:51-55`). Manifest-declared skill paths win; otherwise
  `skills/` is used (`core-plugins/src/loader.rs:1081-1100`).
- Duplicates: a `$name` mention needs exactly one enabled match and is otherwise skipped
  silently (`skills/src/selection.rs:136-150`). Another lookup path takes the first enabled match
  (`ext/skills/src/selection.rs:66-73`).
- Locations (`ext/skills/src/host_roots.rs`): user `~/.agents/skills`; `$CODEX_HOME/skills`,
  marked deprecated; repo `.codex/skills` and `.agents/skills` in each ancestor of the working
  directory.

### Cursor — docs and `cursor/plugins`, IDE only

- Name: "The skill's identity comes from the folder containing SKILL.md". The folder must match
  `name`, and `name` and `description` are required.
- Manifests: `.cursor-plugin/plugin.json`, or an Agent Plugins root `plugin.json`. Components
  come "from their default directories, or you can specify custom paths in the manifest". The
  page does not say whether custom paths replace or add to the defaults.
- Invocation: "Type `/` in Agent chat and search for the skill name". The first-party
  `cursor-team-kit` plugin ships `deslop`, called `/deslop`. Note that `/review` is a Cursor
  built-in (Bugbot), not a skill.
- Namespacing and collisions: not documented on the skills page, the plugins page, or the
  `cursor/plugins` README. No `plugin:skill` syntax appears anywhere.
- Locations: `.agents/skills`, `.cursor/skills`, `~/.agents/skills`, `~/.cursor/skills`, plus
  legacy `.claude/skills` and `.codex/skills`. Nested project directories are discovered too.
- CLI: the `cursor-agent` docs list rules, `AGENTS.md`, `CLAUDE.md`, and `mcp.json`, and do not
  mention skills or plugins. CLI parity is unknown.
- Sources: <https://cursor.com/docs/skills>, <https://cursor.com/docs/plugins>,
  <https://github.com/cursor/plugins>, <https://cursor.com/docs/cli/overview>. Read as fetch-tool
  summaries, so the quotes may be paraphrased.

### Pi — `earendil-works/pi` at `88ff80b986e34d4fbd1fa94a4df65c60ae964516`

Paths are under `packages/coding-agent/`.

- Name: `const name = frontmatterName || parentDirName;` (`src/core/skills.ts:322-323`).
- No package prefix: the collision map is keyed on the plain name (`skills.ts:432`). Package
  skills go through the same loader.
- Invocation: commands register as `skill:${skill.name}` (`src/core/agent-session.ts:3330`).
  `/skill:x` replaces the input with a `<skill name=… location=…>` block containing the body
  (`agent-session.ts:2100-2114`). An unknown name passes through unchanged. Otherwise the system
  prompt says "Use the read tool to load a skill's file when the task matches its description"
  (`skills.ts:365`).
- Package: `package.json` `pi.skills` if set, else the package's `skills/` directory
  (`src/core/pi-manifest.ts`, `package-manager.ts:2268-2282`).
- Duplicates: the first skill found wins, and Pi records a `collision` diagnostic naming both
  paths (`skills.ts:432-447`). User skills load before project skills.
- Validation: length ≤ 64, `^[a-z0-9-]+$`, no edge or double hyphens, all as warnings, and the
  skill loads anyway (`skills.ts:92-111`, `325-331`). There is no directory-match check. Only a
  missing description rejects a skill.
- Locations: `~/.pi/agent/skills`, `~/.agents/skills`, `<cwd>/.pi/skills`, and `.agents/skills`
  in each ancestor up to the git root (`package-manager.ts:468-487`, `2452-2560`).
- Install: `pi install ./dir` (loaded in place), `pi install git:github.com/o/r@ref`, or
  `pi install npm:@scope/pkg` (`docs/packages.md:12-14`). Installs are recorded in the `packages`
  array of `~/.pi/agent/settings.json`, or `.pi/settings.json` with `-l`.
- `package.json` is optional. A `pi` key lists resource paths, and globs are accepted. Without
  one, a conventional `skills/` directory makes the folder a package (`package-manager.ts`
  ~2235-2257). `name`, `version` and `keywords` are not required.
- No marketplace and no git subpath: a git package's root is the repository root. One repo that
  holds several packs installs as one package whose `pi.skills` lists them, or through a local
  path to one pack.
- A skill's base directory is given to the model: "References are relative to `<baseDir>`"
  (`agent-session.ts:2113`), so relative `scripts/` paths resolve.
- Run on `pi` 0.99.1, against a throwaway agent directory: a local package installed and appeared in
  `pi list`, both with and without `package.json`. Skill loading itself was not run.

### `.agents/skills` is the shared install root

Codex, Cursor, and Pi all read `~/.agents/skills` and project `.agents/skills`. Claude Code does
not. That root has no plugin, so a skill installed there is called by its bare name everywhere,
including Codex.

## Consequences

- **A skill reference in a source must be structured, not literal.** A build needs to know the
  text names a skill, so it can resolve the target, refuse a broken one, and spell it per
  target.
- **Emitted names stay bare for Claude, Codex, and Cursor.** A Pi target needs a decided
  collision policy.
- **Codex and Cursor both read the Agent Plugins root `plugin.json`**, which may let one tree
  serve both.

## Open

- **Cursor plugin collisions and aliases.** What happens when two plugins export `review`, and
  whether a plugin skill has any qualified form.
- **Cursor manifest paths.** Whether custom component paths replace or add to the default
  discovery.
- **Cursor CLI.** Whether `cursor-agent` loads skills and plugins the way the IDE does.
- **Claude `Skill` tool and bare names.** Whether the model-facing tool resolves a bare plugin
  name, and in which versions.
- **Same plugin name from two marketplaces.** An identical prefix in Claude and Codex with no
  documented tiebreak. The build can detect this; qualification does not solve it.
- **Releases versus main.** The Codex and Pi findings are pinned to a commit, not to any
  installed release. The Codex result was read, not run.

Before claiming support for a harness version, run harmless fixtures that only return a marker,
and record the version, manifest, skill file, discovered name, submitted invocation, and
returned marker:

| Fixture | Settles |
|---|---|
| `acme-tools/review`, directory equal to `name` | Baseline name and invocation |
| The same skill as a standalone `.agents/skills/review` | Whether packaging alone changes the name |
| Directory `review`, `name: inspect` | Precedence and aliases |
| `name: acme-tools:review` | Doubling, rejection, or normalization |
| Two plugins both exporting `review` | Namespace isolation and bare-name ambiguity |
| One plugin name from two marketplaces | Provenance collision |
| Plugin installed through a symlink | Whether manifest ancestry changes the namespace |
| `disable-model-invocation: true` | Explicit invocation still works |

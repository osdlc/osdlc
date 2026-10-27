# @osdlc/detect-harness

## 0.7.0

### Minor Changes

- da5e6a3: Behaviour change: `detect({ mode: 'project' })` now decides whether a path is inside the project with `@osdlc/path-guard`'s `nodeGuard.contains` (a new runtime dependency), which compares real paths. A path whose text is outside the project but whose real path is inside it (a symbolic link into the project) is now read; before, it answered "absent". A path that does not exist yet under a symbolic link out of the project still answers "absent". The plugin manifest and skill, command and agent readers use the same check for "inside the plugin folder".

### Patch Changes

- Updated dependencies [da5e6a3]
  - @osdlc/command-seam@0.14.0

## 0.6.0

### Minor Changes

- b835ae4: On Windows, `which('tool.exe')` now finds `tool.exe` on PATH. A name that already ends in a `PATHEXT` suffix is tried as given only; before, only `tool.exe.EXE` and the like were tried.
  Behaviour change (stricter): `which` and the default install probe search only absolute `PATH` entries. A relative entry is skipped instead of being resolved against the project root, so a binary the project ships is never reported as the install or run for `--version`; `which`'s `cwd` argument no longer affects a lookup. The default `makeRunner` now runs a bare name only from an absolute `PATH` entry. `which` now uses `@osdlc/command-seam`'s lookup, so on Windows a quoted `PATH` entry counts without its quotes, `Path` is read in any case, an empty `PATHEXT` means the default list, a drive-relative entry (`\bin`) is skipped, and a match needs only to be a file.
  Behaviour change (Windows only): `which` given an absolute path without a `PATHEXT` extension (`C:\tools\claude`) now tries that path with each `PATHEXT` suffix (`claude.COM`, `claude.EXE`, ...) and no longer tries the exact name; a path that already ends in a `PATHEXT` extension is tried as given. `PATHEXT` is read from the passed `env` (in any case), never from `process.env`.
  Behaviour change: an environment override (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `PI_CODING_AGENT_DIR` and the rest) that holds a relative path is now ignored and the default folder is used; before, it was resolved against the current directory, which can be the project. An absolute override is used as given, no longer normalized. Behaviour change: `detect()`'s default `home` is now `@osdlc/tiered-dirs`'s `homeDir` (a new runtime dependency): a relative `HOME` counts as unset and the OS account's home is used, and with no home at all home-based paths do not resolve; before, a relative `HOME` was resolved against the current directory.
  Behaviour change: `readPlugin` now finds and names a plugin's skills and commands with the same reader `detect()` uses for an installed plugin, so the two list the same ones. A `skills/<name>/SKILL.md` or `commands/<name>/SKILL.md` folder is now named by its frontmatter `name` when it sets one; before, always by the folder name. A flat `commands/<name>.md` is now dropped when a folder command already has that name (frontmatter name included); before, only a folder of the same folder name hid it. Folders of one command name are now one capability, the first by folder name.
  Behaviour change: `readPlugin` now follows a symbolic link to a skill or command folder, or to a flat command file, when its real path stays inside the plugin folder; before, a linked entry was skipped.
  Behaviour change: `readPlugin` no longer throws when `skills` or `commands` is a file rather than a folder, or when a `SKILL.md` is a folder; that entry is skipped, as `detect()` skips it. A file or folder that exists but cannot be read still throws.
  Behaviour change: of a plugin's skill folders that share a name (frontmatter `name`, else folder name), `detect()` and `readPlugin` now keep only the first by folder name; before, `detect()` listed each one and `readPlugin` could return two capabilities of one name.
  Behaviour change (stricter): a plugin's skill, command or agent entry whose real path leads out of the plugin folder's real path (a symbolic link to `~/.aws/credentials`, say) is no longer read or listed by `detect()` or `readPlugin`; before, `detect()` followed it in `full` mode and reported its name, description and, with `readContents`, its body. A link that stays inside the plugin folder is still followed.

### Patch Changes

- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
  - @osdlc/command-seam@0.13.0
  - @osdlc/frontmatter-lossless@1.1.2
  - @osdlc/tiered-dirs@0.5.0

## 0.5.0

### Minor Changes

- 9616994: Each skill, command and agent in the report now has `argumentHint`: the `argument-hint` front matter field, such as `[pr-number]`, or `null` when the file sets none. With `mode: 'project'` this lists the skills a repository ships, ready to show as tasks.
  
  An unquoted `argument-hint` is now read as the text the author typed, as Claude Code reads it, in the report and in the `./model` entry point's `argumentHint`. `[message]` used to lose its brackets, and a form that is not valid YAML, such as `[pr-number] [priority]` or `[--fix] <path>`, used to make the whole front matter unreadable, so the skill lost its name and description too. A hint that is not text, such as a block list, is now `null`.
  
  Front matter that is still not valid YAML no longer reads as empty: `name`, `description` and `argument-hint` are taken from their raw lines, and the other keys are dropped.
  
  **Breaking changes**
  
  - `Artifact` has a new required field, `argumentHint`. What to do: a custom provider that builds `Artifact` objects sets `argumentHint` to the hint text, or `null` when there is none.

### Patch Changes

- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
  - @osdlc/command-seam@0.12.0

## 0.4.5

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0

## 0.4.4

### Patch Changes

- Updated dependencies [910deca]
  - @osdlc/command-seam@0.10.0

## 0.4.3

### Patch Changes

- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
  - @osdlc/command-seam@0.9.0
  - @osdlc/frontmatter-lossless@1.1.1

## 0.4.2

### Patch Changes

- b9d583c: Drop the dependency on `@osdlc/path-guard`. The one function it used, `isInside`, is removed in `@osdlc/path-guard` 0.3.0, so the package now carries the same text check itself. Nothing changes for callers.

## 0.4.1

### Patch Changes

- Updated dependencies [ac5f0d1]
  - @osdlc/command-seam@0.8.0

## 0.4.0

### Minor Changes

- 636f264: The first release of `@osdlc/detect-harness` on npm. It finds the coding-agent harnesses on a machine and in a project, and reads what each has configured. It replaces `@osdlc/agent-plugin`, which was only ever a placeholder on npm.
  
  - `detect(options)` returns a `HarnessCatalog`: one `HarnessReport` per harness, for `claude`, `codex`, `cursor`, `opencode`, `pi` and `antigravity`. A report holds install facts, folders, the files read, plugins, marketplaces, skills, commands, agents, hooks, MCP servers, permissions, instruction files, sign-in evidence and diagnostics. Every field is always present; what a harness lacks is empty. The report schemas are exported (`HarnessCatalogSchema`, `HarnessReportSchema` and one per shape).
  - Read-only. `<binary> --version` runs only with `allowExec: true`, through `@osdlc/command-seam`. `mode: 'project'` reads project files only: no home folder, no system folder, no install probe and no sign-in evidence.
  - MCP secrets are redacted by default. `env` and `headers` values, and the user part and the query values of a `url`, read `"<redacted>"`. So do MCP `args` that look like secrets: the value of a `--flag` whose name contains `token`, `secret`, `key`, `password` or `auth`, a `KEY=value` arg whose key contains `token`, `secret`, `key` or `password`, an `Authorization:` header arg, a `Bearer <token>` arg, and the user part and query values of an arg that contains `://`. Pass `includeValues: true` to keep them.
  - Claude Code: settings at the user, project, local and managed scopes, with `settings.local.json` overriding `settings.json`; `~/.claude.json` (MCP servers and the `oauthAccount` key only); `.mcp.json` and `managed-mcp.json`; the plugin and marketplace registries; each enabled plugin's skills, commands, agents, hooks and MCP servers; user and project skills, commands and agents; `CLAUDE.md` files and rules folders. `CLAUDE_CONFIG_DIR` moves the user folder. An MCP server's `active` follows `.mcp.json` approval, `managed-mcp.json` exclusivity and name shadowing by scope.
  - Codex: MCP servers from `config.toml`, hooks from `hooks.json` with the trust recorded in `[hooks.state]`, skill folders and `AGENTS.md`. `CODEX_HOME` moves the folder. Cursor: MCP servers and hooks, skill folders, rules and `AGENTS.md`. opencode, pi and Antigravity: install, folders and sign-in evidence.
  - `current(env)` names the harness the process runs inside. `which(binary, env, platform)`, `harnessId`, `BUILTIN_HARNESSES` and `HARNESS_ALIASES` are exported. `HarnessProvider`, `builtinProviders` and `selectProviders` add or replace a harness. `codexHookHash` and `snakeEvent` give the trust hash and event key Codex records for a hook.
  - `LOCATIONS`, `SCOPES` and the resolvers (`resolveBase`, `resolveBases`, `resolveConfigDir`, `resolveLocations`, `resolveTemplate`, `defaultSystemRoot`) are exported from the root and from `@osdlc/detect-harness/locations`. Experimental.
  - `@osdlc/detect-harness/model` reads one Claude Code plugin folder into a typed `HarnessModel` with `readPlugin`. Experimental.
  - ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. `zod` `^4` is a peer dependency. Licence `MIT OR Apache-2.0`.

## History before the first public release

These versions were never published. The package was `@sksizer/agent-plugin`
until it was renamed `@osdlc/detect-harness`. Its first release on npm is
0.4.0, and the entry for it is added above this section when it is released.

### [0.3.1] - 2026-10-05 (unpublished)

#### Changed

- The frontmatter reader depends on `@sksizer/frontmatter-lossless`; behavior is unchanged.

### [0.3.0] - 2026-09-26 (unpublished)

#### Removed

- **BREAKING: the per-host exporters are gone.** The Claude, Codex, Cursor,
  Gemini and portable-JSON exporters, the `EXPORTERS` / `getExporter` /
  `exporterNames` registry, and `buildExampleModel` / `exportAllTargets` are no
  longer exported, and `exporters/` and `examples/` no longer ship. The package
  now only derives the model (`deriveHarnessModel`, `readClaudeControlPlane`,
  `validateModelBodies`); it does not project it back onto a host, because host
  builds moved out of this package.

### [0.2.1] - 2026-09-24 (unpublished)

#### Fixed

- The Cursor and Gemini exporters wrote `${CLAUDE_PLUGIN_ROOT}` paths without
  the separating slash; they now emit `${CLAUDE_PLUGIN_ROOT}/skills/...`.
- The Gemini exporter writes `httpUrl` for `http` MCP servers and `url` for
  `sse`, because Gemini CLI selects the transport by key name rather than a
  `type` field.

### [0.2.0] - 2026-09-03 (unpublished)

#### Added

- The Cursor and Gemini exporters now write each capability's co-located
  resources (executable bit kept) under `skills/<name>/` or `commands/<name>/`,
  at the path the instructions name and outside `.cursor/` and
  `.gemini/commands/`, so a script is not registered as a phantom rule or
  command.

#### Fixed

- `splitFrontmatter` uses the same lenient framing as `extractFrontmatter`
  (BOM, leading blanks, padded fences), so a block the parser recognises is no
  longer handed back as body.

### [0.1.0] - 2026-08-30 (unpublished)

First version of the canonical, host-neutral model of an agentic harness, as
`@sksizer/agent-plugin` under MIT.

#### Added

- **The model.** The Zod `HarnessModel` shape: capabilities (`skill` or
  `command`), commands, hooks, MCP servers, permissions and context documents,
  plus `validateModelBodies`, which checks markdown bodies through
  markdown-contract.
- **Import.** `deriveHarnessModel` and `importClaude` read a Claude Code
  plugin surface (`.claude-plugin/`, `skills/`, `conventions/`);
  `readClaudeControlPlane` reads `.claude/settings.json` (and
  `settings.local.json`) and `.mcp.json`.
- **Exporters.** Claude, Codex, Cursor and Gemini exporters plus a portable
  JSON form, behind an `EXPORTERS` registry, with `buildExampleModel` and
  `exportAllTargets` as an API walkthrough.

#### Fixed

- Cursor `.mdc` rule frontmatter is serialised as YAML, so a description with
  special characters no longer corrupts it.

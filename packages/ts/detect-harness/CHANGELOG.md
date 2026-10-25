# @osdlc/detect-harness

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

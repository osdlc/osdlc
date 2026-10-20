# Changelog

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

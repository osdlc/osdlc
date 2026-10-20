/**
 * The catalog `detect()` returns: one {@link HarnessReport} per harness.
 *
 * A report keeps each harness's own vocabulary (hook events as the harness
 * spells them) and puts provenance on every fact: the scope it came from and
 * the file that said it. Every field is always present. A harness that has no
 * such thing, or a provider that does not read it yet, reports it empty.
 *
 * The shapes are Zod schemas so a consumer can nest them in its own output
 * schemas. Zod is a peer dependency.
 *
 * Runtime-agnostic: pure schema.
 */

import { z } from 'zod'

import { SCOPES } from './locations.ts'

/** A settings scope. `managed` is set by an administrator and wins over the rest. */
export const ScopeSchema = z.enum(SCOPES)

/** How `detect()` ran: `full`, or `project` (project files only, never the home folder). */
export const DetectModeSchema = z.enum(['full', 'project'])
export type DetectMode = z.infer<typeof DetectModeSchema>

/** Whether the harness's program is on this machine. */
export const InstallSchema = z.object({
  /** The binary looked for, or `null` for a provider that names none. */
  binary: z.string().nullable(),
  /** False in `project` mode, where nothing about the machine is read. */
  probed: z.boolean(),
  found: z.boolean(),
  path: z.string().nullable(),
  /** `PATH` for a binary, `app bundle` for a macOS app with no CLI on `PATH`. */
  how: z.enum(['PATH', 'app bundle']).nullable(),
  /** From `<binary> --version`; only when `allowExec` is set. */
  version: z.string().nullable(),
})
export type Install = z.infer<typeof InstallSchema>

/** A folder the harness keeps its files in. */
export const ConfigDirSchema = z.object({
  /** The location table's base name: `config`, `managed`, `data`. */
  name: z.string(),
  path: z.string(),
  /** The environment variable that moved it, or `null` for the default. */
  envVar: z.string().nullable(),
  exists: z.boolean(),
})
export type ConfigDir = z.infer<typeof ConfigDirSchema>

/** A config file the provider looked at. */
export const SourceSchema = z.object({
  path: z.string(),
  scope: ScopeSchema,
  /** The location role: `settings`, `mcp`, `hooks`, `plugin-registry`, … */
  kind: z.string(),
  status: z.enum(['parsed', 'absent', 'error']),
  error: z.string().nullable(),
  /** Precedence among sources of one kind; higher wins. `null` where nothing competes. */
  rank: z.number().int().nullable(),
})
export type Source = z.infer<typeof SourceSchema>

/** An installed or enabled plugin. */
export const PluginSchema = z.object({
  /** `<name>@<marketplace>`, or `<name>`. */
  id: z.string(),
  name: z.string(),
  marketplace: z.string().nullable(),
  /** The install scope, or for a plugin only named in settings, the deciding file's scope. */
  scope: ScopeSchema,
  projectPath: z.string().nullable(),
  version: z.string().nullable(),
  installPath: z.string().nullable(),
  gitCommitSha: z.string().nullable(),
  /** In the install registry; `null` when the registry was not read (`project` mode). */
  installed: z.boolean().nullable(),
  /** The effective `enabledPlugins` value; `null` when no file read decides it. */
  enabled: z.boolean().nullable(),
  /** The settings file that decided `enabled`. */
  enabledSource: z.string().nullable(),
  /** The file this entry came from: the install registry or a settings file. */
  source: z.string(),
})
export type Plugin = z.infer<typeof PluginSchema>

/** A known plugin marketplace. */
export const MarketplaceSchema = z.object({
  name: z.string(),
  /** `github`, `git`, `directory`, `url`, … as the file spells it. */
  sourceKind: z.string().nullable(),
  path: z.string().nullable(),
  url: z.string().nullable(),
  repo: z.string().nullable(),
  installLocation: z.string().nullable(),
  scope: ScopeSchema,
  source: z.string(),
})
export type Marketplace = z.infer<typeof MarketplaceSchema>

/** A skill, command or agent definition. */
export const ArtifactSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  /** The defining file (`SKILL.md`, `<name>.md`). */
  path: z.string(),
  scope: ScopeSchema,
  /** `user`, `project`, `local`, `managed`, or `plugin:<id>`. */
  origin: z.string(),
  /** True when a plugin manager put it there, so editing it in place is lost on update. */
  managerOwned: z.boolean(),
  /** The markdown body; only with `readContents`. */
  body: z.string().nullable(),
})
export type Artifact = z.infer<typeof ArtifactSchema>

/** Whether the harness will run a hook. Only Codex records approval. */
export const HookTrustSchema = z.enum(['trusted', 'modified', 'untrusted'])
export type HookTrust = z.infer<typeof HookTrustSchema>

/** One hook handler. */
export const HookSchema = z.object({
  /** The event as the harness spells it (`PreToolUse`, `stop`). */
  event: z.string(),
  matcher: z.string().nullable(),
  /** `command`, `prompt`, … as written; `command` when the file omits it. */
  type: z.string(),
  command: z.string().nullable(),
  timeout: z.number().nullable(),
  scope: ScopeSchema,
  origin: z.string(),
  source: z.string(),
  /** Codex's approval state; `null` for a harness with no approval step, or in `project` mode. */
  trust: HookTrustSchema.nullable(),
})
export type Hook = z.infer<typeof HookSchema>

/** An MCP server. `env` and `headers` values, URL credentials and secret-looking `args` are redacted unless `includeValues`. */
export const McpServerSchema = z.object({
  name: z.string(),
  transport: z.enum(['stdio', 'http', 'sse']),
  command: z.string().nullable(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()),
  url: z.string().nullable(),
  headers: z.record(z.string(), z.string()),
  scope: ScopeSchema,
  origin: z.string(),
  source: z.string(),
  /**
   * False when the harness would not start the server: an unapproved or
   * rejected `.mcp.json` server, a server turned off by `managed-mcp.json`, a
   * disabled Codex server, or a same-named server from a higher scope replaces
   * it.
   */
  active: z.boolean(),
})
export type McpServer = z.infer<typeof McpServerSchema>

/** One permission rule, with the scope it came from. */
export const PermissionRuleSchema = z.object({
  kind: z.enum(['allow', 'deny', 'ask']),
  rule: z.string(),
  scope: ScopeSchema,
  source: z.string(),
})
export type PermissionRule = z.infer<typeof PermissionRuleSchema>

/** The permission rules of every scope (they add up), and the winning default mode. */
export const PermissionsSchema = z.object({
  rules: z.array(PermissionRuleSchema),
  defaultMode: z.string().nullable(),
  defaultModeSource: z.string().nullable(),
})
export type Permissions = z.infer<typeof PermissionsSchema>

/** An instruction file the harness loads (`CLAUDE.md`, `AGENTS.md`, a rules file). */
export const InstructionSchema = z.object({
  path: z.string(),
  scope: ScopeSchema,
})
export type Instruction = z.infer<typeof InstructionSchema>

/**
 * Offline sign-in evidence. Only positive evidence counts: a missing file proves
 * nothing, because a login can live in a keychain. Evidence names a file, a key
 * name or a variable name, never a value.
 */
export const AuthSchema = z.object({
  signedIn: z.union([z.boolean(), z.literal('unknown')]),
  evidence: z.string().nullable(),
  /** pi's configured providers (key names of its auth file); `null` elsewhere. */
  providers: z.array(z.string()).nullable(),
})
export type Auth = z.infer<typeof AuthSchema>

export const DiagnosticSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
  source: z.string().nullable(),
})
export type Diagnostic = z.infer<typeof DiagnosticSchema>

/** One harness's slice of a catalog. */
export const HarnessReportSchema = z.object({
  harness: z.string(),
  label: z.string(),
  /** `ok` when anything was found: the program, a folder, or a parsed file. */
  status: z.enum(['absent', 'ok', 'error']),
  install: InstallSchema,
  configDirs: z.array(ConfigDirSchema),
  sources: z.array(SourceSchema),
  plugins: z.array(PluginSchema),
  marketplaces: z.array(MarketplaceSchema),
  skills: z.array(ArtifactSchema),
  commands: z.array(ArtifactSchema),
  agents: z.array(ArtifactSchema),
  hooks: z.array(HookSchema),
  mcpServers: z.array(McpServerSchema),
  permissions: PermissionsSchema,
  instructions: z.array(InstructionSchema),
  auth: AuthSchema,
  diagnostics: z.array(DiagnosticSchema),
  /** True when the provider needs to run a program and `allowExec` was off. */
  skippedForExec: z.boolean(),
})
export type HarnessReport = z.infer<typeof HarnessReportSchema>

/** What `detect()` returns. */
export const HarnessCatalogSchema = z.object({
  generatedAt: z.string(),
  projectRoot: z.string(),
  /** `null` in `project` mode. */
  home: z.string().nullable(),
  mode: DetectModeSchema,
  allowExec: z.boolean(),
  reports: z.array(HarnessReportSchema),
})
export type HarnessCatalog = z.infer<typeof HarnessCatalogSchema>

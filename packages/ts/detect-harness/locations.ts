/**
 * Where each harness keeps its files: the location table, as data.
 *
 * Each harness has named base folders (`config`, `managed`, `data`, …), each
 * with an optional environment override, and a list of paths built on those
 * bases. The providers resolve their paths from this table, so the table is
 * what `detect()` actually reads. Session and transcript folders appear here as
 * paths only; nothing in this package reads them.
 *
 * Templates:
 *   - `~` is the home directory;
 *   - `{project}` is the project root;
 *   - `{system}` is the file-system root (`/`, or the system drive on Windows);
 *   - `{<base>}` is another base of the same harness.
 *
 * An override names an environment variable; the first one that is set and not
 * empty wins, made absolute, with its `suffix` joined on.
 *
 * Vendor facts here come from each harness's public documentation (see the
 * README). They change; a wrong entry is a bug in this table, not in a provider.
 *
 * Runtime-agnostic: `node:path` only.
 */

import { join, resolve } from 'node:path'

import type { BuiltinHarnessId } from './harnesses.ts'

/**
 * The settings scopes, in Claude Code's terms. Other harnesses use the subset they have.
 *
 * @experimental
 */
export const SCOPES = ['managed', 'user', 'project', 'local'] as const

/**
 * A settings scope.
 *
 * @experimental
 */
export type Scope = (typeof SCOPES)[number]

/**
 * What a location holds.
 *
 * @experimental
 */
export type LocationRole =
  | 'settings'
  | 'config'
  | 'mcp'
  | 'hooks'
  | 'skills'
  | 'commands'
  | 'agents'
  | 'instructions'
  | 'credentials'
  | 'global-state'
  | 'plugins'
  | 'plugin-registry'
  | 'marketplace-registry'
  | 'sessions'
  | 'transcripts'

/**
 * An environment variable that overrides a path.
 *
 * @experimental
 */
export interface EnvOverride {
  name: string
  /** Joined onto the variable's value (`XDG_CONFIG_HOME` + `opencode`). */
  suffix?: string
}

/**
 * A per-platform template, for system paths that differ by OS.
 *
 * @experimental
 */
export type PlatformTemplate = Readonly<Partial<Record<'darwin' | 'linux' | 'win32', string>>>

/**
 * A named base folder.
 *
 * @experimental
 */
export interface BaseDir {
  /** Overrides, in order. */
  env: readonly EnvOverride[]
  /** The template used when no override is set. Linux's applies to any platform not listed. */
  default: string | PlatformTemplate
}

/**
 * One file or folder a harness reads.
 *
 * @experimental
 */
export interface LocationPath {
  role: LocationRole
  scope: Scope
  kind: 'file' | 'dir'
  /** Template; see the module doc. */
  path: string
  /** Overrides for this path alone, tried before the template. */
  env?: readonly EnvOverride[]
}

/**
 * Everything this package knows about where one harness lives.
 *
 * @experimental
 */
export interface HarnessLocations {
  label: string
  /** The CLI binary looked for on `PATH`. */
  binary: string
  /** App bundles whose presence counts as an install (macOS). Templates. */
  appBundles: readonly string[]
  /** Environment variables whose presence says a process runs inside this harness. */
  currentEnv: readonly string[]
  /**
   * Variables that suggest this harness but may also be set outside it (an
   * editor terminal). `current()` reads them only after every `currentEnv` and
   * `AI_AGENT`.
   */
  weakEnv: readonly string[]
  bases: Readonly<Record<string, BaseDir>>
  paths: readonly LocationPath[]
}

const p = (
  role: LocationRole,
  scope: Scope,
  kind: 'file' | 'dir',
  path: string,
  env?: readonly EnvOverride[],
): LocationPath => (env ? { role, scope, kind, path, env } : { role, scope, kind, path })

/**
 * The location table. Entries are added as harnesses change.
 * For opencode, pi and Antigravity, `detect()` reads only the base folders and
 * sign-in files; their other paths are listed here but not read yet.
 *
 * @experimental
 */
export const LOCATIONS: Readonly<Record<BuiltinHarnessId, HarnessLocations>> = {
  claude: {
    label: 'Claude Code',
    binary: 'claude',
    appBundles: [],
    currentEnv: ['CLAUDECODE'],
    weakEnv: [],
    bases: {
      config: { env: [{ name: 'CLAUDE_CONFIG_DIR' }], default: '~/.claude' },
      managed: {
        env: [],
        default: {
          darwin: '{system}/Library/Application Support/ClaudeCode',
          linux: '{system}/etc/claude-code',
          win32: '{system}/Program Files/ClaudeCode',
        },
      },
    },
    paths: [
      p('settings', 'managed', 'file', '{managed}/managed-settings.json'),
      p('settings', 'user', 'file', '{config}/settings.json'),
      p('settings', 'project', 'file', '{project}/.claude/settings.json'),
      p('settings', 'local', 'file', '{project}/.claude/settings.local.json'),
      // `~/.claude.json` moves into the config folder when CLAUDE_CONFIG_DIR is set.
      p('global-state', 'user', 'file', '~/.claude.json', [
        { name: 'CLAUDE_CONFIG_DIR', suffix: '.claude.json' },
      ]),
      p('mcp', 'managed', 'file', '{managed}/managed-mcp.json'),
      // User-scope servers are the top-level `mcpServers` of the global state file.
      p('mcp', 'user', 'file', '~/.claude.json', [
        { name: 'CLAUDE_CONFIG_DIR', suffix: '.claude.json' },
      ]),
      p('mcp', 'project', 'file', '{project}/.mcp.json'),
      // Local-scope servers are `projects[<root>].mcpServers` of the same file.
      p('mcp', 'local', 'file', '~/.claude.json', [
        { name: 'CLAUDE_CONFIG_DIR', suffix: '.claude.json' },
      ]),
      p('skills', 'user', 'dir', '{config}/skills'),
      p('skills', 'project', 'dir', '{project}/.claude/skills'),
      p('commands', 'user', 'dir', '{config}/commands'),
      p('commands', 'project', 'dir', '{project}/.claude/commands'),
      p('agents', 'user', 'dir', '{config}/agents'),
      p('agents', 'project', 'dir', '{project}/.claude/agents'),
      p('instructions', 'managed', 'file', '{managed}/CLAUDE.md'),
      p('instructions', 'user', 'file', '{config}/CLAUDE.md'),
      p('instructions', 'user', 'dir', '{config}/rules'),
      p('instructions', 'project', 'file', '{project}/CLAUDE.md'),
      p('instructions', 'project', 'file', '{project}/.claude/CLAUDE.md'),
      p('instructions', 'project', 'dir', '{project}/.claude/rules'),
      p('instructions', 'local', 'file', '{project}/CLAUDE.local.md'),
      p('credentials', 'user', 'file', '{config}/.credentials.json'),
      p('plugins', 'user', 'dir', '{config}/plugins'),
      p('plugin-registry', 'user', 'file', '{config}/plugins/installed_plugins.json'),
      p('marketplace-registry', 'user', 'file', '{config}/plugins/known_marketplaces.json'),
      p('sessions', 'user', 'dir', '{config}/sessions'),
      p('transcripts', 'user', 'dir', '{config}/projects'),
    ],
  },
  codex: {
    label: 'Codex',
    binary: 'codex',
    appBundles: [],
    currentEnv: ['CODEX_THREAD_ID', 'CODEX_SANDBOX', 'CODEX_SANDBOX_NETWORK_DISABLED'],
    weakEnv: [],
    bases: {
      config: { env: [{ name: 'CODEX_HOME' }], default: '~/.codex' },
    },
    paths: [
      p('config', 'user', 'file', '{config}/config.toml'),
      p('config', 'project', 'file', '{project}/.codex/config.toml'),
      p('mcp', 'user', 'file', '{config}/config.toml'),
      p('mcp', 'project', 'file', '{project}/.codex/config.toml'),
      p('hooks', 'user', 'file', '{config}/hooks.json'),
      p('hooks', 'project', 'file', '{project}/.codex/hooks.json'),
      // `~/.codex/skills` is the older folder; `~/.agents/skills` replaced it.
      p('skills', 'user', 'dir', '{config}/skills'),
      p('skills', 'user', 'dir', '~/.agents/skills'),
      p('skills', 'project', 'dir', '{project}/.agents/skills'),
      p('instructions', 'user', 'file', '{config}/AGENTS.md'),
      p('instructions', 'user', 'file', '{config}/AGENTS.override.md'),
      p('instructions', 'project', 'file', '{project}/AGENTS.md'),
      p('instructions', 'project', 'file', '{project}/AGENTS.override.md'),
      p('credentials', 'user', 'file', '{config}/auth.json'),
      p('sessions', 'user', 'dir', '{config}/sessions'),
    ],
  },
  cursor: {
    label: 'Cursor',
    binary: 'cursor-agent',
    appBundles: ['{system}/Applications/Cursor.app', '~/Applications/Cursor.app'],
    currentEnv: ['CURSOR_AGENT'],
    // Also set in Cursor's editor terminal, where no agent may be running.
    weakEnv: ['CURSOR_TRACE_ID'],
    bases: {
      config: { env: [], default: '~/.cursor' },
    },
    paths: [
      p('config', 'user', 'file', '{config}/cli-config.json'),
      p('mcp', 'user', 'file', '{config}/mcp.json'),
      p('mcp', 'project', 'file', '{project}/.cursor/mcp.json'),
      p('hooks', 'user', 'file', '{config}/hooks.json'),
      p('hooks', 'project', 'file', '{project}/.cursor/hooks.json'),
      p('skills', 'user', 'dir', '{config}/skills'),
      p('skills', 'project', 'dir', '{project}/.cursor/skills'),
      p('instructions', 'project', 'file', '{project}/AGENTS.md'),
      p('instructions', 'project', 'file', '{project}/.cursorrules'),
      p('instructions', 'project', 'dir', '{project}/.cursor/rules'),
    ],
  },
  opencode: {
    label: 'OpenCode',
    binary: 'opencode',
    appBundles: [],
    currentEnv: ['OPENCODE'],
    weakEnv: [],
    bases: {
      config: {
        env: [{ name: 'XDG_CONFIG_HOME', suffix: 'opencode' }],
        default: '~/.config/opencode',
      },
      data: {
        env: [{ name: 'XDG_DATA_HOME', suffix: 'opencode' }],
        default: '~/.local/share/opencode',
      },
    },
    paths: [
      p('config', 'user', 'file', '{config}/opencode.json'),
      p('config', 'project', 'file', '{project}/opencode.json'),
      p('instructions', 'user', 'file', '{config}/AGENTS.md'),
      p('instructions', 'project', 'file', '{project}/AGENTS.md'),
      p('credentials', 'user', 'file', '{data}/auth.json'),
      p('sessions', 'user', 'dir', '{data}/storage'),
    ],
  },
  pi: {
    label: 'pi',
    binary: 'pi',
    appBundles: [],
    currentEnv: ['PI_CODING_AGENT'],
    weakEnv: [],
    bases: {
      config: { env: [{ name: 'PI_CODING_AGENT_DIR' }], default: '~/.pi/agent' },
    },
    paths: [
      p('settings', 'user', 'file', '{config}/settings.json'),
      p('settings', 'project', 'file', '{project}/.pi/settings.json'),
      p('skills', 'user', 'dir', '{config}/skills'),
      p('skills', 'project', 'dir', '{project}/.pi/skills'),
      p('instructions', 'project', 'file', '{project}/AGENTS.md'),
      p('credentials', 'user', 'file', '{config}/auth.json'),
      p('sessions', 'user', 'dir', '{config}/sessions', [{ name: 'PI_CODING_AGENT_SESSION_DIR' }]),
    ],
  },
  antigravity: {
    label: 'Antigravity',
    binary: 'agy',
    appBundles: ['{system}/Applications/Antigravity.app', '~/Applications/Antigravity.app'],
    currentEnv: [],
    weakEnv: [],
    bases: {
      config: { env: [], default: '~/.gemini/antigravity-cli' },
    },
    paths: [
      p('skills', 'user', 'dir', '{config}/skills'),
      p('skills', 'project', 'dir', '{project}/.agents/skills'),
      p('mcp', 'user', 'file', '~/.gemini/config/mcp_config.json'),
      p('mcp', 'project', 'file', '{project}/.agents/mcp_config.json'),
    ],
  },
}

/**
 * What a template is resolved against.
 *
 * @experimental
 */
export interface LocationContext {
  /** Home directory; `null` makes every home-based path unresolvable. */
  home: string | null
  env: Readonly<Record<string, string | undefined>>
  /** Default `process.platform`. */
  platform?: NodeJS.Platform | undefined
  /** The file-system root for `{system}`. Default `/`, or the system drive on Windows. */
  systemRoot?: string | undefined
  /** The project root for `{project}`; `null` or absent makes project paths unresolvable. */
  projectRoot?: string | null | undefined
}

/**
 * A base folder, resolved.
 *
 * @experimental
 */
export interface ResolvedDir {
  name: string
  /** Absolute path, or `null` when it rests on something unknown (a `null` home). */
  path: string | null
  /** The variable that set it, or `null` for the default. */
  envVar: string | null
}

/**
 * A location, resolved.
 *
 * @experimental
 */
export interface ResolvedLocation extends LocationPath {
  resolved: string | null
  envVar: string | null
}

/**
 * The default `{system}` root for `platform`.
 *
 * @experimental
 */
export function defaultSystemRoot(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return platform === 'win32' ? `${env['SystemDrive'] ?? 'C:'}\\` : '/'
}

function fromEnv(
  overrides: readonly EnvOverride[],
  env: Readonly<Record<string, string | undefined>>,
): { path: string; envVar: string } | null {
  for (const o of overrides) {
    const value = env[o.name]
    if (value === undefined || value === '') continue
    const base = resolve(value)
    return { path: o.suffix ? join(base, o.suffix) : base, envVar: o.name }
  }
  return null
}

function expand(
  harness: BuiltinHarnessId | null,
  template: string,
  ctx: LocationContext,
  seen: ReadonlySet<string>,
): string | null {
  const m = /^(~|\{([a-z-]+)\})(\/.*)?$/.exec(template)
  if (!m) return template
  const rest = (m[3] ?? '').replace(/^\//, '')
  let root: string | null
  if (m[1] === '~') root = ctx.home
  else if (m[2] === 'project') root = ctx.projectRoot ?? null
  else if (m[2] === 'system') {
    const platform = ctx.platform ?? process.platform
    root = ctx.systemRoot ?? defaultSystemRoot(platform, ctx.env)
  } else {
    const name = m[2]!
    if (harness === null) throw new Error(`template base {${name}} needs a built-in harness`)
    if (seen.has(name)) throw new Error(`location base cycle at ${harness}.${name}`)
    root = baseOf(harness, name, ctx, new Set([...seen, name])).path
  }
  if (root === null) return null
  return rest === '' ? root : join(root, ...rest.split('/'))
}

function baseOf(
  harness: BuiltinHarnessId,
  name: string,
  ctx: LocationContext,
  seen: ReadonlySet<string>,
): ResolvedDir {
  const base = LOCATIONS[harness].bases[name]
  if (base === undefined) throw new Error(`unknown location base: ${harness}.${name}`)
  const over = fromEnv(base.env, ctx.env)
  if (over) return { name, path: over.path, envVar: over.envVar }
  const platform = ctx.platform ?? process.platform
  const template =
    typeof base.default === 'string'
      ? base.default
      : (base.default[platform as 'darwin' | 'linux' | 'win32'] ?? base.default.linux)
  if (template === undefined) return { name, path: null, envVar: null }
  return { name, path: expand(harness, template, ctx, seen), envVar: null }
}

/**
 * One base folder of `harness`, resolved.
 *
 * @throws {Error} For a base the table does not name, and for a base that refers to itself.
 *
 * @experimental
 */
export function resolveBase(
  harness: BuiltinHarnessId,
  name: string,
  ctx: LocationContext,
): ResolvedDir {
  return baseOf(harness, name, ctx, new Set([name]))
}

/**
 * Every base folder of `harness`, resolved, in table order.
 *
 * @experimental
 */
export function resolveBases(harness: BuiltinHarnessId, ctx: LocationContext): ResolvedDir[] {
  return Object.keys(LOCATIONS[harness].bases).map((name) => resolveBase(harness, name, ctx))
}

/**
 * The `config` base of `harness`: its main folder, with the environment override applied.
 *
 * @experimental
 */
export function resolveConfigDir(harness: BuiltinHarnessId, ctx: LocationContext): string | null {
  return resolveBase(harness, 'config', ctx).path
}

/**
 * Resolve a template (`{config}/x`, `~/x`, `{project}/x`, `{system}/x`). With
 * `harness` `null`, only `~`, `{project}` and `{system}` resolve.
 *
 * @throws {Error} For a `{<base>}` template when `harness` is `null`, for a base
 * the table does not name, and for a cycle of bases.
 *
 * @experimental
 */
export function resolveTemplate(
  harness: BuiltinHarnessId | null,
  template: string,
  ctx: LocationContext,
): string | null {
  return expand(harness, template, ctx, new Set())
}

/**
 * Every location of `harness`, resolved, in table order.
 *
 * @experimental
 */
export function resolveLocations(
  harness: BuiltinHarnessId,
  ctx: LocationContext,
): ResolvedLocation[] {
  return LOCATIONS[harness].paths.map((loc) => {
    const over = loc.env ? fromEnv(loc.env, ctx.env) : null
    if (over) return { ...loc, resolved: over.path, envVar: over.envVar }
    return { ...loc, resolved: expand(harness, loc.path, ctx, new Set()), envVar: null }
  })
}

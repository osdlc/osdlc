/**
 * Read Claude Code's hooks, permissions and MCP servers (the "control plane")
 * into the model's host-neutral shapes.
 *
 * Project scope reads `.claude/settings.json`, `.claude/settings.local.json` and
 * a sibling `.mcp.json`. Plugin scope ({@link readPluginControlPlane}) adds
 * `hooks/hooks.json` and the `hooks` and `mcpServers` fields of `plugin.json`.
 * Every source is optional. A root with none yields empty collections. A file
 * that is not valid JSON is treated as absent.
 *
 * Scope rules follow Claude Code: `settings.local.json` overrides
 * `settings.json`; permission lists and hooks from both scopes are kept; an
 * MCP server in the local settings replaces the same-named server elsewhere.
 *
 * The parsing is `detect()`'s (`../read/hooks.ts`, `../read/mcp.ts`,
 * `../read/manifest.ts`). This module maps its entries onto the model's shapes
 * and applies the model's merge rules.
 *
 * Secrets: MCP `env` and `headers` values, the user part and query values of an
 * MCP `url`, and MCP `args` that look like secrets (see `redactArgs`) are
 * replaced with {@link REDACTED} unless the caller passes `includeValues`. Hook
 * commands are returned as written.
 *
 * Runtime-agnostic: `node:` APIs only.
 */

import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { asObject, loadJson, strings } from '../json.ts'
import { eventsOf, parseNestedHooks } from '../read/hooks.ts'
import { manifestObjects, type ManifestReader } from '../read/manifest.ts'
import { parseJsonMcp, serversOf } from '../read/mcp.ts'
import { REDACTED } from '../read/redact.ts'
import type { Hook, McpServer } from '../report.ts'
import type { HarnessHook, HarnessMcpServer, HarnessPermissions } from './schema.ts'

export { REDACTED }

/**
 * Options shared by the control-plane readers.
 *
 * @experimental
 */
export interface ControlPlaneOptions {
  /**
   * Keep MCP values as written: `env` and header values, URL credentials and
   * secret-looking `args`. Default `false`: they are replaced with {@link REDACTED}.
   */
  includeValues?: boolean
}

/**
 * Parsed control-plane fields ready to fold into the model.
 *
 * @experimental
 */
export interface ClaudeControlPlane {
  hooks: HarnessHook[]
  mcpServers: HarnessMcpServer[]
  permissions: HarnessPermissions
}

/** Reads straight from the file system. An unreadable or malformed file counts as absent. */
const fsReader: ManifestReader = {
  realpath: (path) => {
    try {
      return realpathSync(path)
    } catch {
      return null
    }
  },
  readJson: (path) => {
    const value = loadJson(path)
    return value ? { status: 'parsed', value } : { status: 'absent' }
  },
}

/** The model has no provenance, so the origin passed to the parsers is dropped. */
const NO_ORIGIN = { scope: 'project', origin: 'project' } as const

/** Hooks in the model's shape: command handlers only, one per command. */
function parseHooks(value: unknown, source: string): HarnessHook[] {
  return parseNestedHooks(value, { ...NO_ORIGIN, source }).flatMap((h: Hook) =>
    h.command
      ? [{ event: h.event, ...(h.matcher ? { matcher: h.matcher } : {}), action: h.command }]
      : [],
  )
}

/** MCP servers in the model's shape. */
function parseMcpServers(value: unknown, source: string, redact: boolean): HarnessMcpServer[] {
  return parseJsonMcp(value, { ...NO_ORIGIN, source }, redact).map((s: McpServer) => ({
    name: s.name,
    transport: s.transport,
    ...(s.command !== null ? { command: s.command } : {}),
    args: s.args,
    env: s.env,
    ...(s.url !== null ? { url: s.url } : {}),
    headers: s.headers,
  }))
}

/** Order hooks deterministically (event → matcher → action) and drop exact repeats. */
function sortHooks(hooks: HarnessHook[]): HarnessHook[] {
  const sorted = [...hooks].sort(
    (a, b) =>
      a.event.localeCompare(b.event) ||
      (a.matcher ?? '').localeCompare(b.matcher ?? '') ||
      a.action.localeCompare(b.action),
  )
  return sorted.filter((h, i) => {
    const prev = sorted[i - 1]
    return !prev || h.event !== prev.event || h.matcher !== prev.matcher || h.action !== prev.action
  })
}

/** Merge server lists in increasing precedence: a later same-named server replaces an earlier one. */
function mergeServers(...lists: HarnessMcpServer[][]): HarnessMcpServer[] {
  const byName = new Map<string, HarnessMcpServer>()
  for (const list of lists) for (const s of list) byName.set(s.name, s)
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Concatenate rule lists in increasing precedence, dropping repeats. */
function mergeRules(lists: string[][]): string[] {
  return [...new Set(lists.flat())]
}

/**
 * Read the Claude control plane at `root` (project scope). `settings.local.json`
 * takes precedence over `settings.json`: its MCP servers replace same-named ones,
 * and its permission rules and hooks add to the project's. A sibling `.mcp.json`
 * supplies servers that neither settings file names. Absent sources contribute
 * nothing.
 *
 * @experimental
 */
export function readClaudeControlPlane(
  root: string,
  options: ControlPlaneOptions = {},
): ClaudeControlPlane {
  const redact = options.includeValues !== true
  // Increasing precedence: project settings, then local settings.
  const scopes = [
    join(root, '.claude', 'settings.json'),
    join(root, '.claude', 'settings.local.json'),
  ].flatMap((path) => {
    const value = loadJson(path)
    return value ? [{ path, value }] : []
  })

  const rules = (key: 'allow' | 'deny' | 'ask'): string[] =>
    mergeRules(scopes.map((s) => strings(asObject(s.value['permissions'])?.[key])))
  const permissions: HarnessPermissions = {
    allow: rules('allow'),
    deny: rules('deny'),
    ask: rules('ask'),
  }

  const hooks = sortHooks(scopes.flatMap((s) => parseHooks(s.value['hooks'], s.path)))

  const mcpPath = join(root, '.mcp.json')
  const mcpJson = loadJson(mcpPath)
  const mcpServers = mergeServers(
    mcpJson ? parseMcpServers(mcpJson['mcpServers'], mcpPath, redact) : [],
    ...scopes.map((s) => parseMcpServers(s.value['mcpServers'], s.path, redact)),
  )

  return { hooks, mcpServers, permissions }
}

/**
 * Read the control plane of a plugin folder. On top of the project-scope
 * sources of {@link readClaudeControlPlane} this reads `hooks/hooks.json` and the
 * `hooks` and `mcpServers` fields of the plugin manifest, each an inline object,
 * a path inside the plugin, or a list of those. Servers from the project-scope
 * sources replace same-named servers from the manifest.
 *
 * @param manifest The parsed `plugin.json`, or `{}` when the plugin has none.
 *
 * @experimental
 */
export function readPluginControlPlane(
  root: string,
  manifest: Record<string, unknown>,
  options: ControlPlaneOptions = {},
): ClaudeControlPlane {
  const redact = options.includeValues !== true
  const project = readClaudeControlPlane(root, options)

  const hooksPath = join(root, 'hooks', 'hooks.json')
  const hooksFile = loadJson(hooksPath)
  const pluginHooks = [
    ...(hooksFile ? parseHooks(eventsOf(hooksFile), hooksPath) : []),
    ...manifestObjects(fsReader, root, manifest['hooks']).flatMap((b) =>
      parseHooks(eventsOf(b), root),
    ),
  ]

  const manifestServers = manifestObjects(fsReader, root, manifest['mcpServers']).flatMap((b) =>
    parseMcpServers(serversOf(b), root, redact),
  )

  return {
    hooks: sortHooks([...pluginHooks, ...project.hooks]),
    mcpServers: mergeServers(manifestServers, project.mcpServers),
    permissions: project.permissions,
  }
}

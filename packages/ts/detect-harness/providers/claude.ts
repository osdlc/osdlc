/**
 * The Claude Code provider: the full read.
 *
 * Settings come from four scopes, lowest precedence first: user
 * (`<config>/settings.json`), project (`.claude/settings.json`), local
 * (`.claude/settings.local.json`) and managed (`managed-settings.json` in the
 * system folder). A higher scope wins a single value (`defaultMode`, one
 * `enabledPlugins` entry); permission rules and hooks from every scope add up.
 *
 * MCP servers come from `managed-mcp.json`, the global state file
 * (`~/.claude.json`: its top-level `mcpServers` is the user scope, and
 * `projects[<root>].mcpServers` the local scope), `.mcp.json` (project) and
 * each enabled plugin. A server is `active` when Claude Code would start it
 * (see `mcpActive` for the unconfirmed rules):
 *   - a `.mcp.json` server needs approval: it is inactive when a
 *     `disabledMcpjsonServers` list names it, and otherwise active only when an
 *     `enabledMcpjsonServers` list names it or `enableAllProjectMcpServers` is
 *     true. The lists are read from every settings scope and from
 *     `projects[<root>]` of `~/.claude.json`, where Claude Code records the
 *     approval prompt's answer;
 *   - when `managed-mcp.json` parses, only its servers are active;
 *   - of same-named active servers outside plugins, the one from the highest
 *     scope wins.
 * Nothing else in `~/.claude.json` is reported; its `oauthAccount` key counts
 * as sign-in evidence by name only.
 *
 * Plugins come from the install registry (`plugins/installed_plugins.json`) and
 * the `enabledPlugins` of the settings; marketplaces from
 * `plugins/known_marketplaces.json` and `extraKnownMarketplaces`. A registry
 * record is reported when it applies here: user scope, or a project or local
 * install for this project root or for the main checkout of the linked worktree
 * at it. When several records of one plugin apply, the
 * one from the highest scope is kept. The skills, commands, agents, hooks and MCP
 * servers of each enabled, installed plugin are read from its install folder.
 *
 * The locations are {@link LOCATIONS}`.claude`. `CLAUDE_CONFIG_DIR` moves the
 * user folder.
 */

import { basename, dirname, join, resolve } from 'node:path'

import type { HarnessProvider, ProviderContext, ProviderResult } from '../contract.ts'
import { asObject, splitPluginId, str, strings } from '../json.ts'
import { LOCATIONS, SCOPES, type Scope } from '../locations.ts'
import type { Artifact, Hook, Marketplace, McpServer, PermissionRule, Plugin } from '../report.ts'
import { scanInstructions, scanMarkdown, scanSkills, type Provenance } from '../read/artifacts.ts'
import { authEvidence } from '../read/auth.ts'
import { eventsOf, parseNestedHooks } from '../read/hooks.ts'
import { manifestObjects } from '../read/manifest.ts'
import { markActive, parseJsonMcp, serversOf } from '../read/mcp.ts'
import { redactUrl } from '../read/redact.ts'
import { SCOPE_RANK, SourceLog, configDirs, locate } from '../read/sources.ts'

const H = 'claude' as const

type Json = Record<string, unknown>

/** Whether two paths name the same folder, by text or by real path. */
function samePath(ctx: ProviderContext, a: string, b: string): boolean {
  if (resolve(a) === resolve(b)) return true
  const ra = ctx.realpath(a)
  return ra !== null && ra === ctx.realpath(b)
}

/**
 * The main checkout, when `root` is a linked git worktree, else `null`. Read from
 * the `.git` file (`gitdir: <main>/.git/worktrees/<name>`) and that folder's
 * `commondir`, without running git.
 */
function mainCheckoutOf(ctx: ProviderContext, root: string): string | null {
  const dotGit = ctx.readText(join(root, '.git'))
  if (dotGit.status !== 'parsed') return null
  const gitdir = /^gitdir:\s*(.+?)\s*$/m.exec(dotGit.text)?.[1]
  if (!gitdir) return null
  const worktreeDir = resolve(root, gitdir)
  const common = ctx.readText(join(worktreeDir, 'commondir'))
  if (common.status !== 'parsed') return null
  const commonDir = resolve(worktreeDir, common.text.trim())
  return basename(commonDir) === '.git' ? dirname(commonDir) : null
}

function marketplaceOf(
  name: string,
  entry: Json | null,
  scope: Scope,
  source: string,
  redact: boolean,
): Marketplace {
  const src = asObject(entry?.['source'])
  const url = str(src?.['url'])
  return {
    name,
    sourceKind: str(src?.['source']),
    path: str(src?.['path']),
    url: url === null ? null : redact ? redactUrl(url) : url,
    repo: str(src?.['repo']),
    installLocation: str(entry?.['installLocation']),
    scope,
    source,
  }
}

interface Contents {
  skills: Artifact[]
  commands: Artifact[]
  agents: Artifact[]
  hooks: Hook[]
  mcpServers: McpServer[]
}

/** What one installed plugin folder contributes. */
function readPluginFolder(
  ctx: ProviderContext,
  log: SourceLog,
  plugin: Plugin & { installPath: string },
): Contents {
  const root = plugin.installPath
  const origin = `plugin:${plugin.id}`
  const from: Provenance = { scope: plugin.scope, origin, managerOwned: true }
  const redact = !ctx.includeValues

  const manifestPath = join(root, '.claude-plugin', 'plugin.json')
  const manifestRead = ctx.readJson(manifestPath)
  log.record(manifestPath, plugin.scope, 'plugin-manifest', manifestRead)
  const manifest = manifestRead.status === 'parsed' ? manifestRead.value : {}

  const hooksPath = join(root, 'hooks', 'hooks.json')
  const hooksRead = ctx.readJson(hooksPath)
  if (hooksRead.status !== 'absent') log.record(hooksPath, plugin.scope, 'hooks', hooksRead)
  const hookBlocks: { block: Json; source: string }[] = [
    ...(hooksRead.status === 'parsed' ? [{ block: hooksRead.value, source: hooksPath }] : []),
    ...manifestObjects(ctx, root, manifest['hooks']).map((block) => ({
      block,
      source: manifestPath,
    })),
  ]
  const hooks = hookBlocks.flatMap(({ block, source }) =>
    parseNestedHooks(eventsOf(block), { scope: plugin.scope, origin, source }),
  )

  const mcpPath = join(root, '.mcp.json')
  const mcpRead = ctx.readJson(mcpPath)
  if (mcpRead.status !== 'absent') log.record(mcpPath, plugin.scope, 'mcp', mcpRead)
  const mcpBlocks: { block: Json; source: string }[] = [
    ...(mcpRead.status === 'parsed' ? [{ block: mcpRead.value, source: mcpPath }] : []),
    ...manifestObjects(ctx, root, manifest['mcpServers']).map((block) => ({
      block,
      source: manifestPath,
    })),
  ]
  const mcpServers = mcpBlocks.flatMap(({ block, source }) =>
    parseJsonMcp(serversOf(block), { scope: plugin.scope, origin, source }, redact),
  )

  return {
    skills: scanSkills(ctx, join(root, 'skills'), from),
    commands: [
      // A command is a flat `<name>.md`, or a `<name>/SKILL.md` folder; the folder wins.
      ...scanSkills(ctx, join(root, 'commands'), from),
      ...scanMarkdown(ctx, join(root, 'commands'), from, { useFrontmatterName: false }),
    ].filter((c, i, all) => all.findIndex((o) => o.name === c.name) === i),
    agents: scanMarkdown(ctx, join(root, 'agents'), from),
    hooks,
    mcpServers,
  }
}

/** What decides whether Claude Code starts an MCP server. */
interface McpGate {
  /** `.mcp.json` servers named in an `enabledMcpjsonServers` list. */
  approved: ReadonlySet<string>
  /** `.mcp.json` servers named in a `disabledMcpjsonServers` list. */
  rejected: ReadonlySet<string>
  /** The effective `enableAllProjectMcpServers`. */
  approveAll: boolean
  /** Whether `managed-mcp.json` parsed. */
  managedOnly: boolean
}

/**
 * Set `active` on the scoped servers and the plugin servers. The settings
 * follow Claude Code's documentation. Not confirmed against its code: that a
 * rejection beats an approval, that a server not approved does not hide a
 * same-named one from a lower scope, and that `managed-mcp.json` turns off
 * plugin servers too.
 */
function mcpActive(scoped: McpServer[], plugin: McpServer[], gate: McpGate): McpServer[] {
  const approval = (s: McpServer): boolean => {
    if (s.scope !== 'project') return s.active
    if (gate.rejected.has(s.name)) return false
    return gate.approveAll || gate.approved.has(s.name)
  }
  const gated = (s: McpServer): McpServer => ({
    ...s,
    active: gate.managedOnly && s.scope !== 'managed' ? false : approval(s),
  })
  return [
    ...markActive(scoped.map(gated), (s) => SCOPE_RANK[s.scope], false),
    // Plugin servers are namespaced by their plugin, so they never replace another scope's.
    ...plugin.map((s) => (gate.managedOnly ? { ...s, active: false } : s)),
  ]
}

function collectClaude(ctx: ProviderContext): ProviderResult {
  const log = new SourceLog()
  const redact = !ctx.includeValues

  // Settings, lowest precedence first.
  const settings = locate(ctx, H, 'settings')
    .sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope])
    .flatMap((loc) => {
      const value = log.json(ctx, loc, SCOPE_RANK[loc.scope])
      return value ? [{ scope: loc.scope, source: loc.resolved, value }] : []
    })

  const rules: PermissionRule[] = []
  let defaultMode: string | null = null
  let defaultModeSource: string | null = null
  const enabled = new Map<string, { enabled: boolean; scope: Scope; source: string }>()
  const marketplaces: Marketplace[] = []
  const hooks: Hook[] = []
  // `.mcp.json` approval, from every scope; the global state file adds its own below.
  const approved = new Set<string>()
  const rejected = new Set<string>()
  let approveAll = false
  for (const { scope, source, value } of settings) {
    const perms = asObject(value['permissions'])
    for (const kind of ['allow', 'deny', 'ask'] as const) {
      for (const rule of strings(perms?.[kind])) rules.push({ kind, rule, scope, source })
    }
    const mode = str(perms?.['defaultMode']) ?? str(value['defaultMode'])
    if (mode !== null) {
      defaultMode = mode
      defaultModeSource = source
    }
    for (const [id, on] of Object.entries(asObject(value['enabledPlugins']) ?? {})) {
      if (typeof on === 'boolean') enabled.set(id, { enabled: on, scope, source })
    }
    for (const [name, raw] of Object.entries(asObject(value['extraKnownMarketplaces']) ?? {})) {
      marketplaces.push(marketplaceOf(name, asObject(raw), scope, source, redact))
    }
    hooks.push(...parseNestedHooks(value['hooks'], { scope, origin: scope, source }))
    for (const name of strings(value['enabledMcpjsonServers'])) approved.add(name)
    for (const name of strings(value['disabledMcpjsonServers'])) rejected.add(name)
    // The highest scope that sets it wins.
    if (typeof value['enableAllProjectMcpServers'] === 'boolean') {
      approveAll = value['enableAllProjectMcpServers']
    }
  }

  // The global state file holds user and local MCP servers and the sign-in key.
  const globalLoc = locate(ctx, H, 'global-state')[0]
  const global = globalLoc ? log.json(ctx, globalLoc) : null
  const projects = asObject(global?.['projects']) ?? {}
  // The file can name hundreds of projects, so match by text against the root and its real path.
  const roots = new Set([ctx.projectRoot, ctx.realpath(ctx.projectRoot) ?? ctx.projectRoot])
  const projectKey = Object.keys(projects).find((k) => roots.has(resolve(k)))
  const projectEntry = projectKey === undefined ? null : asObject(projects[projectKey])

  const servers: McpServer[] = []
  let managedMcp = false
  for (const loc of locate(ctx, H, 'mcp')) {
    const from = { scope: loc.scope, origin: loc.scope, source: loc.resolved }
    if (loc.scope === 'user') {
      servers.push(...parseJsonMcp(global?.['mcpServers'], from, redact))
    } else if (loc.scope === 'local') {
      servers.push(...parseJsonMcp(projectEntry?.['mcpServers'], from, redact))
    } else {
      const value = log.json(ctx, loc, SCOPE_RANK[loc.scope])
      if (loc.scope === 'managed' && value !== null) managedMcp = true
      servers.push(...parseJsonMcp(value?.['mcpServers'], from, redact))
    }
  }

  // Plugins: the install registry, joined to the effective `enabledPlugins`.
  const plugins: Plugin[] = []
  const registryLoc = locate(ctx, H, 'plugin-registry')[0]
  const registryRead = registryLoc ? ctx.readJson(registryLoc.resolved) : null
  if (registryLoc && registryRead) {
    log.record(registryLoc.resolved, registryLoc.scope, registryLoc.role, registryRead)
  }
  const registry = registryRead?.status === 'parsed' ? registryRead.value : null
  // A project-scoped install made in the main checkout also applies in its linked worktrees.
  const mainCheckout = mainCheckoutOf(ctx, ctx.projectRoot)
  for (const [id, value] of Object.entries(asObject(registry?.['plugins']) ?? {})) {
    // One row per plugin: of the records that apply here, the highest scope's.
    let best: { rec: Json; scope: Scope; projectPath: string | null } | null = null
    for (const raw of Array.isArray(value) ? value : [value]) {
      const rec = asObject(raw)
      if (!rec) continue
      const scope = SCOPES.find((s) => s === rec['scope']) ?? 'user'
      const projectPath = str(rec['projectPath'])
      const appliesHere =
        scope === 'user' ||
        scope === 'managed' ||
        (projectPath !== null &&
          (samePath(ctx, projectPath, ctx.projectRoot) ||
            (mainCheckout !== null && samePath(ctx, projectPath, mainCheckout))))
      if (!appliesHere) continue
      if (best === null || SCOPE_RANK[scope] > SCOPE_RANK[best.scope]) {
        best = { rec, scope, projectPath }
      }
    }
    if (best === null) continue
    const { rec, scope, projectPath } = best
    const on = enabled.get(id)
    plugins.push({
      id,
      ...splitPluginId(id),
      scope,
      projectPath,
      version: str(rec['version']),
      installPath: str(rec['installPath']),
      gitCommitSha: str(rec['gitCommitSha']),
      installed: true,
      enabled: on?.enabled ?? null,
      enabledSource: on?.source ?? null,
      source: registryLoc!.resolved,
    })
  }
  // Plugins named in settings with no install record that applies here.
  const registryKnown = registryRead !== null && registryRead.status !== 'error'
  for (const [id, on] of enabled) {
    if (plugins.some((p) => p.id === id)) continue
    plugins.push({
      id,
      ...splitPluginId(id),
      scope: on.scope,
      projectPath: null,
      version: null,
      installPath: null,
      gitCommitSha: null,
      installed: registryKnown ? false : null,
      enabled: on.enabled,
      enabledSource: on.source,
      source: on.source,
    })
  }

  const marketLoc = locate(ctx, H, 'marketplace-registry')[0]
  const known = marketLoc ? log.json(ctx, marketLoc) : null
  for (const [name, raw] of Object.entries(known ?? {})) {
    marketplaces.push(marketplaceOf(name, asObject(raw), 'user', marketLoc!.resolved, redact))
  }

  // Skills, commands and agents: user and project folders, then each enabled plugin.
  const own = (scope: Scope): Provenance => ({ scope, origin: scope, managerOwned: false })
  const skills = locate(ctx, H, 'skills').flatMap((l) => scanSkills(ctx, l.resolved, own(l.scope)))
  const commands = locate(ctx, H, 'commands').flatMap((l) =>
    scanMarkdown(ctx, l.resolved, own(l.scope), { recursive: true, useFrontmatterName: false }),
  )
  const agents = locate(ctx, H, 'agents').flatMap((l) =>
    scanMarkdown(ctx, l.resolved, own(l.scope)),
  )
  const pluginServers: McpServer[] = []
  for (const plugin of plugins) {
    if (plugin.enabled !== true || plugin.installPath === null) continue
    if (!ctx.isDirectory(plugin.installPath)) {
      log.warn(`${plugin.id}: install folder is missing`, plugin.installPath)
      continue
    }
    const c = readPluginFolder(ctx, log, { ...plugin, installPath: plugin.installPath })
    skills.push(...c.skills)
    commands.push(...c.commands)
    agents.push(...c.agents)
    hooks.push(...c.hooks)
    pluginServers.push(...c.mcpServers)
  }

  const credentials = locate(ctx, H, 'credentials').map((l) => l.resolved)
  return {
    configDirs: configDirs(ctx, H),
    sources: log.sources,
    plugins,
    marketplaces,
    skills,
    commands,
    agents,
    hooks,
    mcpServers: mcpActive(servers, pluginServers, {
      approved: new Set([...approved, ...strings(projectEntry?.['enabledMcpjsonServers'])]),
      rejected: new Set([...rejected, ...strings(projectEntry?.['disabledMcpjsonServers'])]),
      approveAll,
      managedOnly: managedMcp,
    }),
    permissions: { rules, defaultMode, defaultModeSource },
    instructions: scanInstructions(ctx, locate(ctx, H, 'instructions')),
    auth: authEvidence(ctx, {
      files: credentials,
      keys: globalLoc ? [{ path: globalLoc.resolved, key: 'oauthAccount' }] : [],
      env: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
    }),
    diagnostics: log.diagnostics,
  }
}

export const claudeProvider: HarnessProvider = {
  id: H,
  label: LOCATIONS.claude.label,
  kind: 'parse',
  binary: LOCATIONS.claude.binary,
  appBundles: LOCATIONS.claude.appBundles,
  collect: collectClaude,
}

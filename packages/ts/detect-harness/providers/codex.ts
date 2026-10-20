/**
 * The Codex provider: MCP servers, hooks with their trust, skill folders,
 * instruction files and sign-in evidence.
 *
 * The Codex home is `$CODEX_HOME` (made absolute) or `~/.codex`. MCP servers
 * are the `[mcp_servers.<name>]` tables of the user and project `config.toml`;
 * a project server replaces a same-named user one, and `enabled = false` makes
 * a server inactive. Hooks come from the user and project `hooks.json`; each
 * carries the trust Codex recorded for it under `[hooks.state]` in the user
 * `config.toml` (see `../read/hooks.ts`). Plugins, marketplaces and permissions
 * are not read yet.
 */

import { parse as parseToml } from 'smol-toml'

import type { HarnessProvider, ProviderContext, ProviderResult } from '../contract.ts'
import { LOCATIONS, type Scope } from '../locations.ts'
import type { Hook, McpServer } from '../report.ts'
import { scanInstructions, scanSkills } from '../read/artifacts.ts'
import { authEvidence } from '../read/auth.ts'
import {
  codexHookHash,
  codexHookState,
  codexTrust,
  parseNestedHooks,
  snakeEvent,
} from '../read/hooks.ts'
import { markActive, parseCodexMcp } from '../read/mcp.ts'
import { SCOPE_RANK, SourceLog, configDirs, locate, type Located } from '../read/sources.ts'

const H = 'codex' as const

/** Read and parse a TOML location, recording it. */
function readToml(
  ctx: ProviderContext,
  log: SourceLog,
  loc: Located,
): Record<string, unknown> | null {
  const read = ctx.readText(loc.resolved)
  if (read.status !== 'parsed') {
    log.record(loc.resolved, loc.scope, 'config', read, SCOPE_RANK[loc.scope])
    return null
  }
  try {
    const value = parseToml(read.text) as Record<string, unknown>
    log.record(loc.resolved, loc.scope, 'config', read, SCOPE_RANK[loc.scope])
    return value
  } catch (err) {
    const error = `not valid TOML (${err instanceof Error ? err.message : String(err)})`
    log.record(loc.resolved, loc.scope, 'config', { status: 'error', error }, SCOPE_RANK[loc.scope])
    return null
  }
}

function collectCodex(ctx: ProviderContext): ProviderResult {
  const log = new SourceLog()
  const redact = !ctx.includeValues

  const configs = new Map<Scope, Record<string, unknown> | null>()
  for (const loc of locate(ctx, H, 'config')) configs.set(loc.scope, readToml(ctx, log, loc))

  const servers: McpServer[] = []
  for (const loc of locate(ctx, H, 'mcp')) {
    const config = configs.get(loc.scope) ?? null
    const from = { scope: loc.scope, origin: loc.scope, source: loc.resolved }
    servers.push(...parseCodexMcp(config?.['mcp_servers'], from, redact))
  }

  // Trust is recorded in the user config, for user and project hooks alike. In
  // project mode that file is not read, so trust is unknown (`null`).
  const state = ctx.mode === 'full' ? codexHookState(configs.get('user') ?? null) : null
  const hooks: Hook[] = []
  for (const loc of locate(ctx, H, 'hooks')) {
    const doc = log.json(ctx, loc, SCOPE_RANK[loc.scope])
    if (!doc) continue
    // Codex keys trust by the path it read, and by the real path behind a link.
    const real = ctx.realpath(loc.resolved)
    const paths = real === null || real === loc.resolved ? [loc.resolved] : [loc.resolved, real]
    const from = { scope: loc.scope, origin: loc.scope, source: loc.resolved }
    hooks.push(
      ...parseNestedHooks(
        doc['hooks'],
        from,
        state === null
          ? undefined
          : (event, g, h, group, hook) =>
              codexTrust(
                state,
                paths.map((p) => `${p}:${snakeEvent(event)}:${g}:${h}`),
                codexHookHash(event, group, hook),
              ),
      ),
    )
  }

  const skills = locate(ctx, H, 'skills').flatMap((l) =>
    scanSkills(ctx, l.resolved, { scope: l.scope, origin: l.scope, managerOwned: false }),
  )

  return {
    configDirs: configDirs(ctx, H),
    sources: log.sources,
    skills,
    hooks,
    mcpServers: markActive(servers, (s) => SCOPE_RANK[s.scope]),
    instructions: scanInstructions(ctx, locate(ctx, H, 'instructions')),
    auth: authEvidence(ctx, {
      files: locate(ctx, H, 'credentials').map((l) => l.resolved),
      env: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    }),
    diagnostics: log.diagnostics,
  }
}

export const codexProvider: HarnessProvider = {
  id: H,
  label: LOCATIONS.codex.label,
  kind: 'parse',
  binary: LOCATIONS.codex.binary,
  appBundles: LOCATIONS.codex.appBundles,
  collect: collectCodex,
}

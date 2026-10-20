/**
 * The Cursor provider: MCP servers, hooks, skill folders, instruction files and
 * sign-in evidence.
 *
 * Cursor's user folder is `~/.cursor`; it has no environment override.
 * (`SDLC_CURSOR_HOME`, which sdlc's Cursor hook adapter reads, is sdlc's test
 * seam, not something Cursor reads.) MCP servers are the `mcpServers` of the
 * user and project `mcp.json`; a project server replaces a same-named user one.
 * Hooks are the flat `hooks.json` layout; Cursor has no approval step, so their
 * trust is `null`. Plugins, marketplaces and permissions are not read yet.
 */

import type { HarnessProvider, ProviderContext, ProviderResult } from '../contract.ts'
import { LOCATIONS } from '../locations.ts'
import type { Hook, McpServer } from '../report.ts'
import { scanInstructions, scanSkills } from '../read/artifacts.ts'
import { authEvidence } from '../read/auth.ts'
import { parseFlatHooks } from '../read/hooks.ts'
import { markActive, parseJsonMcp } from '../read/mcp.ts'
import { SCOPE_RANK, SourceLog, configDirs, locate } from '../read/sources.ts'

const H = 'cursor' as const

function collectCursor(ctx: ProviderContext): ProviderResult {
  const log = new SourceLog()
  const redact = !ctx.includeValues

  const servers: McpServer[] = []
  for (const loc of locate(ctx, H, 'mcp')) {
    const doc = log.json(ctx, loc, SCOPE_RANK[loc.scope])
    const from = { scope: loc.scope, origin: loc.scope, source: loc.resolved }
    servers.push(...parseJsonMcp(doc?.['mcpServers'], from, redact))
  }

  const hooks: Hook[] = []
  for (const loc of locate(ctx, H, 'hooks')) {
    const doc = log.json(ctx, loc, SCOPE_RANK[loc.scope])
    if (!doc) continue
    hooks.push(
      ...parseFlatHooks(doc['hooks'], {
        scope: loc.scope,
        origin: loc.scope,
        source: loc.resolved,
      }),
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
    auth: authEvidence(ctx, { env: ['CURSOR_API_KEY'] }),
    diagnostics: log.diagnostics,
  }
}

export const cursorProvider: HarnessProvider = {
  id: H,
  label: LOCATIONS.cursor.label,
  kind: 'parse',
  binary: LOCATIONS.cursor.binary,
  appBundles: LOCATIONS.cursor.appBundles,
  collect: collectCursor,
}

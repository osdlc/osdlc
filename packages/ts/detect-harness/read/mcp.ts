/**
 * Parse MCP server maps into report entries, redacting secret values.
 *
 * Two spellings: the JSON `mcpServers` map Claude Code and Cursor share
 * (`type`, `command`, `args`, `env`, `url`, `headers`), and Codex's TOML
 * `[mcp_servers.<name>]` tables (`command`, `args`, `env`, `url`,
 * `http_headers`). Both `detect()` and the `./model` plugin reader use these.
 *
 * Runtime-agnostic: pure.
 */

import { asObject, str, strings } from '../json.ts'
import type { Scope } from '../locations.ts'
import type { McpServer } from '../report.ts'
import { redactArgs, redactUrl, stringRecord } from './redact.ts'

/** Where a server map came from. */
export interface McpOrigin {
  scope: Scope
  origin: string
  source: string
}

/** An MCP file wraps its servers map in `mcpServers`; an inline block is the map itself. */
export function serversOf(block: Record<string, unknown>): unknown {
  return asObject(block['mcpServers']) ?? block
}

/** Parse a JSON `{ name: server }` map. Every server starts `active`; see {@link markActive}. */
export function parseJsonMcp(value: unknown, from: McpOrigin, redact: boolean): McpServer[] {
  const map = asObject(value)
  if (!map) return []
  const out: McpServer[] = []
  for (const [name, raw] of Object.entries(map)) {
    const def = asObject(raw)
    if (!def) continue
    const type = def['type']
    const url = str(def['url'])
    const remote = type === 'http' || type === 'sse' || type === 'streamable-http' || url !== null
    const args = remote ? [] : strings(def['args'])
    out.push({
      name,
      transport: remote ? (type === 'sse' ? 'sse' : 'http') : 'stdio',
      command: remote ? null : str(def['command']),
      args: redact ? redactArgs(args) : args,
      env: remote ? {} : stringRecord(def['env'], redact),
      url: url === null ? null : redact ? redactUrl(url) : url,
      headers: remote ? stringRecord(def['headers'], redact) : {},
      ...from,
      active: true,
    })
  }
  return out
}

/** Parse Codex's `mcp_servers` table. `enabled = false` makes a server inactive. */
export function parseCodexMcp(value: unknown, from: McpOrigin, redact: boolean): McpServer[] {
  const map = asObject(value)
  if (!map) return []
  const out: McpServer[] = []
  for (const [name, raw] of Object.entries(map)) {
    const def = asObject(raw)
    if (!def) continue
    const url = str(def['url'])
    const args = url !== null ? [] : strings(def['args'])
    out.push({
      name,
      transport: url !== null ? 'http' : 'stdio',
      command: url !== null ? null : str(def['command']),
      args: redact ? redactArgs(args) : args,
      env: url !== null ? {} : stringRecord(def['env'], redact),
      url: url === null ? null : redact ? redactUrl(url) : url,
      headers: url !== null ? stringRecord(def['http_headers'], redact) : {},
      ...from,
      active: def['enabled'] !== false,
    })
  }
  return out
}

/**
 * Mark which servers are in effect: of the same-named servers, only the one
 * from the highest-ranked scope stays active, and a server already inactive
 * stays inactive.
 *
 * `inactiveClaims` decides whether an inactive server still holds its name.
 * It does in Codex, where a project `enabled = false` overrides the user's
 * table. It does not in Claude Code, where a project server that is not
 * approved is dropped before the scopes merge.
 */
export function markActive(
  servers: readonly McpServer[],
  rank: (s: McpServer) => number,
  inactiveClaims = true,
): McpServer[] {
  const taken = new Set<string>()
  // Highest rank first; on a tie the one listed first wins.
  const order = [...servers.keys()].sort((a, b) => rank(servers[b]!) - rank(servers[a]!) || a - b)
  const active = servers.map(() => false)
  for (const i of order) {
    const s = servers[i]!
    if (taken.has(s.name) || (!s.active && !inactiveClaims)) continue
    taken.add(s.name)
    active[i] = s.active
  }
  return servers.map((s, i) => ({ ...s, active: active[i]! }))
}

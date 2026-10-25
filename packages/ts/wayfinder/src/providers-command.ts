/**
 * `way providers`: every registered tool, built-in or loaded from a module,
 * with its roles, its runner kind, its binary and whether that binary is on
 * an absolute PATH entry. Reads files only; runs nothing.
 */

import { which } from '@osdlc/command-seam'
import type { RoleName, ToolDef } from '@osdlc/system-model/detect'

import { kit, openSession } from './commands/shared.ts'
import { ProvidersOutput } from './documents.ts'
import { terminalSafe } from './terminal-text.ts'
import { toolSummary } from './tool-info.ts'
import type { LoadedTool } from './tools.ts'

/** One row of the listing, as `--json` prints it in `providers`. */
export interface ProviderRow {
  id: string
  roles: RoleName[]
  /** The runner role's kind; null for a tool with no runner. */
  kind: 'parse' | 'exec' | null
  binary: string | null
  /** Whether `binary` is on the PATH; null when the tool names none. */
  onPath: boolean | null
  source: 'built-in' | 'custom'
  /** The module a custom tool came from. */
  module?: string
  /** The tool's site, `http` or `https` only. Null when it names none. */
  homepage: string | null
  /** One sentence on what the tool is. */
  description: string | null
  /** The ecosystem id, such as `node`. Null for a tool of no one language. */
  ecosystem: string | null
  /** The language label, or `any language`. */
  language: string
}

const ROLE_ORDER: RoleName[] = ['runner', 'packageManager', 'toolManager', 'hookManager']

/** Found on an absolute PATH entry, as detection finds a binary. */
function onPath(binary: string, env: Record<string, string | undefined>): boolean {
  const lookup = { absolutePathOnly: true, env: { PATH: env['PATH'], PATHEXT: env['PATHEXT'] } }
  return which(binary, lookup) !== undefined
}

/** One row per registered tool, in registry order. */
export function providerRows(
  tools: readonly ToolDef[],
  custom: readonly LoadedTool[],
  env: Record<string, string | undefined>,
): ProviderRow[] {
  return tools.map((t) => {
    const from = custom.find((c) => c.def === t)
    const info = toolSummary(t)
    return {
      id: t.id,
      roles: ROLE_ORDER.filter((r) => t.roles[r] !== undefined),
      kind: t.roles.runner?.kind ?? null,
      binary: t.binary ?? null,
      onPath: t.binary === undefined ? null : onPath(t.binary, env),
      source: from === undefined ? 'built-in' : 'custom',
      ...(from !== undefined ? { module: from.module } : {}),
      homepage: info.homepage,
      description: info.description,
      ecosystem: info.ecosystem,
      language: info.language,
    }
  })
}

function table(rows: ProviderRow[]): string {
  // Tool ids and module paths can come from a project's config.
  const cells = rows.map((r) =>
    [
      r.id,
      r.roles.join(',') || '-',
      r.kind ?? '-',
      r.binary ?? '-',
      r.onPath === null ? '-' : r.onPath ? 'yes' : 'no',
      r.language,
      r.source === 'custom' && r.module !== undefined ? `custom ${r.module}` : r.source,
      r.homepage ?? '-',
    ].map((cell) => terminalSafe(cell)),
  )
  const head = ['tool', 'roles', 'kind', 'binary', 'on PATH', 'language', 'source', 'homepage']
  const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i]!.length)))
  const fmt = (c: string[]) =>
    c
      .map((v, i) => (i === c.length - 1 ? v : v.padEnd(widths[i]!)))
      .join('  ')
      .trimEnd()
  return [fmt(head), ...cells.map(fmt)].join('\n') + '\n'
}

/** Make the `providers` command. */
export function providersCommand(home: string) {
  return kit.command({
    summary: 'the registered tools, built-in and your own',
    description:
      'Every tool wayfinder knows, with its roles, its runner kind, its binary and whether that ' +
      'binary is on an absolute PATH entry. Reads files only; runs nothing. A custom tool comes ' +
      'from --config, from "tools" in the user config, or from "tools" in the project file when ' +
      "the repository is trusted and execution is allowed. kind is the runner role's: parse " +
      "reads files, exec runs the repository's tools and needs trust. Each tool has its " +
      'language and homepage; --json adds its description.',
    output: ProvidersOutput,
    kind: 'providers',
    readOnly: true,
    async run({ globals }, ctx) {
      const session = await openSession(globals, ctx, home)
      return { providers: providerRows(session.project.tools, session.tools, ctx.env) }
    },
    text(output) {
      return table(output.providers as ProviderRow[])
    },
  })
}

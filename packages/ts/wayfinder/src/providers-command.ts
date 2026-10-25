/**
 * `way providers`: every registered tool, built-in or loaded from a module,
 * with its roles, its runner kind, its binary and whether that binary is on
 * the PATH. Reads files only; runs nothing.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { EXIT, type CliIo } from '@osdlc/cli-tool'
import type { Project, RoleName, ToolDef } from '@osdlc/system-model/detect'
import { homeDir, policyExecGate } from '@osdlc/trust-repo'

import { APP, BIN } from './app.ts'
import {
  ConfigError,
  loadConfig,
  trustPolicyFromConfig,
  trustPolicyOptions,
  type LoadedConfig,
} from './config.ts'
import { jsonText, terminalSafe } from './terminal-text.ts'
import { appTrustStore } from './trust-store.ts'
import type { LoadedTool } from './tools.ts'

export interface ProvidersCommandIO extends CliIo {
  env?: Record<string, string | undefined>
  home?: string
  /** The configured `allowExec`, with wayfinder's default; `main` supplies it. */
  configuredAllowExec: (cfg: LoadedConfig) => boolean
  /** Load the tool modules and build the project; `main` supplies it. */
  load: (
    cfg: LoadedConfig,
    modules: readonly string[],
    projectAllowed: boolean,
  ) => Promise<{ project: Project; tools: LoadedTool[]; warnings: string[] } | { error: string }>
}

/** One row of the listing, as `--json` prints it. */
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
}

const ROLE_ORDER: RoleName[] = ['runner', 'packageManager', 'toolManager', 'hookManager']

function usage(): string {
  return `${BIN} providers — the tools ${APP} knows, built-in and your own

usage: ${BIN} providers [options]

  --config MODULE     also load the tools a module exports; repeatable
  --json              the same rows as a JSON array
  -C, --dir PATH      the project whose config to read (default: cwd)
  -h, --help          this text

A custom tool comes from --config, from "tools" in the user config, or from
"tools" in the project file when the repository is trusted and execution is
allowed. kind is the runner
role's: parse reads files, exec runs the repository's tools and needs trust.
`
}

function onPath(binary: string, env: Record<string, string | undefined>): boolean {
  for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    if (dir === '') continue
    try {
      const file = join(dir, binary)
      if (!statSync(file).isFile()) continue
      accessSync(file, constants.X_OK)
      return true
    } catch {
      // Not here.
    }
  }
  return false
}

/** One row per registered tool, in registry order. */
export function providerRows(
  tools: readonly ToolDef[],
  custom: readonly LoadedTool[],
  env: Record<string, string | undefined>,
): ProviderRow[] {
  return tools.map((t) => {
    const from = custom.find((c) => c.def === t)
    return {
      id: t.id,
      roles: ROLE_ORDER.filter((r) => t.roles[r] !== undefined),
      kind: t.roles.runner?.kind ?? null,
      binary: t.binary ?? null,
      onPath: t.binary === undefined ? null : onPath(t.binary, env),
      source: from === undefined ? 'built-in' : 'custom',
      ...(from !== undefined ? { module: from.module } : {}),
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
      r.source === 'custom' && r.module !== undefined ? `custom ${r.module}` : r.source,
    ].map((cell) => terminalSafe(cell)),
  )
  const head = ['tool', 'roles', 'kind', 'binary', 'on PATH', 'source']
  const widths = head.map((h, i) => Math.max(h.length, ...cells.map((c) => c[i]!.length)))
  const fmt = (c: string[]) =>
    c
      .map((v, i) => (i === c.length - 1 ? v : v.padEnd(widths[i]!)))
      .join('  ')
      .trimEnd()
  return [fmt(head), ...cells.map(fmt)].join('\n') + '\n'
}

/** `way providers …`. Returns the exit code. */
export async function runProvidersCommand(
  root: string,
  argv: string[],
  io: ProvidersCommandIO,
): Promise<number> {
  const env = io.env ?? process.env
  const home = io.home ?? homeDir()
  let json = false
  const modules: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '-h' || arg === '--help') {
      io.stdout(usage())
      return EXIT.ok
    } else if (arg === '--json') json = true
    else if (arg === '--config' || arg.startsWith('--config=')) {
      const value = arg === '--config' ? argv[++i] : arg.slice('--config='.length)
      if (value === undefined || value === '') {
        io.stderr(`${APP}: --config needs a module path\n\n${usage()}`)
        return EXIT.usage
      }
      modules.push(value)
    } else {
      io.stderr(`${APP}: unknown option: ${arg}\n\n${usage()}`)
      return EXIT.usage
    }
  }

  let cfg: LoadedConfig
  try {
    cfg = await loadConfig(root, env, home)
  } catch (err) {
    if (err instanceof ConfigError) {
      io.stderr(`${APP}: ${err.message}\n`)
      return EXIT.error
    }
    throw err
  }
  for (const warning of cfg.warnings) io.stderr(`warning: ${warning}\n`)

  // The same gate `way` applies: project modules need trust and execution allowed.
  const gate = await policyExecGate(
    appTrustStore({ env, home }),
    trustPolicyFromConfig(cfg.effective),
    { root, configured: io.configuredAllowExec(cfg) },
    trustPolicyOptions(home),
  )
  const built = await io.load(cfg, modules, gate.trusted && gate.allowExec)
  if ('error' in built) {
    io.stderr(`${APP}: ${built.error}\n`)
    return EXIT.error
  }
  for (const warning of built.warnings) io.stderr(`warning: ${warning}\n`)

  const rows = providerRows(built.project.tools, built.tools, env)
  io.stdout(json ? `${jsonText(rows, 2)}\n` : table(rows))
  return EXIT.ok
}

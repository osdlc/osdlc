import { claudeAdapter } from './adapters/claude.js'
import { codexAdapter } from './adapters/codex.js'
import { antigravityAdapter } from './adapters/antigravity.js'
import { opencodeAdapter } from './adapters/opencode.js'
import { copilotAdapter } from './adapters/copilot.js'
import { piAdapter } from './adapters/pi.js'
import { qwenAdapter } from './adapters/qwen.js'
import { droidAdapter } from './adapters/droid.js'
import { cursorAdapter } from './adapters/cursor.js'
import { deepseekAdapter } from './adapters/deepseek.js'
import type { AgentAdapter } from './adapters/types.js'
import { spawnCollect } from './spawn.js'
import type { CommandOptions } from './adapters/shared.js'
import type { AgentName } from './spec.js'

/**
 * Instantiate a built-in adapter by name. `options` takes `binary` or
 * `command`, as each adapter's own options do.
 */
export function adapterFor(name: AgentName, options: CommandOptions = {}): AgentAdapter {
  switch (name) {
    case 'claude':
      return claudeAdapter(options)
    case 'codex':
      return codexAdapter(options)
    case 'antigravity':
      return antigravityAdapter(options)
    case 'opencode':
      return opencodeAdapter(options)
    case 'copilot':
      return copilotAdapter(options)
    case 'pi':
      return piAdapter(options)
    case 'qwen':
      return qwenAdapter(options)
    case 'droid':
      return droidAdapter(options)
    case 'cursor':
      return cursorAdapter(options)
    case 'deepseek':
      return deepseekAdapter(options)
  }
}

/** The names `adapterFor` accepts, in a fixed order. Frozen at run time. */
export const BUILTIN_AGENTS: readonly AgentName[] = Object.freeze([
  'claude',
  'codex',
  'antigravity',
  'opencode',
  'copilot',
  'pi',
  'qwen',
  'droid',
  'cursor',
  'deepseek',
])

/** Whether one agent CLI is installed, as `detectAgents` reports it. */
export interface AgentAvailability {
  /** The adapter's name. */
  name: string
  /**
   * `<command> --version` ran, exited 0 and finished within 10 seconds. The
   * command is the adapter's `command`, or its `binary`.
   */
  available: boolean
  /** First line of the `--version` output, when available. */
  version?: string | undefined
}

/**
 * Probe which agent CLIs are installed, by running each adapter's command
 * (its `command`, else its `binary`) with `--version` appended.
 */
export async function detectAgents(
  adapters: AgentAdapter[] = BUILTIN_AGENTS.map((name) => adapterFor(name)),
): Promise<AgentAvailability[]> {
  return Promise.all(
    adapters.map(async (adapter) => {
      const version = await probeVersion(adapter.command ?? [adapter.binary])
      return {
        name: adapter.name,
        available: version !== undefined,
        version,
      }
    }),
  )
}

/** @internal `timeoutMs` is a parameter so a test can shorten it. */
export async function probeVersion(
  command: readonly string[],
  timeoutMs = 10_000,
): Promise<string | undefined> {
  const raw = await spawnCollect([...command, '--version'], { env: process.env, timeoutMs })
  return raw.exitCode === 0 && !raw.timedOut ? raw.stdout.trim().split('\n')[0] : undefined
}

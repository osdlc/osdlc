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
  /**
   * The command that answered, when available. It is the adapter's command,
   * except for the default cursor adapter when `agent` is not the Cursor CLI
   * and `cursor-agent` answers instead: then it is `['cursor-agent']`, which
   * `cursorAdapter({ command })` takes.
   */
  command?: readonly string[] | undefined
}

/**
 * Probe which agent CLIs are installed, by running each adapter's command
 * (its `command`, else its `binary`) with `--version` appended. `agent`, the
 * default cursor adapter's binary, is a generic name, so it counts only when
 * its version is date-stamped, such as `2026.10.01-abc123`; otherwise the
 * default cursor adapter tries `cursor-agent`, the CLI's other install name.
 */
export async function detectAgents(
  adapters: AgentAdapter[] = BUILTIN_AGENTS.map((name) => adapterFor(name)),
): Promise<AgentAvailability[]> {
  return Promise.all(
    adapters.map(async (adapter) => {
      let command = adapter.command ?? [adapter.binary]
      let version = await probeVersion(command)
      if (isDefaultCursor(adapter.name, command)) {
        if (version !== undefined && !CURSOR_VERSION.test(version)) version = undefined
        if (version === undefined) {
          version = await probeVersion(CURSOR_FALLBACK)
          command = CURSOR_FALLBACK
        }
      }
      return {
        name: adapter.name,
        available: version !== undefined,
        version,
        command: version === undefined ? undefined : Object.freeze([...command]),
      }
    }),
  )
}

const CURSOR_FALLBACK: readonly string[] = Object.freeze(['cursor-agent'])
const CURSOR_VERSION = /^\d{4}\.\d{1,2}\.\d{1,2}\b/

function isDefaultCursor(name: string, command: readonly string[]): boolean {
  return name === 'cursor' && command.length === 1 && command[0] === 'agent'
}

/** @internal `timeoutMs` is a parameter so a test can shorten it. */
export async function probeVersion(
  command: readonly string[],
  timeoutMs = 10_000,
): Promise<string | undefined> {
  const raw = await spawnCollect([...command, '--version'], { env: process.env, timeoutMs })
  return raw.exitCode === 0 && !raw.timedOut ? raw.stdout.trim().split('\n')[0] : undefined
}

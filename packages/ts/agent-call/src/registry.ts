import { spawn } from 'node:child_process'

import { claudeAdapter } from './adapters/claude.js'
import { codexAdapter } from './adapters/codex.js'
import { antigravityAdapter } from './adapters/antigravity.js'
import { opencodeAdapter } from './adapters/opencode.js'
import type { AgentAdapter } from './adapters/types.js'
import type { AgentName } from './spec.js'

/** Instantiate a built-in adapter by name. */
export function adapterFor(name: AgentName, options: { binary?: string } = {}): AgentAdapter {
  switch (name) {
    case 'claude':
      return claudeAdapter(options)
    case 'codex':
      return codexAdapter(options)
    case 'antigravity':
      return antigravityAdapter(options)
    case 'opencode':
      return opencodeAdapter(options)
  }
}

/** The names `adapterFor` accepts, in a fixed order. Frozen at run time. */
export const BUILTIN_AGENTS: readonly AgentName[] = Object.freeze([
  'claude',
  'codex',
  'antigravity',
  'opencode',
])

/** Whether one agent CLI is installed, as `detectAgents` reports it. */
export interface AgentAvailability {
  /** The adapter's name. */
  name: string
  /** `<binary> --version` ran and exited 0. */
  available: boolean
  /** First line of the `--version` output, when available. */
  version?: string | undefined
}

/** Probe which agent CLIs are installed (via `<binary> --version`). */
export async function detectAgents(
  adapters: AgentAdapter[] = BUILTIN_AGENTS.map((name) => adapterFor(name)),
): Promise<AgentAvailability[]> {
  return Promise.all(
    adapters.map(async (adapter) => {
      const version = await probeVersion(adapter.binary)
      return {
        name: adapter.name,
        available: version !== undefined,
        version,
      }
    }),
  )
}

function probeVersion(binary: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let out = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(undefined)
    }, 10_000)
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(undefined)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 ? out.trim().split('\n')[0] : undefined)
    })
  })
}

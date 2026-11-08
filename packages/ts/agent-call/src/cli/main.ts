import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { adapterFor, BUILTIN_AGENTS } from '../registry.js'
import { callAgent, planCall } from '../run.js'
import type { CapabilityNote, PlannedCall } from '../plan.js'
import type { AgentName } from '../spec.js'
import { EXIT_AGENT_ERROR, EXIT_OK, EXIT_STRICT, EXIT_USAGE, UsageError } from './errors.js'
import { parseInputs } from './inputs.js'
import { loadSpecFile, resolveCall } from './spec-file.js'

export interface CliIo {
  stdout: (text: string) => void
  stderr: (text: string) => void
  cwd: string
}

export const USAGE = `usage: agent-call run <spec.yml|spec.json> [--agent <id>] [--root <dir>]
                     [--input name=value | name=@file]... [--explain] [--dry-run]

exit codes: 0 success, 1 the agent run failed, 2 usage or spec error,
            3 strict mode refused the call (approximated or dropped fields)
`

/** Notes that make a call differ from what the spec asked for. */
export function strictViolations(notes: readonly CapabilityNote[]): CapabilityNote[] {
  return notes.filter((n) => n.support === 'approximated' || n.support === 'dropped')
}

/** The plan as text for `--explain` and `--dry-run`: agent, argv, env var names, notes. Never env values. */
export function explainText(
  planned: PlannedCall,
  extra: readonly { field: string; detail: string }[],
): string {
  const lines = [`agent: ${planned.agent}`, `argv: ${JSON.stringify(planned.argv)}`]
  lines.push(`env: ${Object.keys(planned.env).sort().join(', ') || '(none)'}`)
  lines.push(`prompt: ${planned.stdin !== undefined ? 'stdin' : 'argv'}`)
  const notes = [
    ...planned.notes.map((n) => `${n.support} ${n.field}: ${n.detail}`),
    ...extra.map((n) => `dropped ${n.field}: ${n.detail}`),
  ]
  lines.push(notes.length === 0 ? 'notes: (none)' : 'notes:', ...notes.map((n) => `  ${n}`))
  return lines.join('\n') + '\n'
}

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    return await run(argv, io)
  } catch (err) {
    if (err instanceof UsageError) {
      io.stderr(`agent-call: ${err.message}\n`)
      return EXIT_USAGE
    }
    throw err
  }
}

async function run(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        agent: { type: 'string' },
        root: { type: 'string' },
        input: { type: 'string', multiple: true },
        explain: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (err) {
    throw new UsageError(`${(err as Error).message}\n${USAGE}`)
  }
  const { values, positionals } = parsed
  if (values.help === true) {
    io.stdout(USAGE)
    return EXIT_OK
  }
  const specPath = positionals[1]
  if (positionals[0] !== 'run' || positionals.length !== 2 || specPath === undefined) {
    throw new UsageError(USAGE)
  }

  const root = resolve(io.cwd, values.root ?? '.')
  const file = loadSpecFile(resolve(io.cwd, specPath))
  const inputs = parseInputs(values.input ?? [], io.cwd)
  const agentId = values.agent ?? file.agent ?? file.setupHarness
  if (agentId === undefined) {
    throw new UsageError('no agent: pass --agent, or set run.agent or setup.harness in the spec')
  }
  if (!(BUILTIN_AGENTS as readonly string[]).includes(agentId)) {
    throw new UsageError(`unknown agent "${agentId}"; one of: ${BUILTIN_AGENTS.join(', ')}`)
  }
  const { spec, unsupported } = resolveCall(file, root, inputs)
  const adapter = adapterFor(agentId as AgentName)
  const planned = planCall(adapter, spec)

  if (values.explain === true || values['dry-run'] === true) {
    io.stderr(explainText(planned, unsupported))
  }
  if (file.strict) {
    const bad = [
      ...strictViolations(planned.notes).map((n) => `${n.support} ${n.field}: ${n.detail}`),
      ...unsupported.map((n) => `dropped ${n.field}: ${n.detail}`),
    ]
    if (bad.length > 0) {
      io.stderr(
        `agent-call: strict mode refused the call:\n${bad.map((b) => `  ${b}`).join('\n')}\n`,
      )
      return EXIT_STRICT
    }
  }
  if (values['dry-run'] === true) return EXIT_OK

  const result = await callAgent(adapter, spec)
  const { raw: _raw, planned: _planned, events: _events, ...normalized } = result
  io.stdout(
    JSON.stringify({ ...normalized, agent: planned.agent, notes: planned.notes }, null, 2) + '\n',
  )
  return result.ok ? EXIT_OK : EXIT_AGENT_ERROR
}

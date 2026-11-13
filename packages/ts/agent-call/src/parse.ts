import type { AgentAdapter, ParsedOutput } from './adapters/types.js'
import { asNumber, asString, get, tryParseJson } from './adapters/shared.js'
import type { PlannedCall } from './plan.js'
import { builtinAdapter } from './registry.js'
import type { AgentName, OutputFormat } from './spec.js'

/**
 * Parse a CLI's output into the fields `callAgent` returns, for a caller that
 * spawned the process itself. `format` is the `--output-format` (or `--json`)
 * the CLI was asked for: the format the adapter's `plan` would have chosen.
 * `schema` marks that a structured answer was requested, as
 * `spec.output.schema` does. `exitCode` defaults to `0`.
 *
 * It does the work of `adapter.parseResult` without a `PlannedCall`, and
 * where the output carries a `modelUsage` map (claude's json envelope) it also
 * fills `model` with the model that used the most tokens.
 *
 * Never throws. Empty or malformed output, or an unknown agent name, gives
 * `{ text: '' }` with every other field `undefined`; an
 * adapter that reads the output but finds no result sets `isError`. A
 * `codex` text run reads its answer from a file the runner arranges, so
 * `text` is stdout. Call `adapter.parseResult` directly if you need that.
 *
 * @experimental
 */
export function parseOutput(
  agent: AgentAdapter | AgentName,
  stdout: string,
  format: OutputFormat,
  options: { stderr?: string; exitCode?: number | null; schema?: Record<string, unknown> } = {},
): ParsedOutput {
  try {
    const adapter = typeof agent === 'string' ? builtinAdapter(agent) : agent
    if (adapter === undefined) return { text: '' }
    const planned: PlannedCall = {
      agent: adapter.name,
      argv: [adapter.binary],
      env: {},
      outputFormat: format,
      tempFiles: [],
      notes: [],
      spec: {
        prompt: '',
        output: { format, ...(options.schema === undefined ? {} : { schema: options.schema }) },
      },
    }
    const parsed = adapter.parseResult(planned, {
      stdout,
      stderr: options.stderr ?? '',
      exitCode: options.exitCode === undefined ? 0 : options.exitCode,
      durationMs: 0,
      timedOut: false,
    })
    if (parsed.model === undefined && format === 'json') {
      const model = dominantModel(get(tryParseJson(stdout), 'modelUsage'))
      if (model !== undefined) parsed.model = model
    }
    return parsed
  } catch {
    return { text: '' }
  }
}

/**
 * The model with the most tokens in claude's `modelUsage` map. A run can span
 * several models (a small model for side calls), and the one that did most of
 * the work is the run's model.
 */
function dominantModel(modelUsage: unknown): string | undefined {
  if (modelUsage === null || typeof modelUsage !== 'object') return undefined
  let best: { model: string; tokens: number } | undefined
  for (const [model, usage] of Object.entries(modelUsage)) {
    const tokens = [
      'inputTokens',
      'outputTokens',
      'cacheReadInputTokens',
      'cacheCreationInputTokens',
    ]
      .map((key) => asNumber(get(usage, key)) ?? 0)
      .reduce((a, b) => a + b, 0)
    if (best === undefined || tokens > best.tokens) best = { model, tokens }
  }
  return asString(best?.model)
}

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './adapters/types.js'
import type { Conversation } from './conversation.js'
import { TMP_TOKEN, type PlannedCall } from './plan.js'
import { spawnCollect } from './spawn.js'
import type { AgentCallSpec } from './spec.js'

/**
 * Why a run failed, on `AgentResult.error`. `callAgent` returns it instead of
 * throwing.
 *
 * `reason` is open: a later minor release may add reasons. Handle the ones you
 * know and keep a default branch for the rest.
 */
export interface CallError {
  /**
   * - `spawn-failed` — the process never started (binary missing, empty argv).
   * - `timeout` — `timeoutMs` elapsed or the caller aborted.
   * - `nonzero-exit` — the process exited with a nonzero code, or ended on a
   *   signal the runner did not send (such as an out-of-memory kill); `detail`
   *   names the signal.
   * - `agent-error` — the process exited 0 but the agent reported failure, or
   *   the adapter's parser threw on the output.
   * - `output-limit` — stdout or stderr passed `maxOutputBytes`, and the run
   *   was stopped; `detail` names the stream.
   */
  reason: 'spawn-failed' | 'timeout' | 'nonzero-exit' | 'agent-error' | 'output-limit'
  /** A human-readable explanation, taken from the agent's output where there is one. */
  detail: string
}

/** Everything a run produced: normalized fields plus the untouched raw output. */
export interface AgentResult extends ParsedOutput {
  ok: boolean
  exitCode: number | null
  durationMs: number
  error?: CallError | undefined
  /** The exact invocation that ran — argv, env additions, notes, spec. */
  planned: PlannedCall
  /** Raw process output, always preserved. */
  raw: RawProcessOutput
  /** Normalized transcript, when `captureConversation` was requested. */
  conversation?: Conversation | undefined
}

/** Per-run options for `callAgent`, separate from the spec. */
export interface CallOptions {
  /** Also lift the transcript into the normalized conversation model. */
  captureConversation?: boolean | undefined
  /** Abort the run early: kills the child, or skips the spawn if already aborted. */
  signal?: AbortSignal | undefined
}

/**
 * Plan a call without running it: the exact argv, stdin, env, temp files,
 * and capability notes the adapter would use. Pure and side-effect free.
 *
 * @throws Whatever the adapter's `plan` throws: see `templateAdapter`'s
 * `@throws`; and `customAdapter` lets its `args` function throw.
 */
export function planCall(adapter: AgentAdapter, spec: AgentCallSpec): PlannedCall {
  return adapter.plan(spec)
}

/**
 * Translate the spec through the adapter, run the CLI, normalize the result.
 * Never throws on agent failure: a failed run returns `ok: false` with an
 * `error`.
 *
 * Runs the child in its own process group and kills the group on timeout or
 * abort, so it needs POSIX process groups (Linux, macOS). The child inherits
 * the parent's environment plus `spec.env`.
 *
 * Because the agent has its own process group, a terminal Ctrl+C or a kill of
 * the host does not reach it, and it keeps running. A host that can be
 * interrupted must pass a `signal` and abort it from its own SIGINT/SIGTERM
 * handler. The runner installs no exit handlers.
 *
 * @throws The returned promise rejects, rather than resolving `ok: false`,
 * with a `RangeError` when `spec.maxOutputBytes` is not a positive integer or
 * `Infinity`; when planning throws (see {@link planCall}); when a `TempFile.name` is not a
 * plain file name (empty, or holding `/`, `\` or `..`), or when the per-call
 * temp directory cannot be created or written. A directory that was made is
 * removed. A parser that throws on the output does not reject: the result is
 * `ok: false` with reason `agent-error`.
 */
export async function callAgent(
  adapter: AgentAdapter,
  spec: AgentCallSpec,
  options: CallOptions = {},
): Promise<AgentResult> {
  const maxOutputBytes = outputCap(spec.maxOutputBytes)
  const planned = adapter.plan(spec)
  const raw = await execute(planned, spec, maxOutputBytes, options.signal)

  let error: CallError | undefined
  if (raw.outputLimit !== undefined) {
    error = {
      reason: 'output-limit',
      detail: `${raw.outputLimit} passed maxOutputBytes (${maxOutputBytes} bytes); the run was stopped and its output truncated`,
    }
  } else if (raw.exitCode === null && !raw.timedOut) {
    error =
      raw.signal === undefined
        ? { reason: 'spawn-failed', detail: raw.stderr.trim() }
        : {
            reason: 'nonzero-exit',
            detail: `${planned.argv[0]} was killed by signal ${raw.signal}: ${raw.stderr.trim().slice(0, 500)}`,
          }
  } else if (raw.timedOut) {
    error = {
      reason: 'timeout',
      detail:
        raw.cutShortBy === 'abort'
          ? 'aborted by the caller'
          : `killed after ${spec.timeoutMs ?? 0}ms`,
    }
  }

  let parsed: ParsedOutput = { text: raw.stdout.trim() }
  if (error === undefined) {
    try {
      parsed = adapter.parseResult(planned, raw)
    } catch (err) {
      error = {
        reason: 'agent-error',
        detail: `the adapter's parser threw: ${errorMessage(err)}`,
      }
    }
  }

  if (error === undefined && raw.exitCode !== 0) {
    const stderrTail = raw.stderr.trim().slice(0, 500)
    error = {
      reason: 'nonzero-exit',
      detail: [
        parsed.errorDetail,
        stderrTail === ''
          ? `${planned.argv[0]} exited ${raw.exitCode}`
          : `${planned.argv[0]} exited ${raw.exitCode}: ${stderrTail}`,
      ]
        .filter((part) => part !== undefined && part !== '')
        .join('; '),
    }
  } else if (error === undefined && parsed.isError === true) {
    error = {
      reason: 'agent-error',
      detail: parsed.errorDetail ?? 'the agent reported an error',
    }
  }

  const result: AgentResult = {
    ...parsed,
    ok: error === undefined,
    exitCode: raw.exitCode,
    durationMs: raw.durationMs,
    error,
    planned,
    raw,
  }
  if (options.captureConversation === true && adapter.toConversation) {
    try {
      result.conversation = adapter.toConversation(planned, raw)
    } catch (err) {
      result.ok = false
      result.error ??= {
        reason: 'agent-error',
        detail: `the adapter's parser threw: ${errorMessage(err)}`,
      }
    }
  }
  return result
}

/** `maxOutputBytes` as the runner applies it: `undefined` for no cap. */
function outputCap(value: number | undefined): number | undefined {
  if (value === undefined || value === Infinity) return undefined
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`maxOutputBytes must be a positive integer or Infinity, got ${value}`)
  }
  return value
}

function isPlainFileName(name: string): boolean {
  return name !== '' && !name.includes('/') && !name.includes('\\') && !name.includes('..')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function execute(
  planned: PlannedCall,
  spec: AgentCallSpec,
  maxOutputBytes: number | undefined,
  signal?: AbortSignal,
): Promise<RawProcessOutput> {
  for (const file of planned.tempFiles) {
    if (!isPlainFileName(file.name)) {
      throw new Error(`temp file name ${JSON.stringify(file.name)} is not a plain file name`)
    }
  }
  let tempDir: string | undefined
  if (planned.tempFiles.length > 0) {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-call-'))
  }
  try {
    if (tempDir !== undefined) {
      for (const file of planned.tempFiles) {
        await writeFile(join(tempDir, file.name), file.content, 'utf8')
      }
    }
    const resolveTmp = (value: string): string =>
      tempDir === undefined ? value : value.replaceAll(TMP_TOKEN, tempDir)

    const argv = planned.argv.map(resolveTmp)
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const [key, value] of Object.entries(planned.env)) {
      env[key] = resolveTmp(value)
    }

    const startedAt = Date.now()
    const raw = await spawnCollect(argv, {
      stdin: planned.stdin,
      cwd: planned.cwd,
      env,
      timeoutMs: spec.timeoutMs,
      signal,
      maxOutputBytes,
    })
    raw.durationMs = Date.now() - startedAt

    if (tempDir !== undefined) {
      const files: Record<string, string> = {}
      for (const file of planned.tempFiles) {
        if (file.readBack !== true) continue
        try {
          files[file.name] = await readFile(join(tempDir, file.name), 'utf8')
        } catch {
          // The CLI may not have written it (e.g. errored before finishing).
        }
      }
      if (Object.keys(files).length > 0) raw.files = files
    }
    return raw
  } finally {
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

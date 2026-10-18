import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentAdapter, ParsedOutput, RawProcessOutput } from './adapters/types.js'
import type { Conversation } from './conversation.js'
import { TMP_TOKEN, type PlannedCall } from './plan.js'
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
   */
  reason: 'spawn-failed' | 'timeout' | 'nonzero-exit' | 'agent-error'
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

/** Grace period between SIGTERM and SIGKILL on timeout/abort. */
const KILL_GRACE_MS = 5_000

/**
 * Plan a call without running it: the exact argv, stdin, env, temp files,
 * and capability notes the adapter would use. Pure and side-effect free.
 *
 * @throws Whatever the adapter's `plan` throws: `templateAdapter` throws an
 * `Error` when the spec's model or effort does not fit its slots, and
 * `customAdapter` lets its `args` function throw.
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
 * @throws The returned promise rejects, rather than resolving `ok: false`, in
 * two cases: planning throws (see {@link planCall}), or the per-call temp
 * directory for the plan's temp files cannot be created or written, or a
 * `TempFile.name` is not a plain file name (empty, or holding `/`, `\\` or
 * `..`). The directory is removed in every case. A parser
 * that throws on the output does not reject: the result is `ok: false` with
 * reason `agent-error`.
 */
export async function callAgent(
  adapter: AgentAdapter,
  spec: AgentCallSpec,
  options: CallOptions = {},
): Promise<AgentResult> {
  const planned = adapter.plan(spec)
  const raw = await execute(planned, spec, options.signal)

  let error: CallError | undefined
  if (raw.exitCode === null && !raw.timedOut) {
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
        options.signal?.aborted === true
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
    error = {
      reason: 'nonzero-exit',
      detail: [
        parsed.errorDetail,
        `${planned.argv[0]} exited ${raw.exitCode}: ${raw.stderr.trim().slice(0, 500)}`,
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

function isPlainFileName(name: string): boolean {
  return name !== '' && !name.includes('/') && !name.includes('\\') && !name.includes('..')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function execute(
  planned: PlannedCall,
  spec: AgentCallSpec,
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

interface SpawnOptions {
  stdin?: string | undefined
  cwd?: string | undefined
  env: NodeJS.ProcessEnv
  timeoutMs?: number | undefined
  signal?: AbortSignal | undefined
}

/** Spawn, collect output, honor timeout and abort. Shared with `detectAgents`. */
export function spawnCollect(argv: string[], options: SpawnOptions): Promise<RawProcessOutput> {
  return new Promise((resolve) => {
    const [binary, ...args] = argv
    if (binary === undefined) {
      resolve({
        stdout: '',
        stderr: 'empty argv',
        exitCode: null,
        durationMs: 0,
        timedOut: false,
      })
      return
    }

    // An already-aborted signal never fires `abort` again, so it has to be
    // honored before spawn — otherwise the agent runs the full turn. The
    // result mirrors a mid-run abort: cut short, with no exit code.
    if (options.signal?.aborted === true) {
      resolve({
        stdout: '',
        stderr: '',
        exitCode: null,
        durationMs: 0,
        timedOut: true,
      })
      return
    }

    // Raw `node:child_process`, not the command seam: the package stays
    // dependency-free and this manages a long-lived process group (D-07).
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Own process group, so a timeout/abort can kill the whole tree. Without
      // it, a shell child (e.g. `sh -c "sleep 30"`) leaves its grandchild
      // orphaned holding the stdio pipe open, and `close` never fires — the
      // call hangs until the real command ends instead of honoring timeoutMs.
      detached: true,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let stdinError: string | undefined
    let settled = false

    let killTimer: ReturnType<typeof setTimeout> | undefined
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    const killTree = (signal: NodeJS.Signals): void => {
      const pid = child.pid
      try {
        // Negative pid targets the whole process group (child is a group
        // leader via `detached`), so grandchildren die too and release the
        // stdio pipe. Fall back to a direct kill if the group is already gone
        // or the platform lacks process groups.
        if (pid !== undefined) process.kill(-pid, signal)
        else child.kill(signal)
      } catch {
        try {
          child.kill(signal)
        } catch {
          /* already exited */
        }
      }
    }
    const terminate = (): void => {
      killTree('SIGTERM')
      graceTimer = setTimeout(() => killTree('SIGKILL'), KILL_GRACE_MS)
    }
    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true
        terminate()
      }, options.timeoutMs)
    }
    const onAbort = (): void => {
      timedOut = true
      terminate()
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    const settle = (
      exitCode: number | null,
      spawnError?: Error,
      signal?: NodeJS.Signals | null,
    ): void => {
      if (settled) return
      settled = true
      if (killTimer !== undefined) clearTimeout(killTimer)
      if (graceTimer !== undefined) clearTimeout(graceTimer)
      options.signal?.removeEventListener('abort', onAbort)
      if (spawnError !== undefined && stderr === '') {
        stderr = spawnError.message
      }
      resolve({
        stdout,
        stderr,
        exitCode,
        durationMs: 0,
        timedOut,
        stdinError,
        signal: signal ?? undefined,
      })
    }

    // Decode through the stream, not per chunk: a UTF-8 sequence straddling
    // two reads must be held over the boundary instead of becoming two U+FFFD.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (err) => settle(null, err))
    child.on('close', (code, signal) => settle(code, undefined, signal))

    // The child may exit before draining stdin (bad flag, auth failure, or a
    // kill from the timeout/abort path), which fails the write with EPIPE.
    // Without a listener that stream error is an uncaught exception that takes
    // the host process down. It is recorded rather than dropped: the failure
    // means the agent saw a truncated prompt, and nothing else reveals that
    // when the child still exits 0. Recorded at `settle` so the diagnostic
    // rides on the resolved value; node closes stdin before emitting `close`,
    // so the error always lands first.
    child.stdin.on('error', (err: Error) => {
      stdinError ??= err.message
    })

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin)
    }
    child.stdin.end()
  })
}

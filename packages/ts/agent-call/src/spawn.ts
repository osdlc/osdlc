import { spawn } from 'node:child_process'

import type { RawProcessOutput } from './adapters/types.js'

/** Grace period between SIGTERM and SIGKILL on timeout/abort. */
const KILL_GRACE_MS = 5_000

export interface SpawnOptions {
  stdin?: string | undefined
  cwd?: string | undefined
  env: NodeJS.ProcessEnv
  timeoutMs?: number | undefined
  signal?: AbortSignal | undefined
}

/** Spawn, collect output, honor timeout and abort. @internal */
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
        cutShortBy: 'abort',
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
    let cutShortBy: 'timeout' | 'abort' | undefined
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
      if (graceTimer !== undefined) return
      killTree('SIGTERM')
      graceTimer = setTimeout(() => killTree('SIGKILL'), KILL_GRACE_MS)
    }
    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      killTimer = setTimeout(() => {
        timedOut = true
        cutShortBy ??= 'timeout'
        terminate()
      }, options.timeoutMs)
    }
    const onAbort = (): void => {
      timedOut = true
      cutShortBy ??= 'abort'
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
        cutShortBy,
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

import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

import type { RawProcessOutput } from './adapters/types.js'

/** Grace period between SIGTERM and SIGKILL on timeout/abort. */
const KILL_GRACE_MS = 5_000

export interface SpawnOptions {
  stdin?: string | undefined
  cwd?: string | undefined
  env: NodeJS.ProcessEnv
  timeoutMs?: number | undefined
  signal?: AbortSignal | undefined
  /** Per-stream byte cap; passing it stops the group like a timeout. */
  maxOutputBytes?: number | undefined
  /** Called with each decoded chunk as it arrives. A throw stops later calls. */
  onOutput?: ((chunk: string, stream: 'stdout' | 'stderr') => void) | undefined
}

/**
 * The length of the incomplete UTF-8 sequence at the end of `buf`: 0 when it
 * ends on a character boundary, else the 1–3 bytes of a multi-byte character
 * whose remaining bytes have not arrived.
 */
export function incompleteUtf8Tail(buf: Uint8Array): number {
  for (let i = 1; i <= Math.min(3, buf.length); i++) {
    const byte = buf[buf.length - i]!
    if ((byte & 0xc0) === 0x80) continue // a continuation byte: keep looking for the lead
    const need = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1
    return need > i ? i : 0
  }
  return 0
}

/**
 * One output stream: decoded as it arrives, with an optional byte cap that
 * truncates on a character boundary. Decoding goes through the stream, not per
 * chunk: a UTF-8 sequence straddling two reads is held over the boundary
 * instead of becoming two U+FFFD.
 */
class StreamCollector {
  text = ''
  /** The cap was passed: later data is dropped. */
  capped = false
  private readonly decoder = new StringDecoder('utf8')
  private bytes = 0
  /** Trailing bytes of an incomplete character, held by the decoder. */
  private carry: Buffer = Buffer.alloc(0)

  constructor(
    private readonly cap: number | undefined,
    private readonly emit: (text: string) => void,
  ) {}

  /** Take one chunk. Returns `true` when this chunk passed the cap. */
  push(chunk: Buffer): boolean {
    if (this.capped) return false
    const allowed = this.cap === undefined ? Infinity : this.cap - this.bytes
    if (chunk.length <= allowed) {
      this.accept(chunk)
      return false
    }
    // Cut at the cap, backed off to the start of the character it splits.
    // `view` starts on a character boundary: `carry` is the start of one.
    const view = Buffer.concat([this.carry, chunk])
    const cut = this.carry.length + allowed
    const boundary = cut - incompleteUtf8Tail(view.subarray(0, cut))
    if (boundary > this.carry.length) this.accept(chunk.subarray(0, boundary - this.carry.length))
    this.capped = true
    return true
  }

  /** Flush the decoder at end of stream. A capped stream holds no partial character worth keeping. */
  end(): void {
    if (!this.capped) this.append(this.decoder.end())
  }

  private append(text: string): void {
    if (text === '') return
    this.text += text
    this.emit(text)
  }

  private accept(chunk: Buffer): void {
    this.bytes += chunk.length
    this.append(this.decoder.write(chunk))
    // An incomplete character is at most 3 bytes, so the last 3 bytes of the
    // chunk (after any carry) are enough to find it.
    const tail = Buffer.concat([this.carry, chunk.subarray(Math.max(0, chunk.length - 3))])
    this.carry = tail.subarray(tail.length - incompleteUtf8Tail(tail))
  }
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

    // A caller's callback must not take the run down: the first throw is
    // swallowed and stops later calls, and the output is still collected.
    let onOutput = options.onOutput
    const emitter =
      (stream: 'stdout' | 'stderr') =>
      (text: string): void => {
        if (onOutput === undefined) return
        try {
          onOutput(text, stream)
        } catch {
          onOutput = undefined
        }
      }
    const out = new StreamCollector(options.maxOutputBytes, emitter('stdout'))
    const err = new StreamCollector(options.maxOutputBytes, emitter('stderr'))
    let timedOut = false
    let cutShortBy: 'timeout' | 'abort' | undefined
    let outputLimit: 'stdout' | 'stderr' | undefined
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
        // The output cap already cut the run short: it stays the cause.
        if (outputLimit !== undefined) return
        timedOut = true
        cutShortBy ??= 'timeout'
        terminate()
      }, options.timeoutMs)
    }
    const onAbort = (): void => {
      if (outputLimit !== undefined) return
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
      out.end()
      err.end()
      let stderr = err.text
      if (spawnError !== undefined && stderr === '') {
        stderr = spawnError.message
      }
      resolve({
        stdout: out.text,
        stderr,
        exitCode,
        durationMs: 0,
        timedOut,
        cutShortBy,
        outputLimit,
        stdinError,
        signal: signal ?? undefined,
      })
    }

    const onData = (collector: StreamCollector, stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
      if (!collector.push(chunk)) return
      // The first stream past the cap is the cause, unless a timeout or an
      // abort cut the run short first; either way the group is stopped.
      if (!timedOut) outputLimit ??= stream
      terminate()
    }
    child.stdout.on('data', onData(out, 'stdout'))
    child.stderr.on('data', onData(err, 'stderr'))
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

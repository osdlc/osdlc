import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

import type { RawProcessOutput } from './adapters/types.js'

/** Wait between SIGTERM and SIGKILL on timeout or abort. */
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
 * One output stream, decoded as it arrives, with an optional byte cap that
 * truncates on a character boundary. The whole stream uses one decoder, so
 * a UTF-8 sequence split across two reads is decoded whole instead of
 * becoming two U+FFFD.
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

/** Spawn the process, collect its output, and apply the timeout and abort signal. @internal */
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

    // An already-aborted signal never fires `abort` again, so check it before
    // the spawn. Otherwise the agent runs the full turn. The result matches a
    // mid-run abort: cut short, with no exit code.
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
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(binary, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Own process group, so a timeout or abort can kill the whole tree.
        // Without it, a shell child (such as `sh -c "sleep 30"`) leaves its
        // grandchild running with the stdio pipe open, and `close` never fires.
        // The call then waits until the real command ends, past timeoutMs.
        detached: true,
      })
    } catch (e) {
      // Node rejects some arguments before it starts anything, by throwing
      // (a NUL byte in argv or env, say). The process never started, the same
      // as a missing binary, so it resolves the same way.
      resolve({
        stdout: '',
        stderr: e instanceof Error ? e.message : String(e),
        exitCode: null,
        durationMs: 0,
        timedOut: false,
      })
      return
    }

    // A caller's callback must not end the run. The first throw, or the first
    // rejection of a promise it returns, is swallowed and stops later calls.
    // The output is still collected.
    let onOutput = options.onOutput
    const stopOutput = (): void => {
      onOutput = undefined
    }
    const emitter =
      (stream: 'stdout' | 'stderr') =>
      (text: string): void => {
        if (onOutput === undefined) return
        try {
          // Typed `void`, which an async function also satisfies. An unhandled
          // rejection would crash a Node host.
          const returned: unknown = onOutput(text, stream)
          if (isThenable(returned)) returned.then(undefined, stopOutput)
        } catch {
          stopOutput()
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
        // A negative pid targets the whole process group (`detached` makes the
        // child a group leader), so grandchildren die too and release the
        // stdio pipe. Fall back to a direct kill if the group is already gone
        // or the platform has no process groups.
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
      // The first stream past the cap. A timeout or abort that came first
      // stays the cause (`timedOut`). Either way the group is stopped.
      outputLimit ??= stream
      terminate()
    }
    child.stdout.on('data', onData(out, 'stdout'))
    child.stderr.on('data', onData(err, 'stderr'))
    child.on('error', (err) => settle(null, err))
    child.on('close', (code, signal) => settle(code, undefined, signal))

    // The child may exit before it reads all of stdin (a bad flag, an auth
    // failure, or a timeout or abort kill). The write then fails with EPIPE,
    // or ENOTCONN under some timings. Without a listener, that stream error
    // is an uncaught exception that crashes the host process. It is recorded,
    // not dropped: it means the agent saw a truncated prompt, and nothing else
    // shows that when the child still exits 0. `settle` puts it on the
    // resolved value. Node closes stdin before it emits `close`, so the error
    // is always recorded first.
    child.stdin.on('error', (err: Error) => {
      stdinError ??= err.message
    })

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin)
    }
    child.stdin.end()
  })
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

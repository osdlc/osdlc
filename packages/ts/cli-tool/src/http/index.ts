/**
 * `@osdlc/cli-tool/http`: an app's command tree over local HTTP.
 *
 * | Route | Answers |
 * |---|---|
 * | `GET <prefix>/schema` | the callable commands, each with its `args` and output JSON Schema |
 * | `GET <prefix>/help[/<command>...]` | the help, as `help --json` prints it |
 * | `POST <prefix>/commands/<command>...` | the command's `--json` document, from a JSON body of its args |
 *
 * Every request passes three checks, in this order, before anything else:
 *
 * 1. The `Host` header names a loopback address. A page on another site that
 *    rebinds its domain to 127.0.0.1 sends its own name, and is refused.
 * 2. An `Origin` header, when present, is this server's own origin, and
 *    `Sec-Fetch-Site` is not `cross-site` or `same-site`.
 * 3. `Authorization: Bearer <token>`. A header, never a cookie or the URL, so
 *    a cross-origin page must pass a CORS preflight, which this server never
 *    answers.
 *
 * Failing 1 or 2 answers 403; failing 3 answers 401, for every path, so an
 * unauthenticated caller learns nothing about the routes. A body is read only
 * after the checks, and only up to the size limit.
 *
 * `cli-only` commands are refused (403). A mount may list some of them in
 * `confirm`; a call to one then answers 428 with a one-time nonce, and runs
 * only when the same request is sent again with `X-Confirm: <nonce>`.
 */

import {
  type App,
  type CallOptions,
  type CallResult,
  type InteractiveCommand,
  commandKit,
} from '../command/index.ts'
import type { FlagSpec } from '../define-cli.ts'
import type { CliContext } from '../io.ts'
import { serveHttp, type HttpServer, type ServeHttpOptions } from './server.ts'

export { serveHttp }
export type { HttpServer, ServeHttpOptions }

/**
 * How an HTTP API is mounted.
 * @experimental
 */
export interface HttpApiOptions {
  /** The directory and environment commands run with. */
  context: Omit<CliContext, 'io'>
  /** The bearer token. Default: 128 random bits as hex, new for each API. */
  token?: string
  /** The path the API is mounted under, such as `/api`. Default: the root. */
  prefix?: string
  /** The app's global flag values for every call. A caller cannot set them. */
  globals?: Record<string, unknown>
  /** Only commands declared `readOnly`. */
  readOnly?: boolean
  /**
   * `cli-only` commands this mount runs after a confirmation step, by path,
   * such as `[['trust']]`. For a person-facing page that asks before it
   * sends the confirmation. Default none.
   */
  confirm?: readonly (readonly string[])[]
  /** How long a confirmation nonce stays usable. Default 60 seconds. */
  confirmTtlMs?: number
  /** The largest request body read. Default 1 MiB. */
  maxBodyBytes?: number
}

/**
 * A mounted HTTP API.
 * @experimental
 */
export interface HttpApi {
  /** The bearer token callers send. */
  readonly token: string
  /** The path the API is mounted under, `''` for the root. */
  readonly prefix: string
  /** Whether `request`'s path is under {@link prefix}. */
  handles(request: Request): boolean
  /** Answer a request under the prefix: the checks, then the route. */
  fetch(request: Request): Promise<Response>
  /**
   * The Host and Origin checks alone, for an app's own routes (a page, its
   * assets): a 403 response, or null when the request may go on.
   */
  checkOrigin(request: Request): Response | null
  /** Whether `request` carries the bearer token. */
  hasToken(request: Request): boolean
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
const DEFAULT_MAX_BODY = 1024 * 1024
const DEFAULT_CONFIRM_TTL = 60_000
/** Unused nonces kept at most; the oldest is dropped first. */
const MAX_NONCES = 64
const NDJSON = 'application/x-ndjson'

/** 128 bits, hex, from a secure source. */
function secret(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compared without an early exit, so a near miss takes as long as a far one. */
function tokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...HEADERS, ...extra } })
}

function errorDoc(exit: number, message: string, more: Record<string, unknown> = {}) {
  return { schemaVersion: 1, kind: 'error', exit, message, ...more }
}

/** Read at most `max` bytes of `request`'s body, or null when it is larger. */
async function readBody(request: Request, max: number): Promise<string | null> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (length > max) return null
  if (request.body === null) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      void reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** The HTTP status for a call that did not answer with a document. */
function statusOf(result: Exclude<CallResult, { status: 'ok' }>): number {
  if (result.status === 'refused') return result.reason === 'cli-only' ? 403 : 404
  return result.usage === true ? 400 : 422
}

function failureBody(result: Exclude<CallResult, { status: 'ok' }>): Record<string, unknown> {
  if (result.status === 'refused') {
    return errorDoc(result.reason === 'cli-only' ? 1 : 2, result.message, {
      refused: result.reason,
    })
  }
  return errorDoc(result.exit, result.message, {
    ...(result.hint !== undefined ? { hint: result.hint } : {}),
    ...(result.stderr !== '' ? { stderr: result.stderr } : {}),
  })
}

/**
 * Mount `app`'s commands as an HTTP API. Serve it with {@link serveHttp}, or
 * call {@link HttpApi.fetch} from an app's own handler for the paths under
 * the prefix.
 *
 * A command call answers its `--json` document with status 200 and its exit
 * code in `X-Exit-Code`. A failed call answers `{ kind: "error", exit,
 * message, hint }`: 400 for wrong arguments, 422 for a failed run, 403 for a
 * `cli-only` command and 404 for no such command.
 *
 * With `Accept: application/x-ndjson`, the answer streams: one JSON line per
 * event the command sends, then the document (or the error) as the last
 * line. Closing the connection cancels the command through `ctx.signal`.
 * @experimental
 */
export function createHttpApi(app: App, options: HttpApiOptions): HttpApi {
  const token = options.token ?? secret()
  const prefix = (options.prefix ?? '').replace(/\/+$/, '')
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY
  const ttl = options.confirmTtlMs ?? DEFAULT_CONFIRM_TTL
  const confirmable = new Set((options.confirm ?? []).map((p) => p.join(' ')))
  const nonces = new Map<string, { request: string; expires: number }>()

  const callable = () =>
    app
      .schema()
      .filter(
        (e) =>
          e.output !== undefined &&
          !e.interactive &&
          (e.exposure !== 'cli-only' || confirmable.has(e.path.join(' '))) &&
          (options.readOnly !== true || e.readOnly === true),
      )
  const callablePaths = new Set(callable().map((e) => e.path.join(' ')))

  const checkOrigin = (request: Request): Response | null => {
    const forbidden = new Response('forbidden', { status: 403, headers: HEADERS })
    const host = request.headers.get('host')
    if (host === null) return forbidden
    const hostname = host.replace(/:\d+$/, '').toLowerCase()
    if (!LOOPBACK.has(hostname)) return forbidden
    const origin = request.headers.get('origin')
    if (origin !== null && origin !== `http://${host.toLowerCase()}`) return forbidden
    const site = request.headers.get('sec-fetch-site')
    if (site === 'cross-site' || site === 'same-site') return forbidden
    return null
  }

  const hasToken = (request: Request): boolean => {
    const header = request.headers.get('authorization')
    const match = header === null ? null : /^Bearer (\S+)$/.exec(header)
    return match !== null && tokenEquals(match[1]!, token)
  }

  const handles = (request: Request): boolean => {
    const path = new URL(request.url).pathname
    return prefix === '' || path === prefix || path.startsWith(`${prefix}/`)
  }

  const issueNonce = (key: string): string => {
    const now = Date.now()
    for (const [n, v] of nonces) if (v.expires < now) nonces.delete(n)
    while (nonces.size >= MAX_NONCES) nonces.delete(nonces.keys().next().value!)
    const nonce = secret()
    nonces.set(nonce, { request: key, expires: now + ttl })
    return nonce
  }

  /** Spend `nonce` for `key`: true once, for an unexpired nonce issued for the same request. */
  const spendNonce = (nonce: string, key: string): boolean => {
    const found = nonces.get(nonce)
    if (found === undefined) return false
    nonces.delete(nonce)
    return found.expires >= Date.now() && found.request === key
  }

  const runCommand = async (request: Request, words: string[]): Promise<Response> => {
    const name = words.join(' ')
    if (!callablePaths.has(name)) {
      return json(errorDoc(2, `no command '${[app.name, ...words].join(' ')}'`), 404)
    }
    const type = request.headers.get('content-type') ?? ''
    if (!/^application\/json\b/i.test(type)) {
      return json(errorDoc(2, 'send the arguments as application/json'), 415)
    }
    const raw = await readBody(request, maxBody)
    if (raw === null) return json(errorDoc(2, `the body is larger than ${maxBody} bytes`), 413)
    let args: unknown
    try {
      args = raw.trim() === '' ? {} : JSON.parse(raw)
    } catch {
      return json(errorDoc(2, 'the body is not JSON'), 400)
    }

    const key = `${name}\n${raw}`
    const confirmHeader = request.headers.get('x-confirm')
    const confirmed = confirmHeader !== null && spendNonce(confirmHeader, key)
    if (confirmHeader !== null && !confirmed) {
      return json(errorDoc(1, 'the confirmation is not valid; ask again'), 403)
    }

    const stream = (request.headers.get('accept') ?? '').includes(NDJSON)
    const aborter = new AbortController()
    request.signal.addEventListener('abort', () => aborter.abort(), { once: true })
    const queue: Record<string, unknown>[] = []
    let push: ((line: Record<string, unknown>) => void) | undefined
    let firstEvent: () => void = () => {}
    const eventSeen = new Promise<'event'>((resolve) => {
      firstEvent = () => resolve('event')
    })

    const callOptions: CallOptions = {
      surface: 'http',
      signal: aborter.signal,
      ...(options.globals !== undefined ? { globals: options.globals } : {}),
      ...(confirmed ? { allowCliOnly: true } : {}),
      onEvent(line) {
        if (!stream) return
        if (push !== undefined) push(line)
        else queue.push(line)
        firstEvent()
      },
    }
    const done = app.call(words, args, options.context, callOptions)

    const plain = (result: CallResult): Response => {
      if (result.status === 'ok') {
        return json(result.document, 200, { 'x-exit-code': String(result.exit) })
      }
      if (
        result.status === 'refused' &&
        result.reason === 'cli-only' &&
        confirmable.has(name) &&
        !confirmed
      ) {
        return json(
          {
            schemaVersion: 1,
            kind: 'confirm',
            command: [app.name, ...words].join(' '),
            nonce: issueNonce(key),
            expiresInMs: ttl,
            message: `'${[app.name, ...words].join(' ')}' needs a person to confirm it; send the same request again with X-Confirm`,
          },
          428,
        )
      }
      return json(failureBody(result), statusOf(result))
    }

    if (!stream) return plain(await done)

    // Wait for the first event or the end, so a refusal still gets its own status.
    const first = await Promise.race([eventSeen, done])
    if (first !== 'event' && first.status !== 'ok' && first.status !== 'error') return plain(first)

    const encoder = new TextEncoder()
    let open = true
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (line: Record<string, unknown>): void => {
          if (open) controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
        }
        const end = (line: Record<string, unknown>): void => {
          write(line)
          if (open) controller.close()
          open = false
        }
        for (const line of queue.splice(0)) write(line)
        push = write
        void done.then(
          (result) => end(result.status === 'ok' ? result.document : failureBody(result)),
          (err: unknown) => end(errorDoc(1, err instanceof Error ? err.message : String(err))),
        )
      },
      cancel() {
        open = false
        aborter.abort()
      },
    })
    return new Response(body, {
      status: 200,
      headers: { ...HEADERS, 'content-type': NDJSON },
    })
  }

  const fetch = async (request: Request): Promise<Response> => {
    const refused = checkOrigin(request)
    if (refused !== null) return refused
    if (!hasToken(request)) {
      return new Response('unauthorized', {
        status: 401,
        headers: { ...HEADERS, 'www-authenticate': 'Bearer' },
      })
    }
    const url = new URL(request.url)
    if (!handles(request)) return json(errorDoc(2, 'not found'), 404)
    const rest = url.pathname.slice(prefix.length)
    const words = rest
      .split('/')
      .filter((w) => w !== '')
      .map((w) => decodeURIComponent(w))
    const [route, ...path] = words
    const method = request.method
    const only = (allowed: string): Response =>
      json(errorDoc(2, `use ${allowed}`), 405, { allow: allowed })

    if (route === 'schema' && path.length === 0) {
      if (method !== 'GET') return only('GET')
      const commands = callable().map((e) => {
        const { input: _input, ...entry } = e
        return {
          ...entry,
          args: app.argsSchema(e.path),
          ...(e.exposure === 'cli-only' ? { confirm: true } : {}),
        }
      })
      return json({
        schemaVersion: 1,
        kind: 'http-schema',
        tool: { name: app.name, version: app.version },
        commands,
      })
    }
    if (route === 'help') {
      if (method !== 'GET') return only('GET')
      const depthParam = url.searchParams.get('depth')
      const depth =
        depthParam === 'all'
          ? Number.POSITIVE_INFINITY
          : depthParam !== null && /^\d+$/.test(depthParam)
            ? Number(depthParam)
            : 1
      try {
        const help = app.help(path, { depth, full: url.searchParams.has('full') })
        return json({
          schemaVersion: 1,
          kind: 'help',
          tool: { name: app.name, version: app.version },
          help,
        })
      } catch (err) {
        return json(errorDoc(2, (err as Error).message), 404)
      }
    }
    if (route === 'commands') {
      if (method !== 'POST') return only('POST')
      return runCommand(request, path)
    }
    return json(errorDoc(2, 'not found'), 404)
  }

  return { token, prefix, handles, fetch, checkOrigin, hasToken }
}

/**
 * The `serve-api` command: serve the app this command is mounted in over
 * HTTP on 127.0.0.1 until stopped. It prints the address and a bearer token
 * made for this run. Mount it as `'serve-api': httpApiCommand()`.
 * @experimental
 */
export function httpApiCommand<G extends FlagSpec = Record<never, never>>(
  options: { globals?: G; summary?: string } = {},
): InteractiveCommand {
  const kit = commandKit({ globals: options.globals ?? ({} as G) })
  return kit.command({
    summary: options.summary ?? 'serve these commands over local HTTP, with a token',
    description:
      'Listens on 127.0.0.1 only and prints the address and a token made for this run. Every ' +
      'request needs "Authorization: Bearer <token>". GET /schema lists the commands, GET /help ' +
      'prints the help, and POST /commands/<command> runs one with a JSON body of its arguments ' +
      'and answers its JSON document. Commands that run from the command line only, such as ' +
      'granting trust, are refused.',
    interactive: true,
    flags: {
      port: { kind: 'string', valueName: 'n', help: 'the port (default: one the system picks)' },
      readOnly: { kind: 'boolean', help: 'serve only the commands that change nothing' },
    },
    async run({ flags, globals }, ctx) {
      const port = flags.port === undefined ? 0 : Number(flags.port)
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        ctx.io.stderr(`${ctx.app.name}: --port needs a number from 0 to 65535\n`)
        return 2
      }
      const api = createHttpApi(ctx.app, {
        context: { cwd: ctx.cwd, env: ctx.env },
        globals: globals as Record<string, unknown>,
        readOnly: flags.readOnly,
      })
      const server = await serveHttp(api.fetch, { port })
      ctx.io.stdout(
        `${ctx.app.name} api  ${server.url}\n` +
          `  token  ${api.token}\n` +
          `  try    curl -H "Authorization: Bearer ${api.token}" ${server.url}/schema\n` +
          `  stop   Ctrl-C\n`,
      )
      await new Promise<void>((resolve) => {
        if (ctx.signal.aborted) resolve()
        ctx.signal.addEventListener('abort', () => resolve(), { once: true })
      })
      await server.stop()
      return 0
    },
  }) as InteractiveCommand
}

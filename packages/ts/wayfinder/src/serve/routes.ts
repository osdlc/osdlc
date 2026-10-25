/**
 * The web view's routes.
 *
 * | Route | Answers |
 * |---|---|
 * | `/api/...` | cli-tool's HTTP adapter: `GET /api/schema`, `GET /api/help`, `POST /api/commands/<command>` |
 * | `GET /` | the page. It holds no secret, so it needs no token |
 * | `POST /session` | the bearer token, once, for the boot token (see `auth.ts`) |
 * | `POST /run` | hands this server's terminal to a task, then stops the server |
 *
 * Every page action other than Run is a command of the tree, called through
 * `/api/commands`, so the page and the command line do the same thing: the
 * catalog is `list`, a trust grant is `trust`, a saved setting is `config
 * set`. Run is a route of its own because it ends the server: it resolves the
 * task with `run --dry-run`, answers, stops listening and then runs it.
 *
 * Every route passes the adapter's Host and Origin checks first.
 */

import type { HttpApi } from '@osdlc/cli-tool/http'

import type { SignIn } from './auth.ts'

const HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

/** The largest body `/session` and `/run` read. Both take a few short strings. */
const MAX_BODY = 64 * 1024

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS })
}

function text(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...HEADERS, 'content-type': 'text/plain; charset=utf-8', ...extra },
  })
}

/**
 * At most `max` bytes of `request`'s body, or null when it is larger. Read as
 * a stream and given up past `max`: `/session` needs no token, so a chunked
 * body of any size must not be buffered first.
 */
async function readBody(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? '0') > max) return null
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

/** The JSON body of `request`, or a Response refusing it. */
async function readJson(request: Request): Promise<unknown> {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
    return text('send application/json', 415)
  }
  const raw = await readBody(request, MAX_BODY)
  if (raw === null) return text('the body is too large', 413)
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return text('the body is not JSON', 400)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** What resolving a run answers: the plan, or the error document and its status. */
export type RunResolution =
  | {
      ok: true
      display: string
      argv: string[]
      env: Record<string, string>
      cwd: string
    }
  | { ok: false; status: number; error: Record<string, unknown> }

/** What {@link createRoutes} needs. */
export interface RoutesOptions {
  api: HttpApi
  signIn: SignIn
  /** The page's HTML. Built per request, so a checkout's edit needs a reload, not a restart. */
  page(): Promise<string>
  /** Resolve task `id` with `args` the way `run --dry-run` does. */
  resolveRun(id: string, args: string[]): Promise<RunResolution>
  /**
   * Called once, after the run's answer is sent, with the plan to run. It
   * stops the server and hands the terminal to the task.
   */
  handOff(plan: Extract<RunResolution, { ok: true }>): void
}

/** The request handler for the web view. */
export function createRoutes(opts: RoutesOptions): (request: Request) => Promise<Response> {
  const { api } = opts
  /**
   * Set by the first accepted run. There is one terminal, so a second run
   * cannot have it, and gets a 409.
   */
  let handedOff = false

  const run = async (request: Request): Promise<Response> => {
    if (!api.hasToken(request)) {
      return text('unauthorized', 401, { 'www-authenticate': 'Bearer' })
    }
    // Set before the first `await`, so two requests cannot both pass.
    if (handedOff) return text('another run already has the terminal', 409)
    handedOff = true
    let resolved: RunResolution
    try {
      const body = await readJson(request)
      if (body instanceof Response) {
        handedOff = false
        return body
      }
      // An id and trailing arguments, nothing else. The task, from a catalog
      // this server built, supplies the binary, the leading arguments and the
      // cwd, so a caller can at most pass arguments to a task in the catalog.
      const id = isRecord(body) ? body['id'] : undefined
      const args = isRecord(body) ? (body['args'] ?? []) : undefined
      if (
        typeof id !== 'string' ||
        !Array.isArray(args) ||
        !args.every((a) => typeof a === 'string')
      ) {
        handedOff = false
        return text('expected { id: string, args?: string[] }', 400)
      }
      resolved = await opts.resolveRun(id, args as string[])
    } catch (err) {
      handedOff = false
      throw err
    }
    if (!resolved.ok) {
      handedOff = false
      return json(resolved.error, resolved.status)
    }
    const plan = resolved
    // The answer must reach the browser before the task takes the terminal.
    // One event-loop turn lets it be written, and lets a POST queued on
    // another socket be read and answered 409 rather than reset.
    setTimeout(() => opts.handOff(plan), 0)
    return json({ ok: true, display: plan.display, argv: plan.argv })
  }

  return async (request) => {
    if (api.handles(request)) return api.fetch(request)
    const refused = api.checkOrigin(request)
    if (refused !== null) return refused
    const path = new URL(request.url).pathname
    const method = request.method

    if (path === '/' || path === '/index.html') {
      if (method !== 'GET' && method !== 'HEAD') return text('use GET', 405, { allow: 'GET' })
      return new Response(await opts.page(), {
        headers: {
          ...HEADERS,
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': "frame-ancestors 'none'",
        },
      })
    }
    if (path === '/session') {
      if (method !== 'POST') return text('use POST', 405, { allow: 'POST' })
      const body = await readJson(request)
      if (body instanceof Response) return body
      // One answer for every failure, so a caller cannot tell which check failed.
      if (!opts.signIn.redeem(isRecord(body) ? body['boot'] : undefined)) {
        return text('unauthorized', 401)
      }
      return json({ token: api.token })
    }
    if (path === '/run') {
      if (method !== 'POST') return text('use POST', 405, { allow: 'POST' })
      return run(request)
    }
    return text('not found', 404)
  }
}

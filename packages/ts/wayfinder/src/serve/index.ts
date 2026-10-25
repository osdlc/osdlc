/**
 * The web view: the same catalog as a page you can search in a browser.
 *
 * It is a server rather than a generated file, because a file goes out of date
 * as soon as a task is added. The page calls the command tree over cli-tool's
 * HTTP adapter (`routes.ts`), so each request reads the repository as it is
 * now, with the same rules as the command line. The page signs in with a
 * one-shot boot token (`auth.ts`).
 */

import type { App } from '@osdlc/cli-tool/command'
import { createHttpApi, serveHttp, type HttpServer } from '@osdlc/cli-tool/http'
import { commandString, spawnRunner } from '@osdlc/command-seam'

import { APP, BIN } from '../app.ts'
import { readSettings } from '../config.ts'
import { handOff as defaultHandOff, type HandOffResult } from '../core/run.ts'
import type { CatalogSnapshot, Session } from '../core/session.ts'
import type { RunDocumentBody } from '../documents.ts'
import { buildPage } from '../page.ts'
import { terminalSafe } from '../terminal-text.ts'
import { WITHHELD, runnerLabel, staleLabel } from '../vocabulary.ts'
import { createSignIn, type SignIn } from './auth.ts'
import { createRoutes, type RunResolution } from './routes.ts'

/** The HTTP status for each `run` error code the page can act on. */
const RUN_STATUS: Record<string, number> = {
  'task-not-found': 404,
  'not-runnable': 422,
  'bad-arguments': 400,
  usage: 400,
}

/** What {@link startServer} and {@link serve} need. */
export interface ServeOptions {
  /** The session `serve` opened: its root, environment and first catalog. */
  session: Session
  /** The command tree the page calls. */
  app: App
  /**
   * The global flag values every call runs with, fixed at start. `dir` is
   * set to the session's root.
   */
  globals: Record<string, unknown>
  /** The working directory commands run with. */
  cwd: string
  /** A fixed port. Default: one the system picks. */
  port?: number | undefined
  /** Open a browser. Default true. */
  open?: boolean | undefined
  /** Stops the server when aborted, such as on Ctrl-C. */
  signal?: AbortSignal | undefined
  /** Where the startup lines go. */
  stdout(text: string): void
  /** Where the handed-off command line goes, as `way run` prints it. */
  stderr(text: string): void
  /** Gives the terminal to a task. Tests inject one. Default: the core's `handOff`. */
  handOff?: ((plan: Pick<RunDocumentBody, 'argv' | 'env' | 'cwd'>) => HandOffResult) | undefined
}

/** A running web view. */
export interface WebServer {
  server: HttpServer
  /** The boot token and its timer. */
  signIn: SignIn
  /**
   * Settles when the server has stopped: with the task's exit code after a
   * run took the terminal, 1 when the sign-in link was used twice, or null
   * when it was stopped otherwise.
   */
  finished: Promise<number | null>
  /** Stop the server. */
  stop(): Promise<void>
}

/**
 * Bind the port and return the server, without printing or opening anything.
 * Split from {@link serve} so a test can bind a port, send real requests and
 * stop again.
 */
export async function startServer(options: ServeOptions): Promise<WebServer> {
  const { session, app } = options
  const globals = { ...options.globals, dir: session.root }
  const context = { cwd: options.cwd, env: session.env }
  const runHandOff = options.handOff ?? defaultHandOff

  let settle: (exit: number | null) => void = () => {}
  const finished = new Promise<number | null>((resolve) => {
    settle = resolve
  })
  // The browser was beaten to the boot token, so someone else holds the
  // bearer token. Stop rather than serve them.
  const signIn = createSignIn(Date.now, () => {
    options.stderr(
      `${APP}: the sign-in link was used twice, so another program signed in first; ` +
        `stopping. Run "${BIN} serve" again\n`,
    )
    void stop().then(() => settle(1))
  })

  const resolveRun = async (id: string, args: string[]): Promise<RunResolution> => {
    const result = await app.call(
      ['run'],
      { id, rest: args, dryRun: true, cached: true },
      context,
      { surface: 'http', globals },
    )
    if (result.status === 'ok') {
      const doc = result.document as RunDocumentBody
      return { ok: true, display: doc.display, argv: doc.argv, env: doc.env, cwd: doc.cwd }
    }
    if (result.status === 'refused') {
      return { ok: false, status: 403, error: { kind: 'error', message: result.message } }
    }
    return {
      ok: false,
      status: RUN_STATUS[result.code] ?? 422,
      error: {
        kind: 'error',
        code: result.code,
        message: result.message,
        ...(result.hint !== undefined ? { hint: result.hint } : {}),
      },
    }
  }

  // The API is made once the port is known, so it checks Host against it.
  let handler: ((request: Request) => Promise<Response>) | undefined
  const server = await serveHttp((request) => handler!(request), { port: options.port ?? 0 })
  const api = createHttpApi(app, {
    context,
    prefix: '/api',
    globals,
    port: server.port,
    // A trust grant answers 428 with a nonce, so the page must ask the person
    // before it sends the grant again.
    confirm: [['trust']],
  })

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    await server.stop()
  }

  handler = createRoutes({
    api,
    signIn,
    async page(nonce) {
      const theme = await readSettings(session.root, session.env, session.home).then(
        (s) => s.theme.value,
        () => 'system' as const,
      )
      return buildPage({ theme, nonce })
    },
    resolveRun,
    handOff(plan) {
      void (async () => {
        await stop()
        options.stderr(`$ ${terminalSafe(commandString(plan.argv))}\n`)
        const ended = runHandOff(plan)
        if (ended.error !== undefined) {
          options.stderr(`${APP}: ${terminalSafe(plan.argv[0] ?? '')}: ${ended.error}\n`)
        }
        settle(ended.exit)
      })()
    },
  })

  if (options.signal !== undefined) {
    const onAbort = (): void => {
      void stop().then(() => settle(null))
    }
    if (options.signal.aborted) onAbort()
    else options.signal.addEventListener('abort', onAbort, { once: true })
  }

  return {
    server,
    signIn,
    finished,
    stop: async () => {
      await stop()
      settle(null)
    },
  }
}

/**
 * The first lines `serve` prints: the address, the root, what was collected
 * and what came from the store. Repository text in them is terminal-safe.
 */
export function startupSummary(address: string, first: Omit<CatalogSnapshot, 'origin'>): string {
  // A withheld runner reports `absent`. It is named withheld here, because
  // absent means the repository does not have it.
  const counts = first.catalog.reports
    .map((r) => {
      const state = r.skippedForExec ? WITHHELD : r.status === 'ok' ? r.tasks.length : r.status
      return `${runnerLabel(r.runner)} ${state}`
    })
    .join(', ')
  const stale = first.cache.filter((c) => c.state === 'stale')
  let out = `${APP}  ${address}\n`
  out += `  root       ${terminalSafe(first.catalog.root)}\n`
  out += `  collected  ${terminalSafe(counts)}\n`
  if (stale.length > 0) {
    const aged = stale
      .map((c) => `${runnerLabel(c.runner)} (${staleLabel(c.reason, c.ageMs)})`)
      .join(', ')
    out += `  cached     ${terminalSafe(aged)}; the page re-reads it\n`
  }
  return out
}

/**
 * Serve the page until the signal aborts or a run takes the terminal. Returns
 * the task's exit code after a run, or null when the server was stopped.
 */
export async function serve(options: ServeOptions): Promise<number | null> {
  const web = await startServer(options)
  const address = web.server.url
  const bootUrl = `${address}/?boot=${web.signIn.bootToken}`
  // From the store when it has an answer, so the address shows at once. The
  // page reads the repository again as soon as it loads.
  const first = await options.session.catalog({ cached: true })
  web.signIn.arm()
  options.stdout(startupSummary(address, first))
  options.stdout(`  live       the page refreshes on focus and every 15s; Refresh re-reads\n`)
  options.stdout(`  stop       Ctrl-C\n`)

  if (options.open === false) {
    options.stdout(`  open       ${bootUrl}\n`)
    options.stdout(`             signs the browser in once; it expires in 60 seconds if unused\n`)
  } else {
    // Best effort: a headless or remote shell has no browser.
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open'
    const proc = spawnRunner(opener, { absolutePathOnly: true }).run([bootUrl], {
      cwd: options.session.root,
    })
    if (proc.exitCode !== 0) {
      options.stdout(`  (could not open a browser; visit ${bootUrl} within 60 seconds)\n`)
    }
  }
  return web.finished
}

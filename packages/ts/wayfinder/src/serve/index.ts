/**
 * The web view: the same catalog as a page you can search in a browser.
 *
 * It is a server rather than a generated file, because a file goes out of date
 * as soon as a task is added. The page calls the command tree over cli-tool's
 * HTTP adapter (`routes.ts`), so each request reads the repository as it is
 * now, with the same rules as the command line. The catalog the server holds
 * between those requests is `catalog-share.ts`. The page signs in with a
 * one-shot boot token (`auth.ts`).
 */

import type { App } from '@osdlc/cli-tool/command'
import { createHttpApi, serveHttp, type HttpServer } from '@osdlc/cli-tool/http'
import { commandString, spawnRunnerAsync } from '@osdlc/command-seam'
import { humanAge } from '@osdlc/system-model/duration'

import { APP, BIN } from '../app.ts'
import { handOff as defaultHandOff, type HandOffResult } from '../core/run.ts'
import { catalogDocument } from '../commands/list.ts'
import type { CatalogSnapshot, Session } from '../core/session.ts'
import type { RunDocumentBody } from '../documents.ts'
import { buildPage } from '../page.ts'
import { terminalSafe } from '../terminal-text.ts'
import { WITHHELD, runnerLabel, staleLabel } from '../vocabulary.ts'
import { createSignIn, type SignIn } from './auth.ts'
import type { CatalogShare } from './catalog-share.ts'
import { createRoutes, type RunResolution } from './routes.ts'
import { readTerminalLines, type JobSignals } from './terminal-input.ts'

/** The HTTP status for each `run` error code the page can act on. */
const RUN_STATUS: Record<string, number> = {
  'task-not-found': 404,
  'ambiguous-task': 409,
  'not-runnable': 422,
  'bad-arguments': 400,
  // Not 409: the page reads 409 as another run holding the terminal.
  'task-changed': 412,
  usage: 400,
}

/** What {@link startServer} and {@link serve} need. */
export interface ServeOptions {
  /** The session `serve` opened: its root, environment and first catalog. */
  session: Session
  /** The command tree the page calls. */
  app: App
  /**
   * The catalog `app`'s `list` shares between requests. `serve` fills it
   * with its first catalog and starts a probe, so the page's first two
   * calls wait on neither a second store read nor a second probe.
   */
  share?: CatalogShare | undefined
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
  /**
   * The terminal's input, when stdin is a terminal. Each line read from it
   * (Enter) prints a new sign-in link, for a new tab or another browser. It
   * is read only while the process is in the foreground.
   */
  input?: NodeJS.ReadableStream | undefined
  /** Whether the process may read `input` now. Tests inject one. Default: a `ps` check. */
  foreground?: (() => Promise<boolean>) | undefined
  /** The job-control signals the reader follows. Tests inject a stand-in. */
  jobSignals?: JobSignals | null | undefined
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
   * run took the terminal, or null when it was stopped otherwise.
   */
  finished: Promise<number | null>
  /** Settles as soon as the server stops listening, before a run starts. */
  stopped: Promise<void>
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
  // The redeem is refused, so a replay cannot sign in. Warn in case it was
  // not the person, and keep serving the sessions already signed in. There
  // is one bearer token per server, so only a restart signs out whoever
  // redeemed the link first.
  const signIn = createSignIn(Date.now, () => {
    options.stderr(
      `${BIN}: warning: the sign-in link was used again and refused. ` +
        `If that was not you, stop the server (Ctrl-C) and start it again: ` +
        `a new link does not sign out whoever used this one\n`,
    )
  })

  const resolveRun = async (id: string, args: string[]): Promise<RunResolution> => {
    const result = await app.call(
      ['run'],
      // From the saved listing, then its runner probed again, so a task that
      // changed since the page drew it is refused rather than run.
      { id, rest: args, dryRun: true, cached: true, check: true },
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
  let markStopped: () => void = () => {}
  const stoppedPromise = new Promise<void>((resolve) => {
    markStopped = resolve
  })
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    // A probe still running would share the terminal with a handed-off task.
    options.share?.stop()
    await server.stop()
    markStopped()
  }

  handler = createRoutes({
    api,
    signIn,
    async page(nonce) {
      const theme = await session.reloadSettings().then(
        (s) => s.settings.theme.value,
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
          options.stderr(`${BIN}: ${terminalSafe(plan.argv[0] ?? '')}: ${ended.error}\n`)
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
    stopped: stoppedPromise,
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
export function startupSummary(
  address: string,
  first: Omit<CatalogSnapshot, 'origin'> & { origin?: CatalogSnapshot['origin'] },
): string {
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
  } else if (first.origin === 'saved') {
    const ages = first.cache.flatMap((c) => (c.ageMs !== undefined ? [c.ageMs] : []))
    const age = ages.length > 0 ? `, ${humanAge(Math.max(...ages))}` : ''
    out += `  cached     the last listing${age}; the page re-reads it\n`
  }
  return out
}

/** How long the browser opener may run before it is left to the browser. */
const OPENER_TIMEOUT_MS = 10_000

/** The program that opens a URL in the default browser on `platform`, before the URL. */
export function browserOpener(platform: NodeJS.Platform): { binary: string; args: string[] } {
  if (platform === 'darwin') return { binary: 'open', args: [] }
  if (platform === 'win32') return { binary: 'rundll32', args: ['url.dll,FileProtocolHandler'] }
  return { binary: 'xdg-open', args: [] }
}

/**
 * Serve the page until the signal aborts or a run takes the terminal. Returns
 * the task's exit code after a run, or null when the server was stopped.
 */
export async function serve(options: ServeOptions): Promise<number | null> {
  const web = await startServer(options)
  const address = web.server.url
  const bootUrl = (): string => `${address}/?boot=${web.signIn.bootToken}`
  // The saved view when there is one, else the store, so the address shows
  // at once. A probe starts now; the page's first fresh read joins it.
  const session = options.session
  const first = (await session.savedCatalog()) ?? (await session.catalog({ cached: true }))
  const share = options.share
  if (share !== undefined) {
    const key = session.viewKey()
    const documentOf = (snapshot: CatalogSnapshot) =>
      catalogDocument(snapshot, session.unknowns(snapshot), {}, session.settings().trustedTools)
    share.remember(key, documentOf(first))
    share.activate()
    // It waits on the share's own signal, so it runs to the end unless the
    // server stops, as on a hand-off.
    void share
      .fresh(key, async (signal) => documentOf(await session.catalog({ signal })), {
        join: true,
        signal: share.signal,
      })
      .catch(() => {})
  }
  web.signIn.arm()
  options.stdout(startupSummary(address, first))
  options.stdout(`  live       the page refreshes on focus and every 15s; Refresh re-reads\n`)
  options.stdout(`  stop       Ctrl-C\n`)
  /** Open the current link, or print it when there is no browser to open. */
  const show = (): void => {
    if (options.open === false) {
      options.stdout(`  open       ${bootUrl()}\n`)
      options.stdout(
        `             signs one browser tab in once; it expires in 60 seconds if unused\n`,
      )
      return
    }
    // Best effort: a headless or remote shell has no browser. Not awaited: a
    // generic xdg-open can wait on the browser it starts, and the server must
    // answer meanwhile. An opener still running at the deadline is taken to
    // have opened one.
    const url = bootUrl()
    const opener = browserOpener(process.platform)
    void spawnRunnerAsync(opener.binary, { absolutePathOnly: true })
      .run([...opener.args, url], { cwd: options.session.root, timeoutMs: OPENER_TIMEOUT_MS })
      .then((proc) => {
        if (proc.reason !== 'timeout' && proc.exitCode !== 0) {
          options.stdout(`  (could not open a browser; visit ${url} within 60 seconds)\n`)
        }
      })
  }
  // Enter prints a new link. Read only in the foreground: see terminal-input.ts.
  const lines =
    options.input !== undefined
      ? readTerminalLines(
          options.input,
          () => {
            web.signIn.renew()
            show()
          },
          { foreground: options.foreground, signals: options.jobSignals },
        )
      : undefined
  // Stop reading before a task gets the terminal, and when the server stops.
  void web.stopped.then(() => lines?.stop())
  if (lines !== undefined && (await lines.ready)) {
    options.stdout(`  new tab    press Enter here for a new sign-in link\n`)
  }
  show()
  return web.finished
}

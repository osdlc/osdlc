/**
 * The web view: the same catalog as a page you can search in a browser.
 *
 * It is a server rather than a generated file, because a file goes out of date
 * as soon as a task is added, with no sign that it has. `/api/catalog`
 * re-probes (requests close together share one probe), and the page re-fetches
 * on focus and on a slow poll, so the screen shows what the repository has now.
 *
 * Loopback alone does not keep other callers out, so every route needs a token.
 *
 * Other local users on this machine can reach 127.0.0.1, and can read a
 * process's argv and environment while it runs. So the session token never
 * appears in a URL or an argv. The URL carries the boot token instead. It works
 * once and expires after a minute, so it is only usable between opening the
 * browser and the page loading.
 *
 * Any website the user visits can also send cross-origin requests to
 * 127.0.0.1. A cookie would be sent with those (that is CSRF), but a request
 * header is not. The token header is not a CORS-safelisted header, so a
 * cross-origin fetch must first pass a CORS preflight, which this server never
 * answers. That is why auth uses a header, and why the boot token is accepted
 * on the page routes only, never on the API.
 *
 * `/api/run` hands this server's own terminal to a task and exits. It takes a
 * task id and nothing else (see the note on the route).
 *
 * `POST /api/trust` lets this repository's code run from now on, so it has a
 * third check beyond the method and the token: the grant must be applicable.
 * That is the same condition that decides whether the page shows the button.
 * Without it a grant would override `--no-exec` or write the store under
 * `--exec`. DELETE revokes and has no such check.
 */

import { spawnRunner, streamRunner } from '@osdlc/command-seam'
import {
  tasks as allTasks,
  type Catalog,
  type Project,
  type RunnerCacheState,
  type Task,
} from '@osdlc/system-model/detect'
import { humanAge } from '@osdlc/system-model/duration'
import { homeDir, trustDecision } from '@osdlc/trust-repo'

import { APP, BIN, PROJECT_CONFIG_FILENAME, TOKEN_HEADER } from './app.ts'
import { acceptArgs, runArgv } from './args.ts'
import { cacheDir } from './cache.ts'
import {
  collectAndCache,
  freshStates,
  fromStore,
  orderedCatalog,
  readCachedCatalog,
  type WayOptions,
} from './catalog.ts'
import {
  CONFIG_KEYS,
  collectOptionsFromConfig,
  configLocations,
  loadConfig,
  readRawConfigFile,
  setConfigValue,
  trustPolicyFromConfig,
  trustPolicyOptions,
  validateConfig,
  writeConfigFile,
  type TaskConfig,
} from './config.ts'
import { terminalSafe } from './terminal-text.ts'
import { appTrustStore } from './trust-store.ts'
import { serveFetch, type FetchServer } from './http.ts'
import { buildPage } from './page.ts'

/** Requests inside this window share one probe; an explicit refresh skips it. */
const COALESCE_MS = 1500

/** How long the boot token stays usable if the browser never arrives. */
const BOOT_TTL_MS = 60_000

/** 128 bits, hex. `getRandomValues` is cryptographically secure; `Math.random` is not. */
function secret(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compared without an early exit, so a near miss is not distinguishable by timing. */
function tokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * One bare status line for every failure. An attacker could use the knowledge
 * of which check failed (no token, wrong token, used boot token, a boot token
 * on an API route), and an authorized caller never needs it.
 */
function unauthorized(): Response {
  return new Response('unauthorized', { status: 401 })
}

/**
 * The same 401 as a page a person can read, on the page routes only. After
 * sign-in the address bar no longer has `?boot=`, so a reload fails. A bare
 * status line would show one word of plain text and no way to recover.
 *
 * One document for every page-route failure (no token, wrong token, used
 * token, expired token), so it still does not say which check failed. Styles
 * are inline and there are no external requests, because this server serves
 * nothing else to an unauthenticated caller.
 */
function unauthorizedPage(): Response {
  const body = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${APP} - not signed in</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #fbfbfa; color: #1c1c1a;
  }
  main { max-width: 30rem; padding: 2rem; }
  h1 { margin: 0 0 .75rem; font-size: 1.15rem; font-weight: 600; }
  p { margin: 0 0 .75rem; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em;
    padding: .1em .35em; border-radius: .25em;
    background: rgba(127, 127, 127, .18);
    /* Text meant to be retyped. The default face ligates a run of hyphens
       into one long dash, and what is retyped is then not what is shown. */
    font-variant-ligatures: none;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #16161a; color: #e6e6e3; }
  }
</style>
<main>
  <h1>This browser is not signed in.</h1>
  <p>${APP} needs a fresh link, and only your terminal can hand one out.</p>
  <p>Go to the terminal ${APP} is running in, stop it with <code>Ctrl-C</code> and
  start it again: it prints a new link that signs this browser in.</p>
</main>
`
  return new Response(body, {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Colours for the one line this server prints before the task takes over.
 * The TUI's ANSI helpers are private to that module, so the same style (a dim
 * `$` and bold argv) is repeated here rather than exported.
 */
const PAINT = !process.env['NO_COLOR'] && process.stdout.isTTY
const dim = (s: string): string => (PAINT ? `\x1b[2m${s}\x1b[0m` : s)
const bold = (s: string): string => (PAINT ? `\x1b[1m${s}\x1b[0m` : s)

/**
 * Hand the terminal to `argv` and exit when it finishes. This matches the
 * TUI's `runAndExit`, including how it picks the cwd. It streams through
 * `@osdlc/command-seam`, so the task has the terminal while it runs. `argv`
 * runs without a shell. Running `display` would be wrong, since a shell reads
 * its `<placeholders>` as redirections.
 */
function runAndExit(root: string, task: Task, argv: readonly string[]): never {
  // Echo what actually runs, not `display`.
  process.stdout.write(`${dim('$')} ${bold(terminalSafe(argv.join(' ')))}\n`)
  const [binary, ...rest] = argv
  const res = streamRunner(binary!).run(rest, {
    cwd: task.cwd === '.' ? root : `${root}/${task.cwd}`,
  })
  process.exit(res.exitCode)
}

/**
 * Apply a settings-screen edit to `<root>/wayfinder.config.json`.
 *
 * The request is a patch of dotted keys, not a whole document, for two
 * reasons. The second matters more:
 *
 *   - `way config set` names keys the same way, so the screen and the CLI use
 *     the same names.
 *   - The patch is applied to the file's raw contents, so a key this version
 *     does not know (from a newer wayfinder, or added by hand) survives the
 *     save. Writing a validated document would silently drop it, because
 *     `validateConfig` returns only the keys it knows. `writeConfigFile`
 *     takes a raw record for this reason.
 *
 * Returns null on success, or the Response to send on refusal.
 */
async function writeProjectConfig(req: Request, options: ServeOptions): Promise<Response | null> {
  const bad = (detail: string): Response => new Response(detail, { status: 400 })

  const body = (await req.json().catch(() => null)) as { set?: unknown } | null
  if (body === null || !isRecord(body.set)) return bad('expected { set: { <key>: <value> } }')

  // Only settable keys are allowed. Any other key is refused rather than
  // dropped, because a caller whose key silently vanished would believe it
  // had been saved.
  for (const key of Object.keys(body.set)) {
    if (!CONFIG_KEYS.includes(key)) return bad(`${key} is not a setting`)
  }

  // Tool modules are code. The page never edits them; `way config set` does.
  if ('tools' in body.set)
    return bad(`tools cannot be written from the page; use "${BIN} config set tools"`)

  // A project file may never hold this value. `loadConfig` already drops it on
  // read, but writing it would put it in the file, where a reader would take
  // it as allowing execution. A repository cannot grant itself permission to
  // run its own code. That is the trust store's job.
  if (body.set['allowExec'] === true) {
    return bad(
      'allowExec: true cannot be written to a project file — a repository cannot grant itself ' +
        'permission to run subprocesses. Trust this repository instead.',
    )
  }

  // The same rule, for the same reason: a project file must not
  // pre-authorize itself (or a group of repositories, through trust.owners).
  // Refused even when empty. `loadConfig` drops the whole block anyway, so
  // the write could only mislead a reader of the file.
  for (const key of ['trust.paths', 'trust.owners']) {
    if (key in body.set) {
      return bad(
        `${key} cannot be written to a project file — a repository cannot grant itself trust. ` +
          'Set it in your user config instead.',
      )
    }
  }

  const file = configLocations(options.root, options.env, options.home).project
  let candidate = (await readRawConfigFile(file)) ?? {}

  // Both steps are inside one `try`. `setConfigValue` type-checks each value
  // and throws on a bad one, so it must be caught here too, or a wrong type
  // would answer 500 and report the caller's mistake as the server's.
  // `validateConfig` then checks the merged document, which catches a patch
  // that is valid alone but wrong against what the file already holds.
  try {
    for (const [key, value] of Object.entries(body.set)) {
      candidate = setConfigValue(candidate, key, value)
    }
    validateConfig(candidate, file)
  } catch (err) {
    return bad(err instanceof Error ? err.message : String(err))
  }

  await writeConfigFile(file, candidate)
  return null
}

/** A JSON object, as distinct from an array or a primitive. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface ServeOptions {
  /** The registered tools, built-ins plus any loaded. */
  project: Project
  /**
   * The project file names tools that were not loaded, because the repository
   * is untrusted or execution is off. A grant from the page does not load them,
   * and the response says so.
   */
  projectToolsPending?: boolean | undefined
  root: string
  collectOptions: WayOptions
  port?: number | undefined
  open?: boolean | undefined
  /** `runners.order` from config; applied to every collected catalog. */
  runnerOrder?: string[] | undefined
  /**
   * Which `collectOptions` keys came from a command-line flag rather than the
   * config file. Saving a setting re-reads the config's collect options in the
   * running process. A key named here is left alone, because the flag is the
   * user's latest explicit choice and saving another setting must not undo it.
   *
   * Only the keys `collectOptionsFromConfig` returns have an effect:
   * `exclude`, `discovery`, `excludePaths`.
   */
  pinnedByFlag?: readonly string[] | undefined
  /**
   * The trust store's environment and home, passed from the CLI. Injectable so
   * a test does not grant trust in the developer's own
   * `~/.local/state/wayfinder/`. Only tests pass them.
   */
  env?: Record<string, string | undefined> | undefined
  home?: string | undefined
}

/** What the page is served: a catalog, and where each runner's rows came from. */
export interface CatalogSnapshot {
  catalog: Catalog
  /** One entry per selected runner. All "fresh" after a real probe. */
  cache: RunnerCacheState[]
}

/**
 * Catalog access that runs at most one probe at a time and uses the store.
 *
 * The in-flight promise is cached, not the resolved value, because collection
 * is async and requests can overlap. Concurrent requests wait on one probe
 * instead of starting several.
 *
 * The first non-forced request answers from the store when it has an answer,
 * and starts a real probe in the background. So the page appears at once even
 * when the slowest runner takes seconds. Every later request gets the newest
 * result available. `?force` always runs a real probe, since a refresh
 * answered from a cache is not a refresh.
 *
 * A forced request never joins a probe already running, because that probe
 * started before whatever caused the force. It waits for the running probe to
 * finish and then starts its own, so it can take up to two probe durations.
 * Only `?force` callers wait this long. The poll and the focus reload do not.
 */
function createCatalogSource(
  project: Project,
  root: string,
  options: WayOptions,
  /**
   * Read on each probe, never captured, because saving `runners.order` changes
   * it while the server runs, just as saving a collect option changes `options`
   * in place.
   */
  runnerOrder: () => string[] | undefined,
  store: string,
) {
  let pending: Promise<CatalogSnapshot> | null = null
  let settledAt = 0
  let last: CatalogSnapshot | null = null
  /** The store is read at most once. After that, `last` is newer. */
  let consultedStore = false

  const probe = (): Promise<CatalogSnapshot> => {
    pending ??= collectAndCache(project, root, options, store)
      .then((collected) => {
        const snapshot: CatalogSnapshot = {
          catalog: orderedCatalog(collected, runnerOrder()),
          // Measured this instant, so nothing about it is stale.
          cache: freshStates(collected),
        }
        last = snapshot
        settledAt = Date.now()
        return snapshot
      })
      .finally(() => {
        pending = null
      })
    return pending
  }

  return async (force: boolean): Promise<CatalogSnapshot> => {
    if (force) {
      // Never join an in-flight probe. A forced request follows a change (a
      // trust grant, a saved setting), and a probe that started before the
      // change returns the old state. Wait for the running probe to finish
      // (its `finally` clears `pending`, so the call below starts a new one).
      const running = pending
      if (running !== null) await running.catch(() => {})
      return probe()
    }
    if (last !== null && Date.now() - settledAt < COALESCE_MS) return last
    if (!consultedStore) {
      consultedStore = true
      // Never throws and never probes. A broken store counts as a miss, and a
      // miss falls through to the probe below, as if there were no cache.
      const stored = await readCachedCatalog(project, root, options, store)
      // Serve it only when something came from the store. With execution off,
      // an empty store still returns withheld reports.
      if (stored.catalog !== null && fromStore(stored)) {
        last = { catalog: orderedCatalog(stored.catalog, runnerOrder()), cache: stored.runners }
        settledAt = Date.now()
        // Probe in the background, after answering. A probe failure is ignored
        // here, since this request was already answered from the store.
        void probe().catch(() => {})
        return last
      }
    }
    return probe()
  }
}

/**
 * Bind the port and return the server's handle, without printing or opening anything.
 *
 * Split out of {@link serve} because `serve` never returns, and a function
 * that never returns cannot be tested. Tests need to bind an ephemeral port,
 * send real requests to the endpoints that write, and stop again.
 *
 * The catalog source is returned with the handle, so the startup banner
 * reports the same probe the page will see.
 */
export async function startServer(options: ServeOptions): Promise<{
  server: FetchServer
  catalog: (force: boolean) => Promise<CatalogSnapshot>
  /** The one-shot token that signs a browser in; spent on first use. */
  bootToken: string
  /** Starts the boot token's expiry timer. Call it when the URL is shown to the user. */
  armBoot: () => void
}> {
  // Mutable: granting trust changes what the next probe may do, and saving a
  // setting changes what it collects. Every later collect() reads this same
  // object, so both take effect without a restart.
  const collectOptions: WayOptions = { ...options.collectOptions }
  // Mutable for the same reason. Only the config file sets it (no flag sets a
  // runner order), so only a save changes it.
  let runnerOrder: string[] | undefined = options.runnerOrder
  // The cache lives under the injected env and home, like the trust store, so
  // a test does not read and write the developer's own `~/.cache/wayfinder`.
  const catalog = createCatalogSource(
    options.project,
    options.root,
    collectOptions,
    () => runnerOrder,
    cacheDir(options.env, options.home),
  )

  // `home` is resolved here, not passed through as `options.home`, because
  // `trustPolicyOptions` (unlike `appTrustStore`) needs a real string to
  // expand a leading `~` against.
  const home = options.home ?? homeDir()
  const trustStoreInstance = appTrustStore({
    home,
    ...(options.env !== undefined ? { env: options.env } : {}),
  })

  /**
   * Whether the page may offer a trust grant.
   *
   * Derived from the hint, which the CLI sets only when the trust check
   * returned `untrusted`. So it means "trust is what is missing", not just
   * "execution is off". It is computed in the process that ran the check,
   * never from anything the scanned repository wrote.
   *
   * The server enforces it too: `POST /api/trust` refuses when it is false.
   */
  const trustable = (): boolean => collectOptions.execWithheldHint !== undefined

  /**
   * Re-read the config file's collect options after a save.
   *
   * Without this, the file is written and the dialog says "Saved", but the
   * running server keeps collecting what it was told at start. A save with no
   * effect is worse than a refusal.
   *
   * `allowExec` is not taken. The CLI decided this session's execution
   * against the trust store, and a project file cannot raise it. A key the
   * config no longer sets is deleted, so unchecking a runner and checking it
   * again both take effect. A key set by a flag is left alone (see
   * `ServeOptions.pinnedByFlag`).
   *
   * `runners.order` is updated too. The CLI reads it from the config at start
   * and nothing else sets it, so without this a saved order would have no
   * effect.
   */
  const CONFIG_OWNED = ['exclude', 'discovery', 'excludePaths'] as const
  const pinned = new Set(options.pinnedByFlag ?? [])
  const adoptConfig = (config: TaskConfig): void => {
    const derived = collectOptionsFromConfig(config) as Record<string, unknown>
    const target = collectOptions as Record<string, unknown>
    for (const key of CONFIG_OWNED) {
      if (pinned.has(key)) continue
      if (derived[key] === undefined) delete target[key]
      else target[key] = derived[key]
    }
    runnerOrder = config.runners?.order
  }

  const sessionToken = secret()
  let bootToken: string | null = secret()
  // The timer starts when the URL is shown to the user, not here. The first
  // probe runs in between, and on a cold tree it can take long enough to use
  // up much of the promised minute. Until then nothing can use the token,
  // because nothing has seen it.
  let bootExpiresAt = Number.POSITIVE_INFINITY
  const armBoot = (): void => {
    bootExpiresAt = Date.now() + BOOT_TTL_MS
  }

  /** True once, for the first request that presents the unexpired boot token. */
  const burnBoot = (candidate: string | null): boolean => {
    if (candidate === null || bootToken === null) return false
    if (Date.now() > bootExpiresAt) {
      bootToken = null
      return false
    }
    if (!tokenEquals(candidate, bootToken)) return false
    bootToken = null
    return true
  }

  const hasSession = (req: Request): boolean => {
    const header = req.headers.get(TOKEN_HEADER)
    return header !== null && tokenEquals(header, sessionToken)
  }

  /**
   * Set by the first accepted run. There is one terminal and one process, so
   * a second run cannot have it. Every later POST gets a 409, rather than two
   * spawns racing for the same stdin.
   */
  let handedOff = false

  const server = await serveFetch({
    hostname: '127.0.0.1',
    port: options.port ?? 0,
    async fetch(req, self) {
      const url = new URL(req.url)
      if (url.pathname === '/api/trust') {
        // DELETE revokes. Unlike the grant, it has no applicability check.
        // Refusing a grant protects a user from a lasting permission they did
        // not ask for, and removing one does no matching harm. It still needs
        // the right method: a GET can come from a link or an <img>, and
        // revoking is a write.
        if (req.method === 'DELETE') {
          if (!hasSession(req)) return unauthorized()
          const removed = await trustStoreInstance.untrust(options.root)
          // This session's execution setting is left as it is, on purpose.
          // Execution may be on because of this store or because of an
          // explicit `--exec`, and the server cannot tell which without
          // tracking extra state. The store now says not trusted. What this
          // process already decided stands until it restarts, and the screen
          // says so rather than implying a revoke that did not happen.
          const snapshot = await catalog(false)
          return Response.json(
            { ...snapshot.catalog, cache: snapshot.cache, trustable: trustable(), removed },
            { headers: { 'cache-control': 'no-store' } },
          )
        }
        // Anything but POST, including the GET a link or an <img> would make.
        if (req.method !== 'POST') {
          return new Response('use POST or DELETE', {
            status: 405,
            headers: { allow: 'POST, DELETE' },
          })
        }
        // The same session token every other route requires, in a header
        // only, so a cross-origin caller must pass a preflight this server
        // never answers. See the CSRF note at the top of the file.
        if (!hasSession(req)) return unauthorized()
        // Hiding the button is not enough. The token proves who is asking, not
        // that the request makes sense. `--no-exec` must stay off however
        // trusted the repository is. `--exec` must record nothing: it is
        // consent for one run, and saving it would turn one run into a lasting
        // grant nobody remembers giving. In both states the page hides the
        // button, so the endpoint refuses a grant the page could not have
        // offered. Nothing from the request is echoed back.
        if (!trustable()) {
          return new Response("a trust grant would not change this run's execution gate", {
            status: 409,
          })
        }
        await trustStoreInstance.trust(options.root)
        collectOptions.allowExec = true
        // The hint told the user to trust this repository, which they just did.
        delete collectOptions.execWithheldHint
        // The fresh catalog is returned with the grant, so the page re-renders
        // from one round trip rather than racing its own poll.
        const granted = await catalog(true)
        // Tool modules are code; this handler does not import them.
        const note = options.projectToolsPending
          ? `the tools ${PROJECT_CONFIG_FILENAME} names load the next time ${BIN} starts with execution allowed`
          : undefined
        return Response.json(
          {
            ...granted.catalog,
            cache: granted.cache,
            trustable: trustable(),
            ...(note !== undefined ? { note } : {}),
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      }
      if (url.pathname === '/api/run' && req.method === 'POST') {
        if (!hasSession(req)) return unauthorized()
        // Set here, before the first `await` in this route. An `await` yields
        // the event loop, so a check here and a set further down would let
        // other requests run in between. Two requests could both pass the
        // check, and both be told they had the terminal, one for a command
        // that never ran. Checking and setting in one step makes the second
        // POST a 409. Paths below that do not hand off clear the flag again,
        // so a later valid POST still works.
        if (handedOff) return new Response('conflict', { status: 409 })
        handedOff = true

        // An id plus trailing arguments, and nothing else. Any process on the
        // machine and any website the browser visits can reach this port, so
        // the command is never taken from the request. The id selects a task
        // from a catalog this server built, and that task supplies the binary,
        // the leading arguments and the cwd. Accepting argv, a command string
        // or a cwd would let any caller run any code.
        //
        // `args` adds the trailing arguments a recipe with parameters needs,
        // such as `staging` for `just deploy <env>`. The task's tool places
        // them, and they never replace the binary. So the worst a hostile
        // caller can do is pass arguments to a command already in the catalog.
        // `acceptArgs` and `runArgv` in args.ts enforce this, and its tests
        // check it.
        let task: Task | undefined
        let argv: string[] = []
        let snapshot: CatalogSnapshot
        try {
          const body = (await req.json().catch(() => null)) as {
            id?: unknown
            args?: unknown
          } | null
          const id = typeof body?.id === 'string' ? body.id : null
          snapshot = await catalog(false)
          task = id === null ? undefined : allTasks(snapshot.catalog).find((t) => t.id === id)
          if (task) argv = runArgv(options.project, task, acceptArgs(body?.args))
        } catch (err) {
          handedOff = false
          throw err
        }
        // Not an auth failure, so not the uniform 401. The caller is
        // authenticated and named a task that is not in the catalog, most
        // likely one renamed since the page loaded.
        //
        // When the page's listing came from the store, that is the likely
        // cause, and the user can act on it. A bare "not found" would tell
        // them a row on screen does not exist, with no explanation.
        if (!task) {
          handedOff = false
          const stale = snapshot.cache.filter((c) => c.state === 'stale')
          if (stale.length === 0) return new Response('not found', { status: 404 })
          const aged = stale.map((c) => `${c.runner} ${humanAge(c.ageMs)}`).join(', ')
          return new Response(
            `not found — this listing came from a cached probe (${aged}), so the task may have been ` +
              'renamed or removed since. Refresh the page.',
            { status: 404 },
          )
        }

        // The response has to reach the browser before the task takes the
        // terminal, because running the task stops this server. The spawn
        // blocks the event loop, so it waits for `stop()`, which resolves once
        // open responses have finished and their connections have closed.
        // Return the argv that will run, arguments included, so the handoff
        // banner names the command rather than the recipe.
        const payload = JSON.stringify({ ok: true, display: task.display, argv })

        void (async () => {
          // Wait one event-loop turn before the listener goes away, which also
          // lets this response be written first. With a warm catalog this
          // whole handler runs without yielding, so a POST queued on another
          // socket has not been parsed yet. Stopping now would drop it, and
          // that caller would see a connection reset instead of a 409. One
          // turn is enough for those requests to be read and answered, and
          // the task starts on the next turn.
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
          await self.stop()
          runAndExit(options.root, task, argv)
        })()

        return new Response(payload, {
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      }
      if (url.pathname === '/api/catalog') {
        // Header only — see the CSRF note at the top of the file.
        if (!hasSession(req)) return unauthorized()
        const snapshot = await catalog(url.searchParams.has('force'))
        // `cache` and `trustable` are both facts only the server knows. From
        // `cache` the page shows the same three states the TUI does.
        return Response.json(
          { ...snapshot.catalog, cache: snapshot.cache, trustable: trustable() },
          { headers: { 'cache-control': 'no-store' } },
        )
      }
      if (url.pathname === '/api/config') {
        // The session token in a header, never the boot token. See the CSRF
        // note at the top of the file.
        if (!hasSession(req)) return unauthorized()
        if (req.method === 'POST') {
          const failure = await writeProjectConfig(req, options)
          if (failure !== null) return failure
          // Falls through to the read below, so a save answers with the state
          // it produced. The screen re-renders from the file as it now is, in
          // one round trip.
        } else if (req.method !== 'GET') {
          return new Response('use GET or POST', { status: 405, headers: { allow: 'GET, POST' } })
        }
        const loaded = await loadConfig(options.root, options.env, options.home)
        // A save has to reach the running process, not just the file. Applied
        // after the re-read so it uses the merged layers, as the CLI did at
        // start.
        if (req.method === 'POST') adoptConfig(loaded.effective)
        // `sources` is a Map, which JSON.stringify renders as `{}`, so it is
        // converted to an object. The settings screen needs it to show which
        // layer each value came from.
        return Response.json(
          {
            effective: loaded.effective,
            project: loaded.layers.project,
            user: loaded.layers.user,
            sources: Object.fromEntries(loaded.sources),
            locations: { project: loaded.locations.project, user: loaded.locations.user },
            warnings: loaded.warnings,
            // Marker or policy: a root that the user file's
            // trust.paths/trust.owners covers shows as trusted with no marker.
            trusted: (
              await trustDecision(
                trustStoreInstance,
                options.root,
                trustPolicyFromConfig(loaded.effective),
                trustPolicyOptions(home),
              )
            ).trusted,
            // Whether a trust grant would change execution here, as opposed to
            // a config file having turned it off. The catalog route sends this
            // too. The settings screen needs it so it does not offer a grant
            // that would change nothing.
            trustable: trustable(),
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        if (!hasSession(req) && !burnBoot(url.searchParams.get('boot'))) return unauthorizedPage()
        // Built per request, so an edit to any part needs a reload, not a
        // restart. The bundle includes the matcher.
        return new Response(await buildPage(sessionToken), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      // Unknown paths also answer 401. A 404 would reveal the server's routes
      // to someone who cannot authenticate.
      return unauthorized()
    },
  })

  return { server, catalog, bootToken: bootToken as string, armBoot }
}

/**
 * The first lines `--serve` prints: the address, the root, what was collected
 * and what came from the cache. Repository text in them is terminal-safe.
 */
export function startupSummary(address: string, first: CatalogSnapshot): string {
  // A withheld runner has `status: "absent"` and `skippedForExec`. Printing
  // only its status would call it absent, the same word used for a runner the
  // repository does not have. Those are opposite facts: one means nothing is
  // here, the other means something is here that was not read. This summary is
  // all a `--serve` user sees before the page opens, so it says which.
  const counts = first.catalog.reports
    .map((r) => {
      const state = r.skippedForExec ? 'withheld' : r.status === 'ok' ? r.tasks.length : r.status
      return `${r.runner} ${state}`
    })
    .join(', ')
  const stale = first.cache.filter((c) => c.state === 'stale')
  let out = `${APP}  ${address}\n`
  out += `  root       ${terminalSafe(first.catalog.root)}\n`
  out += `  collected  ${terminalSafe(counts)}\n`
  if (stale.length > 0) {
    const aged = stale.map((c) => `${c.runner} ${humanAge(c.ageMs)}`).join(', ')
    out += `  cached     ${terminalSafe(aged)} — re-probing now\n`
  }
  return out
}

export async function serve(options: ServeOptions): Promise<number> {
  const { server, catalog, bootToken, armBoot } = await startServer(options)
  const address = `http://127.0.0.1:${server.port}`
  const bootUrl = `${address}/?boot=${bootToken}`
  // Not forced. This request decides how long the user waits for a URL, so it
  // takes the store's answer when there is one and probes in the background,
  // as the TUI does at start.
  const first = await catalog(false)
  armBoot()
  process.stdout.write(startupSummary(address, first))
  // The first view may come from the store. The `cached` line above says so
  // when it does.
  process.stdout.write(
    `  live       the page refreshes on focus and every 15s; Refresh always re-reads\n`,
  )
  process.stdout.write(`  stop       Ctrl-C\n`)

  if (options.open === false) {
    process.stdout.write(`  open       ${bootUrl}\n`)
    process.stdout.write(
      `             signs the browser in once; the boot token expires in 60 seconds if unused\n`,
    )
  } else {
    // Best effort: a headless or remote shell has no browser.
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open'
    const proc = spawnRunner(opener, { absolutePathOnly: true }).run([bootUrl], {
      cwd: options.root,
    })
    if (proc.exitCode !== 0) {
      process.stdout.write(`  (could not open a browser - visit ${bootUrl} within 60 seconds)\n`)
    }
  }

  // Held open by the server; Ctrl-C is the exit.
  return new Promise<number>(() => {})
}

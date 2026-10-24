/**
 * The web view — the same catalog as a page you can search in a browser.
 *
 * A SERVER rather than a generated file, because a file would be a snapshot:
 * add a task and the page is wrong with no signal that it is. Every
 * `/api/catalog` request re-probes, and the page re-fetches on focus and on a
 * slow poll, so what is on screen is what the repository currently has.
 *
 * Loopback is not by itself a boundary, so every route is behind a token.
 *
 * Other local users on this machine can reach 127.0.0.1, and can read a
 * process's argv and environment for as long as it runs. So the session token
 * never appears in a URL or an argv. What does appear in a URL is the boot
 * token, which is single-use and expires in a minute; burning it on first use
 * bounds the window to the moment between opening the browser and the page
 * loading.
 *
 * Any website the user visits can also issue cross-origin requests to
 * 127.0.0.1. A cookie would ride along on those — that is CSRF — while a
 * request header does not, and the token header is a non-simple header, so a
 * cross-origin fetch must first pass a CORS preflight this server never
 * answers. Hence header auth, and hence the boot token is accepted on the page
 * routes only, never on the API.
 *
 * `/api/run` hands this server's own terminal to a task and exits. It takes a
 * task id and nothing else — see the note on the route.
 *
 * `/api/trust` POST permits this repository's code to run from now on, so it is
 * gated a third time, beyond the method and the token: the grant must be
 * APPLICABLE — the same condition that decides whether the page may offer the
 * button at all. Without it a grant would override `--no-exec` or write the
 * store under `--exec`. DELETE revokes and carries no such gate.
 */

import { homedir } from 'node:os'

import { spawnRunner, streamRunner } from '@osdlc/command-seam'
import {
  tasks as allTasks,
  type Catalog,
  type Project,
  type RunnerCacheState,
  type Task,
} from '@osdlc/system-model/detect'
import { humanAge } from '@osdlc/system-model/duration'
import { trustDecision, trustStore } from '@osdlc/trust-repo'

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
  TRUST_STORE_TOOL,
  trustPolicyFromConfig,
  trustPolicyOptions,
  validateConfig,
  writeConfigFile,
  type TaskConfig,
} from './config.ts'
import { serveFetch, type FetchServer } from './http.ts'
import { buildPage } from './page.ts'

/** Requests inside this window share one probe; an explicit refresh skips it. */
const COALESCE_MS = 1500

/** How long the boot token stays usable if the browser never arrives. */
const BOOT_TTL_MS = 60_000

/** 128 bits, hex. `getRandomValues` is the CSPRNG; `Math.random` is not. */
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
 * One bare status line for every failure. Which check failed — no token, wrong
 * token, spent boot token, an API route refusing a boot token — is what an
 * attacker would use to aim, and the caller who is authorized never needs it.
 */
function unauthorized(): Response {
  return new Response('unauthorized', { status: 401 })
}

/**
 * The same 401, dressed for a human, and only on the page routes. After boot
 * the address bar no longer carries `?boot=`, so a reload is a reflex — and a
 * bare status line renders as twelve bytes of plain text with no way back.
 *
 * One document for every page-route failure — no token, wrong token, spent
 * token, expired token — so it still says nothing about which check failed.
 * Inline styles and no external requests: this server answers nothing else to
 * an unauthenticated caller.
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
 * Painting for the one line this server echoes before the task takes over.
 * The TUI's ANSI helpers are private to that module, so the shape — a dim `$`
 * and bold argv — is restated here rather than exported across the seam.
 */
const PAINT = !process.env['NO_COLOR'] && process.stdout.isTTY
const dim = (s: string): string => (PAINT ? `\x1b[2m${s}\x1b[0m` : s)
const bold = (s: string): string => (PAINT ? `\x1b[1m${s}\x1b[0m` : s)

/**
 * Hand the terminal to `argv` and take this process out of the way: the web
 * twin of the TUI's `runAndExit`, down to its cwd rule. It streams through the
 * command seam, so the task owns the terminal while it runs. `argv` runs
 * without a shell; `display` would be wrong to run, since its
 * `<placeholders>` read as redirections.
 */
function runAndExit(root: string, task: Task, argv: readonly string[]): never {
  // Echo what actually runs, not `display`.
  process.stdout.write(`${dim('$')} ${bold(argv.join(' '))}\n`)
  const [binary, ...rest] = argv
  const res = streamRunner(binary!).run(rest, {
    cwd: task.cwd === '.' ? root : `${root}/${task.cwd}`,
  })
  process.exit(res.exitCode)
}

/**
 * Apply a settings-screen edit to `<root>/waypost.config.json`.
 *
 * A PATCH of dotted keys, not a document. Two reasons, and the second is the
 * one that matters:
 *
 *   - `way config set` names keys the same way, so the screen and the CLI
 *     talk about the same thing in the same words.
 *   - The patch is applied to the file's RAW contents, so a key this version
 *     does not know — one from a newer waypost, one a person added by hand —
 *     survives the save. Writing a validated document instead would drop it
 *     silently, because `validateConfig` returns only the keys it recognises.
 *     `writeConfigFile` takes a raw record precisely to make this path
 *     writable.
 *
 * Returns null on success, or the Response to send on refusal.
 */
async function writeProjectConfig(req: Request, options: ServeOptions): Promise<Response | null> {
  const bad = (detail: string): Response => new Response(detail, { status: 400 })

  const body = (await req.json().catch(() => null)) as { set?: unknown } | null
  if (body === null || !isRecord(body.set)) return bad('expected { set: { <key>: <value> } }')

  // An allowlist, from the single list of settable keys. A key
  // outside it is refused rather than dropped: this is a write path, and a
  // caller whose key silently vanished would believe it had been saved.
  for (const key of Object.keys(body.set)) {
    if (!CONFIG_KEYS.includes(key)) return bad(`${key} is not a setting`)
  }

  // Tool modules are code. The page never edits them; `way config set` does.
  if ('tools' in body.set)
    return bad(`tools cannot be written from the page; use "${BIN} config set tools"`)

  // The one value a project file may never carry. `loadConfig` already strips
  // it after the fact, but a write path that accepted it would put it in the
  // file — where a reader would see it, believe it, and be wrong about the
  // execution boundary. A repository cannot grant itself permission to run its
  // own code; that is the trust store's job.
  if (body.set['allowExec'] === true) {
    return bad(
      'allowExec: true cannot be written to a project file — a repository cannot grant itself ' +
        'permission to run subprocesses. Trust this repository instead.',
    )
  }

  // Same rule, for the same reason: a project file must not be able to
  // pre-authorize itself (or any class of repositories, via trust.owners).
  // Refused even when empty — `loadConfig` drops the whole block either way,
  // so the write could only ever mislead a reader of the file.
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

  // Both steps under one guard. `setConfigValue` type-checks each value as it
  // goes and throws on a bad one, so a `try` around the whole-document
  // validation alone left a wrong type answering 500 — the caller's mistake
  // reported as the server's. `validateConfig` then re-checks the MERGED
  // document, which catches a patch that is fine in isolation and wrong
  // against what the file already holds.
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
   * The project file names tools that were not loaded because the repository is untrusted or execution is off.
   * A grant from the page does not load them; the response says so.
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
   * config file. Saving a setting re-derives the config's slice of the collect
   * options in the running process; a key named here is left alone, because a
   * flag is the user's most recent explicit instruction about it and a write
   * to some other setting must not revoke it.
   *
   * Only the keys `collectOptionsFromConfig` produces are meaningful:
   * `exclude`, `discovery`, `excludePaths`.
   */
  pinnedByFlag?: readonly string[] | undefined
  /**
   * The trust store's environment and home, threaded from the CLI. Injectable
   * for the reason every sibling in this lane is: a test that let them default
   * would grant trust in the developer's own `~/.local/state/waypost/`. Nothing but
   * a test ever passes them.
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
 * Single-flight catalog access, cache-aware.
 *
 * The in-flight PROMISE is cached, not the resolved value: caching the value
 * would be enough only if nothing could interleave, and collection is async.
 * Concurrent requests await one probe instead of starting several.
 *
 * The first non-forced request answers from the store when there is one and
 * starts a real probe behind it, so the page appears at once on a repository
 * whose slowest runner takes seconds. Every later request gets the freshest
 * thing available, and `?force` is always a real probe — an explicit refresh
 * that could be answered from a cache is not a refresh.
 *
 * A forced request never joins a probe already running: that probe reads the
 * world as it was before whatever forced this one. It WAITS the running probe
 * out and then takes its own, so a force landing on a busy source costs up to
 * two probe durations. Only `?force` callers pay it — the poll and the
 * focus reload do not — and it is the price of "always re-reads".
 */
function createCatalogSource(
  project: Project,
  root: string,
  options: WayOptions,
  /**
   * Read per probe, never captured: saving `runners.order` changes it mid-run,
   * exactly as saving a collect option mutates `options` in place.
   */
  runnerOrder: () => string[] | undefined,
  store: string,
) {
  let pending: Promise<CatalogSnapshot> | null = null
  let settledAt = 0
  let last: CatalogSnapshot | null = null
  /** The store is only ever worth asking once; after that `last` is better. */
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
      // Never ADOPT an in-flight probe. A forced request is made because
      // something just changed — a trust grant, a saved setting — and a probe
      // that started before the change answers from before it. Wait the
      // running one out (its `finally` clears `pending` as it settles, so the
      // call below starts a new one) rather than joining it.
      const running = pending
      if (running !== null) await running.catch(() => {})
      return probe()
    }
    if (last !== null && Date.now() - settledAt < COALESCE_MS) return last
    if (!consultedStore) {
      consultedStore = true
      // Never throws and never probes — a broken store is a miss, and a miss
      // falls through to the probe below, which is what would have happened
      // with no cache at all.
      const stored = await readCachedCatalog(project, root, options, store)
      // Only worth serving when something came OUT of the store: with
      // execution off, a cold store still yields withheld reports.
      if (stored.catalog !== null && fromStore(stored)) {
        last = { catalog: orderedCatalog(stored.catalog, runnerOrder()), cache: stored.runners }
        settledAt = Date.now()
        // Behind the answer, not in front of it. A failure there is the probe's
        // problem: this request has already been answered from the store.
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
 * Split out of {@link serve} because `serve` never returns — it is the process's
 * last statement — and a function that never returns cannot be tested. The
 * mutating endpoint is the one part of this file that must not regress silently,
 * so it needs a caller that can bind an ephemeral port, drive real requests and
 * stop again.
 *
 * The catalog source comes back with the handle because it is the server's, not
 * a second one: the startup banner must report the probe the page will see.
 */
export async function startServer(options: ServeOptions): Promise<{
  server: FetchServer
  catalog: (force: boolean) => Promise<CatalogSnapshot>
  /** The one-shot token that signs a browser in; spent on first use. */
  bootToken: string
  /** Starts the boot token's expiry window — call when the URL is handed over. */
  armBoot: () => void
}> {
  // Mutable: granting trust changes what the next probe is allowed to do, and
  // saving a setting changes what it collects. Every later collect() reads this
  // same object, which is what makes either of them take effect in place.
  const collectOptions: WayOptions = { ...options.collectOptions }
  // Mutable for the same reason, and only ever set from the config file: no
  // flag names a runner order, so a save is the one thing that changes it.
  let runnerOrder: string[] | undefined = options.runnerOrder
  // The store lives under the INJECTED env and home, exactly as the trust store
  // does — a test that let these default would read and write the developer's
  // own `~/.cache/waypost`.
  const catalog = createCatalogSource(
    options.project,
    options.root,
    collectOptions,
    () => runnerOrder,
    cacheDir(options.env, options.home),
  )

  // `home` is resolved once here (rather than passed as `options.home`
  // verbatim) because `trustPolicyOptions`, unlike `trustStore`, needs a
  // concrete string to expand a leading `~` against.
  const home = options.home ?? homedir()
  const trustStoreInstance = trustStore({
    tool: TRUST_STORE_TOOL,
    home,
    ...(options.env !== undefined ? { env: options.env } : {}),
  })

  /**
   * Whether the page may offer a trust grant.
   *
   * Derived from the hint the CLI set, which it sets only when the gate came
   * out `untrusted` — so this says "trust is what is missing", not merely
   * "execution is off". It is computed here, in the process that resolved the
   * gate, and never from anything the scanned repository wrote.
   *
   * It is not advice to the page: `POST /api/trust` refuses when it is false.
   */
  const trustable = (): boolean => collectOptions.execWithheldHint !== undefined

  /**
   * Re-derive the config file's slice of the collect options after a save.
   *
   * Without this the file is written, the dialog says "Saved", and the running
   * server goes on collecting what it was told at boot — a save with no
   * effect, which is worse than a refusal.
   *
   * `allowExec` is deliberately NOT among the keys taken: this session's
   * execution gate was resolved by the CLI against the trust store, and a
   * project file cannot raise it. A key the config no longer sets is deleted,
   * so unchecking a runner and checking it again both land. A key pinned by a
   * flag is left alone — see `ServeOptions.pinnedByFlag`.
   *
   * `runners.order` rides along because it is the same promise: the CLI reads
   * it out of the config at boot and nothing else ever sets it, so a save that
   * did not reach it would leave one setting silently inert.
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
  // Stamped when the URL is actually handed to the user, not here: the first
  // full probe runs in between, and on a cold tree it is long enough that a
  // clock started now would overstate the window the output promises. Until
  // then nothing can spend the token, because nothing has seen it.
  let bootExpiresAt = Number.POSITIVE_INFINITY
  const armBoot = (): void => {
    bootExpiresAt = Date.now() + BOOT_TTL_MS
  }

  /** True once: for the first request that presents the still-live boot token. */
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
   * Latched by the first accepted run. There is one terminal and one process,
   * so a second run has nothing left to be handed — every later POST is a 409
   * rather than a race between two spawns for the same stdin.
   */
  let handedOff = false

  const server = await serveFetch({
    hostname: '127.0.0.1',
    port: options.port ?? 0,
    async fetch(req, self) {
      const url = new URL(req.url)
      if (url.pathname === '/api/trust') {
        // DELETE revokes. It is NOT gated on applicability the way the grant
        // is: refusing to grant protects a user from a standing permission
        // they did not ask for, and there is no matching harm in removing one.
        // The only rule it keeps is the method — a GET is reachable from a
        // link or an <img>, and revoking is a write.
        if (req.method === 'DELETE') {
          if (!hasSession(req)) return unauthorized()
          const removed = await trustStoreInstance.untrust(options.root)
          // THE RUNNING SESSION'S GATE IS NOT TOUCHED, deliberately. Execution
          // may be on because of this store or because of an explicit
          // `--exec`, and this server cannot tell which without tracking
          // state that would be wrong the first time someone added a third
          // way. The store is the durable answer and it is now `false`; what
          // this process already resolved stands until it restarts, and the
          // screen says exactly that rather than implying a revoke it did not
          // perform.
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
        // The same session token every other route requires — header only, so
        // a cross-origin caller has to clear a preflight this server never
        // answers. See the CSRF note at the top of the file.
        if (!hasSession(req)) return unauthorized()
        // A hidden button is not a gate. The token proves WHO is asking; it
        // never proves that asking made sense. `--no-exec` must stay off
        // however trusted the repository is, and `--exec` must record nothing
        // — it is consent for one run, and persisting it would turn a
        // deliberate run into a standing grant nobody remembers giving. Both
        // are exactly the states in which the page would not have offered the
        // button, so the endpoint refuses a grant it could not have been
        // legitimately asked for. Nothing of the request is echoed back.
        if (!trustable()) {
          return new Response("a trust grant would not change this run's execution gate", {
            status: 409,
          })
        }
        await trustStoreInstance.trust(options.root)
        collectOptions.allowExec = true
        // The hint told the user to trust this repository, which they just did.
        delete collectOptions.execWithheldHint
        // The fresh catalog comes back with the grant, so the page re-renders
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
        // Claimed here, before the first `await` in this route. An `await`
        // yields the event loop, so a check up here and a set further down are
        // two steps with other requests running between them: both would pass
        // the check, both would set the latch, and both would be told they had
        // been handed the terminal — one of them for a command that never ran.
        // Reading and setting it in one uninterrupted step is what makes the
        // second POST a 409. Paths below that turn out NOT to hand off release
        // it again, so a later legitimate POST still wins.
        if (handedOff) return new Response('conflict', { status: 409 })
        handedOff = true

        // An id, plus trailing arguments — and nothing else. This port is
        // reachable by any process on the machine and by any website the
        // browser visits, so the COMMAND is never taken from the request: the
        // id selects a task out of a catalog this server produced itself, and
        // that task supplies the binary, the leading arguments and the cwd.
        // Accepting argv, a command string or a cwd would make this an
        // arbitrary-code-execution endpoint.
        //
        // What `args` adds is the tail a parameterised recipe needs — `staging`
        // for `just deploy <env>`. They are bound by the task's tool and never
        // replace the binary, so the worst a hostile caller can do is pass
        // arguments to a command the catalog already contains. `acceptArgs`
        // and `runArgv` in args.ts hold that rule and are asserted there.
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
        // Not an auth failure, so not the uniform 401: the caller is
        // authenticated and is simply naming a task that is not in the
        // catalog — most likely one that was renamed since the page loaded.
        //
        // When the listing the page was served came out of the store, that is
        // the far more likely explanation and it is one the user can act on. A
        // bare "not found" would leave them looking at a row that is on screen
        // and being told it does not exist, with nothing connecting the two.
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

        // The response has to reach the browser BEFORE the terminal changes
        // hands, because taking it kills this server. `spawnSync` blocks the
        // event loop outright, so the spawn waits for `stop()`, which resolves
        // once open responses have finished and their connections closed.
        // Echo the argv that will actually run, arguments included, so the
        // handoff banner names the command rather than the recipe.
        const payload = JSON.stringify({ ok: true, display: task.display, argv })

        void (async () => {
          // A macrotask before the listener goes away, which also lets this
          // response be written first. On a warm catalog this
          // whole handler runs without ever yielding, so a POST already queued
          // on another socket has not been parsed yet — stopping here destroys
          // it, and the loser sees a connection reset instead of the 409 the
          // latch promised it. One turn of the loop is enough for those
          // requests to be read and answered, and it is a yield rather than a
          // wait: the terminal changes hands on the very next turn.
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
        // `cache` alongside `trustable`: both are the server's own reading of
        // something the page cannot work out for itself. The page renders the
        // same three states the TUI does from it.
        return Response.json(
          { ...snapshot.catalog, cache: snapshot.cache, trustable: trustable() },
          { headers: { 'cache-control': 'no-store' } },
        )
      }
      if (url.pathname === '/api/config') {
        // Header only, and the session token only — never the boot token. See
        // the CSRF note at the top of the file.
        if (!hasSession(req)) return unauthorized()
        if (req.method === 'POST') {
          const failure = await writeProjectConfig(req, options)
          if (failure !== null) return failure
          // Falls through to the read below, so a save answers with the state
          // it produced. One round trip: the screen re-renders from the file
          // as it now is rather than from what it hoped it wrote.
        } else if (req.method !== 'GET') {
          return new Response('use GET or POST', { status: 405, headers: { allow: 'GET, POST' } })
        }
        const loaded = await loadConfig(options.root, options.env, options.home)
        // A save has to reach the running process, not just the file. Applied
        // after the re-read so it adopts the merged layers, exactly as the CLI
        // did at boot.
        if (req.method === 'POST') adoptConfig(loaded.effective)
        // `sources` is a Map, which JSON.stringify renders as `{}`. The page
        // needs it most of all — "this came from your user config, not this
        // project" is the question a settings screen exists to answer — so it
        // is converted rather than lost.
        return Response.json(
          {
            effective: loaded.effective,
            project: loaded.layers.project,
            user: loaded.layers.user,
            sources: Object.fromEntries(loaded.sources),
            locations: { project: loaded.locations.project, user: loaded.locations.user },
            warnings: loaded.warnings,
            // Marker OR policy — a root the user file's trust.paths/trust.owners
            // covers shows as trusted here even with no marker at all.
            trusted: (
              await trustDecision(
                trustStoreInstance,
                options.root,
                trustPolicyFromConfig(loaded.effective),
                trustPolicyOptions(home),
              )
            ).trusted,
            // Whether a trust grant is the thing that would change execution
            // here, as distinct from a config file having turned it off. The
            // catalog route already sends this; the settings screen needs it to
            // avoid offering a grant that would change nothing.
            trustable: trustable(),
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        if (!hasSession(req) && !burnBoot(url.searchParams.get('boot'))) return unauthorizedPage()
        // Assembled per request so editing any part is a reload, not a
        // restart. The bundle includes the matcher, which retired /match.js.
        return new Response(await buildPage(sessionToken), {
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      // Unknown paths answer 401 as well: a 404 would map the server's routes
      // for someone who cannot authenticate.
      return unauthorized()
    },
  })

  return { server, catalog, bootToken: bootToken as string, armBoot }
}

export async function serve(options: ServeOptions): Promise<number> {
  const { server, catalog, bootToken, armBoot } = await startServer(options)
  const address = `http://127.0.0.1:${server.port}`
  const bootUrl = `${address}/?boot=${bootToken}`
  // NOT forced. This is the request that decides how long the user waits for a
  // URL, so it takes the store's answer when there is one and lets the real
  // probe land behind it — the same stale-then-refresh the TUI boots with.
  const first = await catalog(false)
  armBoot()
  // A withheld runner is `status: "absent"` with `skippedForExec`, and printing
  // its status alone called it absent — the same word used for a runner this
  // repository genuinely does not have. The two are opposite facts: one says
  // there is nothing here, the other says there is something here we did not
  // read. The summary is the only thing a `--serve` user sees before the page
  // opens, so it says which.
  const counts = first.catalog.reports
    .map((r) => {
      const state = r.skippedForExec ? 'withheld' : r.status === 'ok' ? r.tasks.length : r.status
      return `${r.runner} ${state}`
    })
    .join(', ')
  const stale = first.cache.filter((c) => c.state === 'stale')

  process.stdout.write(`${APP}  ${address}\n`)
  process.stdout.write(`  root       ${first.catalog.root}\n`)
  process.stdout.write(`  collected  ${counts}\n`)
  if (stale.length > 0) {
    process.stdout.write(
      `  cached     ${stale.map((c) => `${c.runner} ${humanAge(c.ageMs)}`).join(', ')} — re-probing now\n`,
    )
  }
  // Not "re-probed per request" any more: the first paint may come from the
  // store, which the `cached` line above says when it does.
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
    // Best-effort: a headless or remote shell has no browser, and that is fine.
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open'
    const proc = spawnRunner(opener).run([bootUrl], { cwd: options.root })
    if (proc.exitCode !== 0) {
      process.stdout.write(`  (could not open a browser - visit ${bootUrl} within 60 seconds)\n`)
    }
  }

  // Held open by the server; Ctrl-C is the exit.
  return new Promise<number>(() => {})
}

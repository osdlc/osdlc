/**
 * JetBrains IDEs: a terminal tab in the IDE window that has the project open,
 * driven through a companion plugin
 * (`docs/planning/research/jetbrains.md` records why the bundled MCP
 * Server is not enough).
 *
 * The plugin serves `/api/sdlc/...` on the IDE's built-in web server and
 * registers each running IDE at `<runtime dir>/hosts/jetbrains/<pid>.json`
 * with its port and a per-IDE bearer
 * token. This host reads those files (skipping, on POSIX, any another user
 * owns or can write), picks the IDE whose open project contains
 * `cwd`, and calls it over loopback HTTP through `curl` on the command seam
 * (the host parts are synchronous, so `fetch` is out). When no IDE has a
 * project containing `cwd`, the optional `openWorkspace` part asks an IDE to
 * open the git root of `cwd` as a project (the caller's launch
 * policy decides when; the IDE still asks the person to trust it); `terminal`/`session`/`send`/`find`/`focus`
 * never open one themselves.
 *
 * Wire format (JSON; every call carries `Authorization: Bearer <token>`; the
 * golden request/response pairs
 * are read by this host's tests and the plugin's):
 * - `GET  /api/sdlc/ping`           -> `{protocol, pid, product, projects[]}`
 * - `POST /api/sdlc/project/open`   `{path}` -> `{ok, project}` or `{ok: false, error}`
 * - `POST /api/sdlc/terminal/open`  `{cwd, title, argv}` -> `{ok}`
 * - `POST /api/sdlc/terminal/send`  `{cwd, text}` -> `{accepted}`
 * - `POST /api/sdlc/terminal/list`  `{cwd}` -> `{terminals: [{id, title, cwd, alive}]}`
 * - `POST /api/sdlc/terminal/focus` `{cwd}` -> `{ok}`
 * Errors are `{ok: false, error}` with HTTP 400 (bad request), 401 (token), 404
 * (unknown endpoint), 500 (the plugin threw), 503 (the IDE's UI thread was busy or a dialog is
 * open: nothing was done) or 504 (the UI thread began the work but did not finish: the outcome
 * is unknown); the plugin bounds its wait for the UI thread (3 s, then 2 s more) so a stuck IDE
 * answers instead of hanging. The host surfaces that text.
 * The registry entry and the ping reply both carry `protocol`; an IDE speaking
 * another version is skipped with a stated reason. The ping reply also carries the IDE's `pid`,
 * which must equal the registry file's: a mismatch is a stale entry whose port another process
 * now holds, and that IDE is skipped.
 * `send` never acks: the terminal API reports no consumption. A 504 on `send` is accepted
 * and uncertain, since the text may still land.
 *
 * Provenance (`docs/planning/research/jetbrains.md`): the wire format is pinned by
 * golden fixtures, and was observed in one `runIde` sandbox run.
 */

import { homedir } from 'node:os'
import { parse } from 'node:path'

import { resolveRunner, type CommandRunner } from '@osdlc/command-seam'
import { isRecord, isWithin, parseJsonOrNull, pidAlive, realResolve, which } from '../util.ts'
import { Git } from '@osdlc/typed-git'

import {
  supportsPlatform,
  type CommandRequest,
  type FindQuery,
  type FoundSession,
  type Host,
  type OpenedWorkspace,
  type OpenWorkspaceQuery,
  type SendReceipt,
  type SendRequest,
} from '../contract.ts'
import { sessionViaTerminal } from '../harness.ts'
import {
  deepestContaining,
  readHostRegistry,
  registryDirOf,
  type HostStateOptions,
} from './registry.ts'

/** What one registry file holds: how to reach one running IDE. */
export interface JetbrainsEndpoint {
  pid: number
  port: number
  token: string
  /** Wire protocol the plugin speaks; absent in files written before it existed. */
  protocol: number | null
  /** ISO start time of the IDE process; '' in a registry file written before the plugin recorded it. */
  startedAt: string
}

/**
 * The wire protocol this host speaks.
 *
 * @experimental needs the companion JetBrains plugin, which is not published yet.
 */
export const JETBRAINS_PROTOCOL = 2

/** A parsed HTTP reply. */
interface HttpReply {
  status: number
  body: unknown
}

/** One reachable IDE and the project roots it has open. */
interface Ide extends JetbrainsEndpoint {
  /** Product name from `ping`, e.g. "WebStorm"; empty when the plugin did not say. */
  product: string
  projects: string[]
}

/**
 * The `host.jetbrains` settings.
 *
 * @experimental needs the companion JetBrains plugin, which is not published yet.
 */
export interface JetbrainsSettings {
  /** Which IDE opens a workspace when several run: matched case-insensitively and exactly against the product name. */
  ide?: string | undefined
}

/** How long the plugin may take to open a project (it waits up to 60s for the trust prompt). */
const OPEN_PROJECT_TIMEOUT_SEC = 70

/** A ping's time limit (s): a hung IDE must not stall host detection or a send for 10s (the VS Code host's limit too). */
const PING_TIMEOUT_SEC = 1.5

/** How long {@link makeJetbrainsHost} reuses the list of answering IDEs. */
const IDES_TTL_MS = 5_000

/** Validates one parsed registry file; null when it is not a usable endpoint. */
export function parseRegistryEntry(parsed: unknown): JetbrainsEndpoint | null {
  if (!isRecord(parsed)) return null
  const { pid, port, token } = parsed
  if (typeof pid !== 'number' || !Number.isInteger(pid)) return null
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0 || port > 65535) return null
  if (typeof token !== 'string' || token === '') return null
  return {
    pid,
    port,
    token,
    protocol: typeof parsed['protocol'] === 'number' ? parsed['protocol'] : null,
    startedAt: typeof parsed['startedAt'] === 'string' ? parsed['startedAt'] : '',
  }
}

/** curl's `--config` quoting: JSON text has no raw newlines, so `\` and `"` are all to escape. */
function curlQuote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * `curl` argv and stdin for one call. Token and body go in a config read from
 * stdin, so neither shows in the process list.
 */
export function curlRequest(
  ide: JetbrainsEndpoint,
  path: string,
  body: unknown,
  timeoutSec = 10,
): { argv: string[]; input: string } {
  const lines = [
    `url = ${curlQuote(`http://127.0.0.1:${ide.port}${path}`)}`,
    `header = ${curlQuote(`Authorization: Bearer ${ide.token}`)}`,
  ]
  if (body !== undefined) {
    lines.push(`header = ${curlQuote('Content-Type: application/json')}`)
    lines.push(`data-binary = ${curlQuote(JSON.stringify(body))}`)
  }
  return {
    // `-q` (first, or curl ignores it) skips the user's `~/.curlrc`, whose options could change
    // the reply's shape. `--noproxy '*'` keeps the call and its bearer token off any
    // `http_proxy`: the IDE is on loopback. `-w` appends the status after the body so a 4xx/5xx
    // body is not lost to `--fail`.
    argv: [
      '-q',
      '--noproxy',
      '*',
      '-sS',
      '-m',
      String(timeoutSec),
      '-w',
      '\n%{http_code}',
      '-K',
      '-',
    ],
    input: lines.join('\n') + '\n',
  }
}

/**
 * The JetBrains host: opens terminal tabs in a running JetBrains IDE through the companion plugin,
 * reached over loopback HTTP with `curl`, which must be on PATH. darwin only; available when an IDE with the plugin is running.
 * Reads the IDEs the plugin registered under `runtimeDir`/`registryDir` ({@link HostStateOptions}).
 *
 * @experimental needs the companion JetBrains plugin, which is not published yet.
 */
export function makeJetbrainsHost(
  opts: {
    available?: (() => boolean) | undefined
    runner?: CommandRunner | undefined
    pidAlive?: ((pid: number) => boolean) | undefined
    /** The clock, in ms, for the answering-IDE cache. */
    now?: (() => number) | undefined
    /** The resolved `host.jetbrains` settings; none means any IDE. */
    settings?: JetbrainsSettings | undefined
    /** The git top-level of `cwd`, or null outside a repository. Injectable for tests. */
    gitRoot?: ((cwd: string) => string | null) | undefined
  } & HostStateOptions,
): Host {
  const curl = (): CommandRunner | null => {
    if (opts.runner !== undefined) return opts.runner
    return which('curl') === null ? null : resolveRunner('curl')
  }

  /** One call: the HTTP status and parsed body, or null when curl could not connect. */
  const call = (
    ide: JetbrainsEndpoint,
    path: string,
    body?: unknown,
    timeoutSec?: number,
  ): HttpReply | null => {
    const runner = curl()
    if (runner === null) return null
    const { argv, input } = curlRequest(ide, path, body, timeoutSec)
    const res = runner.run(argv, {
      cwd: process.cwd(),
      timeoutMs: ((timeoutSec ?? 10) + 5) * 1000,
      input,
    })
    if (res.exitCode !== 0) return null
    const cut = res.stdout.lastIndexOf('\n')
    const status = Number(res.stdout.slice(cut + 1))
    if (cut < 0 || !Number.isInteger(status)) return null
    return { status, body: parseJsonOrNull(res.stdout.slice(0, cut)) }
  }

  /** The body of a 2xx reply, or why the call failed. */
  const callChecked = (
    ide: JetbrainsEndpoint,
    path: string,
    body?: unknown,
    timeoutSec?: number,
  ): { body: Record<string, unknown> } | { problem: string } => {
    const res = call(ide, path, body, timeoutSec)
    if (res === null) return { problem: `IDE pid ${ide.pid} did not answer on port ${ide.port}` }
    if (res.status === 401) {
      return { problem: `IDE pid ${ide.pid} rejected the token (stale registry file?)` }
    }
    if (res.status === 404) {
      return { problem: `plugin endpoint ${path} missing in IDE pid ${ide.pid} (old plugin?)` }
    }
    if (res.status < 200 || res.status >= 300 || !isRecord(res.body)) {
      const detail = isRecord(res.body) ? String(res.body['error'] ?? '') : ''
      return { problem: `host call ${path} failed (HTTP ${res.status}) ${detail}`.trim() }
    }
    return { body: res.body }
  }

  /** Every registered IDE whose process is alive and which answers `ping`, and why the rest were skipped. */
  const now = opts.now ?? Date.now
  let idesCache: { at: number; ides: Ide[]; problems: string[] } | null = null

  const runningIdes = (): { ides: Ide[]; problems: string[] } => {
    if (idesCache !== null && now() - idesCache.at < IDES_TTL_MS) return idesCache
    const dir = registryDirOf('jetbrains', opts)
    const ides: Ide[] = []
    const problems: string[] = []
    const endpoints = readHostRegistry(dir, parseRegistryEntry, opts.pidAlive ?? pidAlive, {
      onSkip: (reason) => problems.push(reason),
    })
    for (const endpoint of endpoints) {
      if (endpoint.protocol !== JETBRAINS_PROTOCOL) {
        problems.push(
          `IDE pid ${endpoint.pid} speaks plugin protocol ${endpoint.protocol ?? 'none'}, not ${JETBRAINS_PROTOCOL}`,
        )
        continue
      }
      const pong = callChecked(endpoint, '/api/sdlc/ping', undefined, PING_TIMEOUT_SEC)
      if ('problem' in pong) {
        problems.push(pong.problem)
        continue
      }
      if (pong.body['protocol'] !== JETBRAINS_PROTOCOL) {
        problems.push(
          `IDE pid ${endpoint.pid} answered ping with protocol ${String(pong.body['protocol'])}`,
        )
        continue
      }
      if (pong.body['pid'] !== endpoint.pid) {
        problems.push(
          `IDE pid ${endpoint.pid}'s registry file is stale: port ${endpoint.port} answered${
            pong.body['pid'] === undefined ? '' : ` as pid ${String(pong.body['pid'])}`
          }`,
        )
        continue
      }
      const projects = Array.isArray(pong.body['projects']) ? pong.body['projects'] : []
      ides.push({
        ...endpoint,
        product: typeof pong.body['product'] === 'string' ? pong.body['product'] : '',
        projects: projects.filter((p): p is string => typeof p === 'string'),
      })
    }
    idesCache = { at: now(), ides, problems }
    return idesCache
  }

  /** The IDE and project root of the deepest open project containing `cwd`, or null; every reachable IDE; why others were skipped. */
  const resolveIde = (
    cwd: string,
  ): { ide: Ide | null; root: string | null; ides: Ide[]; problems: string[] } => {
    const { ides, problems } = runningIdes()
    const ide = deepestContaining(
      cwd,
      ides,
      (i) => i.projects,
      (i) => i.startedAt,
    )
    let root: string | null = null
    for (const base of ide?.projects ?? []) {
      if (!isWithin(cwd, base)) continue
      const real = realResolve(base)
      if (root === null || real.length > root.length) root = real
    }
    return { ide, root, ides, problems }
  }

  const noIde = (cwd: string, problems: string[], why: string): Error =>
    new Error(
      `no running JetBrains IDE with the companion plugin has a project containing ${cwd}. ${why}` +
        (problems.length > 0 ? ` Skipped: ${problems.join('; ')}.` : ''),
    )

  /** Which reachable IDE should open a workspace: the only one, else the one `host.jetbrains.ide` names. */
  const pickIde = (cwd: string, ides: Ide[], problems: string[]): Ide => {
    if (ides.length === 0) {
      throw noIde(
        cwd,
        problems,
        'No IDE is reachable to open it in; start one with the companion plugin.',
      )
    }
    if (ides.length === 1) return ides[0]!
    const list = ides.map((i) => `${i.product || 'unknown'} (pid ${i.pid})`).join(', ')
    const pref = opts.settings?.ide?.toLowerCase()
    if (pref === undefined) {
      throw noIde(
        cwd,
        problems,
        `Several IDEs are running (${list}); set host.jetbrains.ide to the product name of the one to use.`,
      )
    }
    // Exact, not substring: "IDEA" must not pick both IntelliJ IDEA and a hypothetical "IDEA Edu".
    const hits = ides.filter((i) => i.product !== '' && i.product.toLowerCase() === pref)
    if (hits.length !== 1) {
      throw noIde(
        cwd,
        problems,
        `host.jetbrains.ide "${opts.settings?.ide}" names ${hits.length === 0 ? 'none' : 'more than one'} of the running IDEs (${list}); it must equal a product name, ignoring case.`,
      )
    }
    return hits[0]!
  }

  /**
   * The folder to open for `cwd`: its git top-level, else `cwd` itself when
   * git fails, `cwd` is outside a repository, or the top-level is the home
   * directory or filesystem root (a dotfiles repo must not become the project).
   */
  const workspaceRoot = (cwd: string): string => {
    let top: string | null
    try {
      top = (opts.gitRoot ?? ((c: string) => new Git(c).topLevel()))(cwd)
    } catch {
      top = null
    }
    if (top === null) return cwd
    const real = realResolve(top)
    return real === realResolve(homedir()) || real === parse(real).root ? cwd : top
  }

  /** The IDE holding a project that contains `cwd`; the error names what to do when none does. */
  const ideFor = (cwd: string): Ide => {
    const found = resolveIde(cwd)
    if (found.ide !== null) return found.ide
    throw noIde(
      cwd,
      found.problems,
      'Open that folder as a project in the IDE, or launch with workspace opening on (`ensureWorkspace`).',
    )
  }

  return {
    name: 'jetbrains',
    // Verified in the gradle runIde sandbox on macOS only (a platform that was not run is left out).
    platforms: ['darwin'],
    available() {
      if (opts.available !== undefined) return opts.available()
      if (!supportsPlatform(this)) return false
      return runningIdes().ides.length > 0
    },
    openWorkspace(query: OpenWorkspaceQuery): OpenedWorkspace {
      const found = resolveIde(query.cwd)
      if (found.ide !== null && found.root !== null) return { root: found.root, opened: false }
      const ide = pickIde(query.cwd, found.ides, found.problems)
      const path = workspaceRoot(query.cwd)
      query.notice?.(
        `opening ${path} in ${ide.product || 'the JetBrains IDE'}… (approve the trust prompt in the IDE if it asks; waiting up to a minute)`,
      )
      const res = callChecked(ide, '/api/sdlc/project/open', { path }, OPEN_PROJECT_TIMEOUT_SEC)
      if ('problem' in res) throw new Error(`JetBrains could not open ${path}: ${res.problem}`)
      if (res.body['ok'] !== true) {
        throw new Error(
          `JetBrains could not open ${path}: ${String(res.body['error'] ?? 'unknown error')}`,
        )
      }
      idesCache = null // the IDE now has one more project open
      const project = res.body['project']
      return { root: typeof project === 'string' ? project : path, opened: true }
    },
    terminal(req: CommandRequest) {
      const ide = ideFor(req.cwd)
      const res = callChecked(ide, '/api/sdlc/terminal/open', {
        cwd: req.cwd,
        title: req.title,
        argv: req.argv,
      })
      if ('problem' in res)
        throw new Error(`JetBrains terminal open failed for ${req.cwd}: ${res.problem}`)
      if (res.body['ok'] !== true) {
        const said = typeof res.body['error'] === 'string' ? `: ${res.body['error']}` : ''
        throw new Error(`JetBrains terminal open failed for ${req.cwd}${said}`)
      }
      return 0
    },
    session: sessionViaTerminal,
    send(req: SendRequest): SendReceipt {
      const { ide } = resolveIde(req.cwd)
      if (ide === null) return { accepted: false, ack: false }
      const res = call(ide, '/api/sdlc/terminal/send', { cwd: req.cwd, text: req.text })
      // 504: the UI thread began typing, so the text may land; retyping it would double it.
      if (res?.status === 504) return { accepted: true, ack: false, uncertain: true }
      const ok = res !== null && res.status >= 200 && res.status < 300
      return { accepted: ok && isRecord(res.body) && res.body['accepted'] === true, ack: false }
    },
    find(query: FindQuery): FoundSession[] {
      const { ide } = resolveIde(query.cwd)
      if (ide === null) return []
      const res = callChecked(ide, '/api/sdlc/terminal/list', { cwd: query.cwd })
      const terminals = 'body' in res ? res.body['terminals'] : undefined
      if (!Array.isArray(terminals)) return []
      const found: FoundSession[] = []
      for (const t of terminals) {
        if (!isRecord(t)) continue
        found.push({
          cwd: typeof t['cwd'] === 'string' ? t['cwd'] : query.cwd,
          harness: null,
          alive: t['alive'] === true,
          lastOutputAt: null,
          handle: typeof t['id'] === 'string' ? t['id'] : null,
        })
      }
      return found
    },
    focus(query: FindQuery): boolean {
      const { ide } = resolveIde(query.cwd)
      if (ide === null) return false
      const res = callChecked(ide, '/api/sdlc/terminal/focus', { cwd: query.cwd })
      return 'body' in res && res.body['ok'] === true
    },
  }
}

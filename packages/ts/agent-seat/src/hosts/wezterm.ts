/**
 * WezTerm: panes driven through `wezterm cli`, which talks to a running
 * GUI or mux server. Findings are docs-only (WezTerm was not installed when
 * this was written) — see `docs/planning/research/wezterm.md`.
 *
 * Panes are addressed by the numeric pane id. A session launched with a
 * caller session id has its pane id remembered (`./session-panes.ts`), and every part
 * resolves that pane first; otherwise (a request without an id, or a pane
 * opened before ids were remembered) `find` maps a cwd to panes via
 * `cli list --format json` and every other part resolves its pane through that
 * lookup at call time. Every argv is passed directly (no shell string),
 * so it behaves the same on Windows. When no GUI/mux is running the cli
 * commands fail; that reads as "no session",
 * except `terminal`/`session`, which throw because they cannot create one.
 */

import { readdirSync, rmSync, statSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'

import { failureText, ran, resolveRunner, type CommandRunner } from '@osdlc/command-seam'
import { ensureDir, isRecord, parseJsonOrNull, readJsonOrNull, writeJsonAtomic } from '../util.ts'

import type {
  CommandRequest,
  FindQuery,
  FoundSession,
  Host,
  SendReceipt,
  SendRequest,
} from '../contract.ts'
import { onPath, quietRun, supportsPlatform } from '../contract.ts'
import { sessionViaTerminal } from '../harness.ts'
import { registryDirOf, type HostStateOptions } from './registry.ts'
import { boundPane, recallSessionPane, rememberSessionPane } from './session-panes.ts'

/** Argv for `wezterm cli spawn`: a new tab running `req.argv` in `req.cwd`. `--` guards the program's own flags. */
export function weztermSpawnArgv(req: CommandRequest, newWindow = false): string[] {
  return [
    'cli',
    'spawn',
    '--cwd',
    req.cwd,
    ...(newWindow ? ['--new-window'] : []),
    '--',
    ...req.argv,
  ]
}

export function weztermListArgv(): string[] {
  return ['cli', 'list', '--format', 'json']
}

/**
 * `send-text` argv. With `noPaste` the bytes go as typed (used for the Enter);
 * without it the text is a bracketed paste, so embedded newlines stay in the
 * input instead of submitting. Pasted text is not on argv: omitted TEXT is read
 * from stdin, which also keeps a leading `-` from parsing as a flag (the docs
 * show no `--` separator).
 */
export function weztermSendTextArgv(paneId: number, noPaste: boolean, text?: string): string[] {
  return [
    'cli',
    'send-text',
    '--pane-id',
    String(paneId),
    ...(noPaste ? ['--no-paste'] : []),
    ...(text !== undefined ? [text] : []),
  ]
}

/** The pane id `cli spawn` prints on stdout, or null. */
export function parseSpawnedPane(stdout: string): number | null {
  const id = Number(stdout.trim())
  return Number.isInteger(id) && id >= 0 && stdout.trim() !== '' ? id : null
}

/**
 * `<dir>/spawned/<paneId>.json`: one file per pane this host spawned, so two concurrent spawns
 * never overwrite each other's entry.
 */
function spawnedDir(dir: string): string {
  return join(dir, 'spawned')
}

/** A pane this host spawned, with the tty `cli list` showed for it right after the spawn. */
interface SpawnedPane {
  paneId: number
  ttyName: string
}

/** One file of {@link spawnedDir}: its entry (null when unreadable), path and modification time. */
interface SpawnedFile {
  pane: SpawnedPane | null
  path: string
  mtimeMs: number
}

/**
 * The files of panes this host spawned: the only panes `send` types into. Pane ids restart
 * from 0 when the GUI/mux restarts, so an id alone proves nothing; the tty recorded at spawn
 * is the identity (see {@link liveSpawned}).
 */
function readSpawnedFiles(dir: string): SpawnedFile[] {
  let names: string[]
  try {
    names = readdirSync(spawnedDir(dir))
  } catch {
    return []
  }
  const out: SpawnedFile[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const path = join(spawnedDir(dir), name)
    let mtimeMs: number
    try {
      mtimeMs = statSync(path).mtimeMs
    } catch {
      continue
    }
    const data = readJsonOrNull(path)
    const { paneId, ttyName } = isRecord(data) ? data : {}
    const pane =
      Number.isInteger(paneId) && typeof ttyName === 'string' && ttyName !== ''
        ? { paneId: paneId as number, ttyName }
        : null
    out.push({ pane, path, mtimeMs })
  }
  return out
}

/** Records `pane` in its own file. A pane that cannot be remembered is simply never sent to. */
function rememberSpawned(dir: string, pane: SpawnedPane): void {
  try {
    ensureDir(spawnedDir(dir))
    writeJsonAtomic(join(spawnedDir(dir), `${pane.paneId}.json`), pane)
  } catch {
    // Not remembered: never sent to.
  }
}

/** Whether `live` still shows `pane` on the tty recorded when it was spawned. */
function stillSpawned(
  live: readonly Pick<WeztermRow, 'paneId' | 'ttyName'>[],
  pane: SpawnedPane,
): boolean {
  return live.some((r) => r.paneId === pane.paneId && r.ttyName === pane.ttyName)
}

/**
 * How long a file written before a listing is spared from pruning by it: covers coarse file
 * time stamps, so a pane a concurrent `terminal()` recorded after the listing is never pruned.
 */
const PRUNE_GRACE_MS = 5_000

/**
 * The spawned panes `live` (a `cli list` taken at `listedAt`, epoch ms) still shows on their
 * recorded tty. Every other file is deleted (ids are reused after a mux restart and the reused
 * id may be a plain shell), unless it was written after the listing began, less the grace.
 */
function liveSpawned(
  dir: string,
  live: readonly Pick<WeztermRow, 'paneId' | 'ttyName'>[],
  listedAt: number,
): SpawnedPane[] {
  const kept: SpawnedPane[] = []
  for (const f of readSpawnedFiles(dir)) {
    if (f.pane !== null && stillSpawned(live, f.pane)) kept.push(f.pane)
    else if (f.mtimeMs < listedAt - PRUNE_GRACE_MS) {
      try {
        rmSync(f.path, { force: true })
      } catch {
        // Left for a later listing.
      }
    }
  }
  return kept
}

export function weztermActivateArgv(paneId: number): string[] {
  return ['cli', 'activate-pane', '--pane-id', String(paneId)]
}

export function weztermGetTextArgv(paneId: number): string[] {
  return ['cli', 'get-text', '--pane-id', String(paneId)]
}

/** `wezterm cli kill-pane`: kills the pane and what runs in it, without asking. */
export function weztermKillPaneArgv(paneId: number): string[] {
  return ['cli', 'kill-pane', '--pane-id', String(paneId)]
}

/**
 * A path in comparable form: forward slashes, no trailing slash, and
 * case-folded on Windows (case-insensitive file systems).
 */
export function normalizePath(p: string, platform: NodeJS.Platform = process.platform): string {
  let out = p.replace(/\\/g, '/')
  if (out.length > 1) out = out.replace(/\/+$/, '')
  return platform === 'win32' ? out.toLowerCase() : out
}

/**
 * The local path inside a pane's `cwd` field, a `file://` URL
 * (`file://foo/home/wez/`: host `foo`, path `/home/wez/`). On POSIX the host
 * must be empty, `localhost` or this machine's hostname, else null (a remote
 * pane). Percent-encoding is decoded (a malformed escape gives null); on Windows `file:///C:/Users/x` becomes `C:/Users/x` (drive letter
 * kept, leading slash dropped) and `file://server/share/x` a UNC path.
 * Null when the value is not a file URL.
 */
export function weztermCwdPath(
  url: string,
  platform: NodeJS.Platform = process.platform,
  localHost: string = hostname(),
): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'file:') return null
  let path: string
  try {
    path = decodeURIComponent(u.pathname)
  } catch {
    return null
  }
  if (platform !== 'win32') {
    // OSC 7 from an ssh'd pane names the remote machine; its path is not ours.
    const host = u.hostname.toLowerCase()
    const local = localHost.toLowerCase()
    if (host !== '' && host !== 'localhost' && host !== local && host !== local.split('.')[0]) {
      return null
    }
  } else {
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
    else if (u.hostname !== '' && u.hostname !== 'localhost') path = `//${u.hostname}${path}`
  }
  return path
}

interface WeztermPane {
  paneId: number
  cwd: string
  /** The pane's `tty_name` from `cli list`, when it reports one. */
  ttyName?: string
}

interface WeztermRow {
  paneId: number
  /** The local path of the pane's cwd URL; null for a remote pane or an unparseable one. */
  path: string | null
  ttyName?: string
}

/** Every pane in `cli list --format json`; unparseable output yields []. */
export function parseWeztermRows(
  stdout: string,
  platform: NodeJS.Platform = process.platform,
  localHost: string = hostname(),
): WeztermRow[] {
  const data = parseJsonOrNull(stdout)
  if (!Array.isArray(data)) return []
  const out: WeztermRow[] = []
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue
    const {
      pane_id: paneId,
      cwd: url,
      tty_name: tty,
    } = row as { pane_id?: unknown; cwd?: unknown; tty_name?: unknown }
    if (typeof paneId !== 'number' || typeof url !== 'string') continue
    out.push({
      paneId,
      path: weztermCwdPath(url, platform, localHost),
      ...(typeof tty === 'string' && tty !== '' ? { ttyName: tty } : {}),
    })
  }
  return out
}

/** The panes among `rows` whose cwd is `cwd`. */
function panesIn(rows: WeztermRow[], cwd: string, platform: NodeJS.Platform): WeztermPane[] {
  const want = normalizePath(cwd, platform)
  return rows
    .filter((r) => r.path !== null && normalizePath(r.path, platform) === want)
    .map((r) => ({
      paneId: r.paneId,
      cwd,
      ...(r.ttyName !== undefined ? { ttyName: r.ttyName } : {}),
    }))
}

/** Panes from `cli list --format json` whose cwd is `cwd`; unparseable output yields []. */
export function parseWeztermList(
  stdout: string,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
  localHost: string = hostname(),
): WeztermPane[] {
  return panesIn(parseWeztermRows(stdout, platform, localHost), cwd, platform)
}

/**
 * The WezTerm host: drives panes through `wezterm cli` (`wezterm.exe` on Windows), with `wezterm` on PATH
 * and a running GUI or mux server. All platforms. Remembers the pane id of each session under `runtimeDir`/`registryDir` ({@link HostStateOptions}).
 */
export function makeWeztermHost(
  opts: {
    runner?: CommandRunner | undefined
    available?: (() => boolean) | undefined
    /** Defaults to `process.platform`; decides cwd-URL handling and the binary name. */
    platform?: NodeJS.Platform | undefined
    /** This machine's hostname for file-URL cwds (default `os.hostname()`). */
    localHost?: string | undefined
  } & HostStateOptions,
): Host {
  const platform = opts.platform ?? process.platform
  const runner = (): CommandRunner =>
    resolveRunner(platform === 'win32' ? 'wezterm.exe' : 'wezterm', opts.runner)

  const registryDir = registryDirOf('wezterm', opts)

  /** `cli list` output, or null when no GUI/mux answers. */
  const listOutput = (cwd: string): string | null =>
    quietRun(runner(), weztermListArgv(), { cwd, timeoutMs: 10_000 })

  /** A `cli list`: its rows and when it was asked for (epoch ms); null when no GUI/mux answers. */
  const listing = (cwd: string): { rows: WeztermRow[]; at: number } | null => {
    const at = Date.now()
    const out = listOutput(cwd)
    return out === null ? null : { rows: parseWeztermRows(out, platform, opts.localHost), at }
  }

  function panesAt(cwd: string): WeztermPane[] {
    const out = listOutput(cwd)
    return out === null ? [] : parseWeztermList(out, cwd, platform, opts.localHost)
  }

  /** Whether the listing shows pane `id` on the tty this host recorded when it spawned it. */
  const spawnedAndLive = (list: { rows: WeztermRow[]; at: number }, id: number): boolean =>
    liveSpawned(registryDir, list.rows, list.at).some((e) => e.paneId === id)

  /**
   * The pane for `target`. A session id with a remembered pane resolves to that pane if it is
   * still listed on the tty recorded at spawn (wherever its cwd has moved to) and to nothing
   * otherwise: falling back to the cwd would reach another session's pane. Without a remembered
   * pane it is the pane this host spawned at `cwd`, or undefined; `any` falls back to the first
   * pane there. One `cli list`. `remembered` is the bound pane when the caller already read it.
   */
  const paneFor = (
    target: FindQuery,
    any: boolean,
    remembered = boundPane(registryDir, target),
  ): WeztermPane | undefined => {
    if (remembered !== null) {
      const list = listing(target.cwd)
      const id = Number(remembered)
      return list !== null && spawnedAndLive(list, id) ? { paneId: id, cwd: target.cwd } : undefined
    }
    return paneAt(target.cwd, any)
  }

  /**
   * The pane this host spawned at `cwd`, or undefined; `any` falls back to the
   * first pane there. One `cli list`. A registry entry counts only while the
   * live list still shows that pane id on the tty recorded at spawn, since ids
   * are reused after a mux restart and the reused id may be a plain shell;
   * {@link liveSpawned} prunes the stale entries.
   */
  const paneAt = (cwd: string, any: boolean): WeztermPane | undefined => {
    const list = listing(cwd)
    if (list === null) return undefined
    const panes = panesIn(list.rows, cwd, platform)
    const spawned = new Set(liveSpawned(registryDir, list.rows, list.at).map((e) => e.paneId))
    return panes.find((p) => spawned.has(p.paneId)) ?? (any ? panes[0] : undefined)
  }

  const kill = (paneId: number, cwd: string): boolean =>
    quietRun(runner(), weztermKillPaneArgv(paneId), { cwd, timeoutMs: 10_000 }) !== null

  return {
    name: 'wezterm',
    platforms: 'all',
    available() {
      if (opts.available !== undefined) return opts.available()
      return supportsPlatform(this) && onPath('wezterm')
    },
    terminal(req: CommandRequest) {
      const res = runner().run(weztermSpawnArgv(req), { cwd: req.cwd, timeoutMs: 60_000 })
      if (!ran(res)) {
        throw new Error(
          `wezterm cli spawn failed (is a WezTerm window or mux server running?): ${failureText(res)}`,
        )
      }
      // Remember the pane with its tty: `send` types only into panes spawned here
      // (still on that tty), never a plain shell. Without a tty it is not remembered.
      const paneId = parseSpawnedPane(res.stdout)
      if (paneId !== null) {
        const list = listing(req.cwd)
        const ttyName = list?.rows.find((r) => r.paneId === paneId)?.ttyName
        if (ttyName !== undefined) rememberSpawned(registryDir, { paneId, ttyName })
        if (list !== null) liveSpawned(registryDir, list.rows, list.at)
        if (req.sessionId !== undefined) {
          rememberSessionPane(registryDir, req.sessionId, String(paneId), req.cwd)
        }
      }
      return 0
    },
    session: sessionViaTerminal,
    send(req: SendRequest): SendReceipt {
      // No delivery-confirmation signal exists, so ack is always false. The text
      // is a bracketed paste (embedded newlines do not submit) and Enter is a
      // separate `--no-paste` call, as if the key were pressed. Only a pane this
      // host spawned receives text: a plain shell would execute it.
      const pane = paneFor(req, false)
      if (pane === undefined) return { accepted: false, ack: false }
      try {
        const r = runner()
        const text = r.run(weztermSendTextArgv(pane.paneId, false), {
          cwd: req.cwd,
          timeoutMs: 15_000,
          input: req.text,
        })
        if (!ran(text)) return { accepted: false, ack: false }
        const enter = r.run(weztermSendTextArgv(pane.paneId, true, '\r'), {
          cwd: req.cwd,
          timeoutMs: 15_000,
        })
        // The text is in the pane even if Enter failed; do not retype it.
        return ran(enter)
          ? { accepted: true, ack: false }
          : { accepted: true, ack: false, uncertain: true }
      } catch {
        return { accepted: false, ack: false }
      }
    },
    find(query: FindQuery): FoundSession[] {
      // The harness is not discoverable and `cli list` has no output-recency field.
      const remembered = boundPane(registryDir, query)
      const one = remembered === null ? undefined : paneFor(query, true, remembered)
      const panes = remembered === null ? panesAt(query.cwd) : one === undefined ? [] : [one]
      return panes.map((p) => ({
        cwd: query.cwd,
        harness: null,
        alive: true,
        lastOutputAt: null,
        handle: String(p.paneId),
      }))
    },
    focus(query: FindQuery): boolean {
      // activate-pane selects the pane within its tab/window; the docs do not
      // say it raises the OS window, so a backgrounded WezTerm may stay behind.
      const pane = paneFor(query, true)
      if (pane === undefined) return false
      return (
        quietRun(runner(), weztermActivateArgv(pane.paneId), {
          cwd: query.cwd,
          timeoutMs: 10_000,
        }) !== null
      )
    },
    capture(query: FindQuery): string | null {
      const pane = paneFor(query, true)
      if (pane === undefined) return null
      return quietRun(runner(), weztermGetTextArgv(pane.paneId), {
        cwd: query.cwd,
        timeoutMs: 10_000,
      })
    },
    close(query: FindQuery): boolean {
      // Killing is destructive. The pane must be the one remembered for the session, one this
      // host spawned and still on the tty recorded then, and still listed at the cwd it was
      // opened in: after a mux restart WezTerm reissues pane ids, and the old id may now be a
      // person's own shell.
      if (query.sessionId === undefined) {
        const pane = paneFor(query, false)
        return pane !== undefined && kill(pane.paneId, query.cwd)
      }
      const remembered = recallSessionPane(registryDir, query.sessionId)
      if (remembered === null) return false
      const id = Number(remembered.pane)
      const list = listing(query.cwd)
      if (list === null || !spawnedAndLive(list, id)) return false
      const here = panesIn(list.rows, remembered.cwd, platform)
      return here.some((p) => p.paneId === id) && kill(id, query.cwd)
    },
  }
}

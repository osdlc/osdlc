/**
 * The verbs, as functions returning typed results. A tool mounts them under
 * its own `dev` noun with whatever CLI framework it has. `cli.ts` mounts them
 * for a tool that has no framework.
 *
 *   install [--bin-dir]   put a shim for this checkout's launcher onto PATH
 *   link [checkout]       make a checkout the machine-wide one; recorded
 *   use <#n|path|canonical>  switch to a checkout from history, a path, or
 *                         back to the canonical install; recorded
 *   off                   back to the canonical install; recorded
 *   status                what runs now, and every layer's state
 *   history               every checkout ever linked, most recent first
 *
 * Every verb honours `dryRun`: it computes and reports, and writes nothing.
 */

import { existsSync, lstatSync, readFileSync, realpathSync, type Stats } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'

import { atomicWrite } from '@osdlc/etag-write'

import { gitHead } from './git-head.ts'
import {
  cwdCheckout,
  isCheckout,
  resolve,
  samePath,
  suppressed,
  type ResolveOptions,
  type Selection,
} from './resolve.ts'
import {
  appendHistory,
  clearActive,
  historyPath,
  homePath,
  legacyHomePath,
  readActive,
  readHistory,
  writeActive,
  type HistoryEvent,
} from './state.ts'
import { cwdDevVar, cwdLayerActive, entryOf, homeVar, pathNames, type ToolSpec } from './spec.ts'

/**
 * Options shared by the link operations, including a dry-run flag and a clock
 * for tests.
 * @experimental
 */
export interface OpOptions extends ResolveOptions {
  /** Compute and report; write nothing. */
  dryRun?: boolean
  /** Injectable clock for deterministic history in tests. */
  now?: () => Date
}

/**
 * The error the link operations throw when the request cannot be carried out.
 * @experimental
 */
export class DevlinkError extends Error {
  override name = 'DevlinkError'
}

function checkoutOrThrow(spec: ToolSpec, path: string, cwd: string | undefined): string {
  // A relative path is relative to the caller's cwd, which `opts.cwd` may override.
  const abs = resolvePath(cwd ?? process.cwd(), path)
  if (!isCheckout(spec, abs)) {
    const want =
      spec.packageName === undefined
        ? spec.marker
        : `${spec.marker}, or package.json name ${spec.packageName}`
    throw new DevlinkError(`not a ${spec.name} checkout (missing ${want}): ${abs}`)
  }
  return abs
}

function stamp(opts: OpOptions): string {
  return (opts.now ?? (() => new Date()))().toISOString()
}

// ── install ───────────────────────────────────────────────────────────────────

/**
 * `${XDG_BIN_HOME:-$HOME/.local/bin}`, the default install destination. Only
 * an absolute `XDG_BIN_HOME` counts.
 *
 * Not a tiered-dirs home, on purpose. This is a directory on the user's PATH,
 * not a place the tool stores anything. What it must provide is "a shell
 * finds an executable here", which no tiered directory does.
 * @experimental
 */
export function defaultBinDir(env: Record<string, string | undefined> = process.env): string {
  const xdg = env['XDG_BIN_HOME']
  // A relative XDG_BIN_HOME is ignored, as the XDG spec says. An empty or
  // relative HOME falls back to the account's home.
  const home = env['HOME']
  return xdg && isAbsolute(xdg)
    ? xdg
    : join(home && isAbsolute(home) ? home : accountHome(), '.local', 'bin')
}

/** The OS account's home, which no environment variable changes. */
function accountHome(): string {
  try {
    return userInfo().homedir
  } catch {
    return homedir()
  }
}

/**
 * Whether a directory is one of the entries of the `PATH` variable.
 * @experimental
 */
export function isOnPath(
  dir: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env['PATH']
  if (!raw) return false
  const target = resolvePath(dir)
  return raw.split(':').some((d) => d.length > 0 && resolvePath(d) === target)
}

/**
 * The first `name` found on PATH, or null.
 *
 * @experimental
 */
export function findOnPath(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env['PATH']
  if (!raw) return null
  for (const dir of raw.split(':')) {
    if (dir.length === 0) continue
    const candidate = join(dir, name)
    try {
      lstatSync(candidate)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}

/**
 * What `install` did to one shim: `created`, `exists` or `replaced`.
 * @experimental
 */
export type LinkStatus = 'created' | 'exists' | 'replaced'

/**
 * One shim that `install` handled, and whether it was created, left as it was
 * or replaced.
 * @experimental
 */
export interface InstalledLink {
  name: string
  linkPath: string
  status: LinkStatus
}

/**
 * What `install` did: the directory, the launcher, each shim and whether the
 * directory is on the path.
 * @experimental
 */
export interface InstallResult {
  binDir: string
  /** The launcher every shim points at (realpath). */
  target: string
  links: InstalledLink[]
  onPath: boolean
  dryRun: boolean
}

/**
 * Input to `install`: the checkout whose launcher to use, and an optional
 * directory for the shims.
 * @experimental
 */
export interface InstallInput {
  /** The checkout whose launcher to install. Required, because only the caller knows where it runs from. */
  checkout: string
  binDir?: string | undefined
}

/**
 * Put a shim for each of the tool's names on the path, pointing at a
 * checkout's launcher.
 * @experimental
 */
export function install(spec: ToolSpec, input: InstallInput, opts: OpOptions = {}): InstallResult {
  const env = opts.env ?? process.env
  const checkout = checkoutOrThrow(spec, input.checkout, opts.cwd)
  const launcher = join(checkout, spec.launcher)
  let target: string
  try {
    target = realpathSync(launcher)
  } catch {
    throw new DevlinkError(`launcher not found: ${launcher}`)
  }
  const binDir = input.binDir
    ? resolvePath(opts.cwd ?? process.cwd(), input.binDir)
    : defaultBinDir(env)
  const dryRun = opts.dryRun ?? false

  const shim = renderShim(spec, target)
  const links: InstalledLink[] = []
  for (const name of pathNames(spec)) {
    const linkPath = join(binDir, name)
    links.push({ name, linkPath, status: placeShim(linkPath, shim, dryRun) })
  }
  return { binDir, target, links, onPath: isOnPath(binDir, env), dryRun }
}

/** Second line of every shim. `install` and `readShimTarget` recognise a shim by it. */
const SHIM_MARKER = '# devlink-shim v1'

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * The POSIX `sh` file `install` puts on PATH. A real file rather than a
 * symlink, so a deleted checkout gives a clear message, not "No such file".
 * @experimental
 */
export function renderShim(spec: ToolSpec, target: string): string {
  return [
    '#!/bin/sh',
    SHIM_MARKER,
    `target=${shellQuote(target)}`,
    'if [ ! -f "$target" ]; then',
    `  echo "${spec.name}: this shim points at $target, which no longer exists." >&2`,
    `  echo "      Run '${spec.name} dev install' from the checkout to use, to repoint it." >&2`,
    '  exit 1',
    'fi',
    'exec "$target" "$@"',
    '',
  ].join('\n')
}

function parseShimTarget(content: string): string | null {
  const lines = content.split('\n')
  if (lines[1] !== SHIM_MARKER) return null
  const m = /^target='(.*)'$/.exec(lines[2] ?? '')
  return m ? (m[1] as string).replaceAll(`'\\''`, "'") : null
}

/**
 * The launcher the devlink shim at `path` points at, or null when `path` is
 * not a devlink shim.
 *
 * @experimental
 */
export function readShimTarget(path: string): string | null {
  try {
    return parseShimTarget(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function placeShim(linkPath: string, shim: string, dryRun: boolean): LinkStatus {
  let existing: Stats | null = null
  try {
    existing = lstatSync(linkPath)
  } catch {
    existing = null
  }
  const content = existing?.isFile() ? readFileSync(linkPath, 'utf-8') : null
  if (content === shim && existing !== null && (existing.mode & 0o111) !== 0) return 'exists'
  if (existing !== null && !existing.isSymbolicLink() && parseShimTarget(content ?? '') === null) {
    throw new DevlinkError(
      `refusing to overwrite ${linkPath}: not a symlink or a devlink shim — move it aside first`,
    )
  }
  // Atomic, not in place. sh reads a running script as it goes, so an in-place
  // rewrite could break a run already in progress.
  if (!dryRun) atomicWrite(linkPath, shim, { mode: 0o755 })
  return existing === null ? 'created' : 'replaced'
}

// ── link / use / off ──────────────────────────────────────────────────────────

/**
 * What `link` did: the checkout and entry now linked, the previous link and
 * the branch.
 * @experimental
 */
export interface LinkResult {
  checkout: string
  entry: string
  homePath: string
  /** What the link was before, or null. */
  previous: string | null
  branch: string | null
  head: string | null
  wrote: boolean
  dryRun: boolean
}

/**
 * Input to `link`: the checkout to link and an optional label.
 * @experimental
 */
export interface LinkInput {
  /**
   * The checkout to link. Default: the checkout above the cwd, else `self`.
   * A missing default is an error, because there is nothing to link.
   */
  checkout?: string | undefined
  label?: string | undefined
}

function activate(
  spec: ToolSpec,
  event: 'link' | 'use',
  checkout: string,
  label: string | undefined,
  opts: OpOptions,
): LinkResult {
  const dryRun = opts.dryRun ?? false
  const previous = readActive(spec, opts)
  const { branch, head } = gitHead(checkout)
  if (!dryRun) {
    writeActive(spec, checkout, opts)
    const record: HistoryEvent = { at: stamp(opts), event, checkout, branch, head }
    if (label !== undefined) record.label = label
    appendHistory(spec, record, opts)
  }
  return {
    checkout,
    entry: join(checkout, entryOf(spec)),
    homePath: homePath(spec, opts),
    previous,
    branch,
    head,
    wrote: !dryRun,
    dryRun,
  }
}

/**
 * Make a checkout the active link, record it in the history, and report what
 * it replaced.
 * @experimental
 */
export function link(spec: ToolSpec, input: LinkInput = {}, opts: OpOptions = {}): LinkResult {
  let checkout: string
  if (input.checkout !== undefined) {
    checkout = checkoutOrThrow(spec, input.checkout, opts.cwd)
  } else {
    const above = cwdCheckout(spec, opts.cwd ?? process.cwd()) ?? opts.self ?? null
    if (above === null) {
      throw new DevlinkError(
        `no checkout to link: not inside a ${spec.name} checkout — pass a path`,
      )
    }
    checkout = checkoutOrThrow(spec, above, opts.cwd)
  }
  return activate(spec, 'link', checkout, input.label, opts)
}

/**
 * What `off` did: the link it cleared, if any, and whether it wrote anything.
 * @experimental
 */
export interface OffResult {
  homePath: string
  /** The link that was cleared, or null when none was set. */
  previous: string | null
  wrote: boolean
  dryRun: boolean
}

/**
 * Clear the active link so the installed copy runs again.
 * @experimental
 */
export function off(spec: ToolSpec, opts: OpOptions = {}): OffResult {
  const dryRun = opts.dryRun ?? false
  const previous = readActive(spec, opts)
  if (!dryRun) {
    clearActive(spec, opts)
    if (previous !== null) {
      appendHistory(spec, { at: stamp(opts), event: 'off', checkout: null }, opts)
    }
  }
  return { homePath: homePath(spec, opts), previous, wrote: !dryRun, dryRun }
}

/**
 * What `use` did: it either linked a checkout or cleared the link.
 * @experimental
 */
export type UseResult = ({ kind: 'checkout' } & LinkResult) | ({ kind: 'canonical' } & OffResult)

/**
 * Input to `use`: the target, which is a path, a history number or
 * `canonical`, and an optional label.
 * @experimental
 */
export interface UseInput {
  /**
   * `canonical` (or `off`) clears the link. `#n` or a bare integer picks the
   * n-th entry of `history` (1 = most recent). Anything else is a checkout path.
   */
  target: string
  label?: string | undefined
}

/**
 * Select a checkout by path or by history number, or switch the link off with
 * `canonical`.
 * @experimental
 */
export function use(spec: ToolSpec, input: UseInput, opts: OpOptions = {}): UseResult {
  const target = input.target.trim()
  if (target === 'canonical' || target === 'off') {
    return { kind: 'canonical', ...off(spec, opts) }
  }
  const indexMatch = /^#?(\d+)$/.exec(target)
  if (indexMatch !== null) {
    const index = Number(indexMatch[1])
    const entries = history(spec, opts)
    const hit = entries.find((e) => e.index === index)
    if (hit === undefined) {
      throw new DevlinkError(
        entries.length === 0
          ? `history is empty — link a checkout first`
          : `no history entry #${index} (1..${entries.length})`,
      )
    }
    if (!hit.valid) {
      throw new DevlinkError(`history entry #${index} is no longer a checkout: ${hit.checkout}`)
    }
    return { kind: 'checkout', ...activate(spec, 'use', hit.checkout, input.label, opts) }
  }
  return {
    kind: 'checkout',
    ...activate(spec, 'use', checkoutOrThrow(spec, target, opts.cwd), input.label, opts),
  }
}

// ── history ───────────────────────────────────────────────────────────────────

/**
 * One entry of the link history as listed: its number, checkout, whether the
 * checkout is still valid and whether it is the active link.
 * @experimental
 */
export interface HistoryEntry {
  /** 1 = most recently selected. */
  index: number
  checkout: string
  /** True when the directory still carries the marker. */
  valid: boolean
  /** True when this is the link on disk right now. */
  active: boolean
  /** The most recent event that selected it. */
  lastEvent: 'link' | 'use'
  lastAt: string
  /** Recorded at the most recent selection. */
  branch: string | null
  head: string | null
  label: string | null
  /** How many times it has been selected. */
  times: number
}

/**
 * Every checkout ever linked, most recently selected first, one row per path.
 *
 * @experimental
 */
export function history(spec: ToolSpec, opts: OpOptions = {}): HistoryEntry[] {
  const active = readActive(spec, opts)
  const byPath = new Map<string, HistoryEntry>()
  const events = readHistory(spec, opts)
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as HistoryEvent
    if (e.event === 'off' || e.checkout === null) continue
    const key = resolvePath(e.checkout)
    const seen = byPath.get(key)
    if (seen !== undefined) {
      seen.times += 1
      continue
    }
    byPath.set(key, {
      index: byPath.size + 1,
      checkout: e.checkout,
      valid: isCheckout(spec, e.checkout),
      active: active !== null && samePath(active, e.checkout),
      lastEvent: e.event,
      lastAt: e.at,
      branch: e.branch ?? null,
      head: e.head ?? null,
      label: e.label ?? null,
      times: 1,
    })
  }
  return [...byPath.values()]
}

// ── status ────────────────────────────────────────────────────────────────────

/**
 * What `status` reports: the selection and the state of each source that can
 * pick a checkout.
 * @experimental
 */
export interface StatusResult {
  selection: Selection
  env: { var: string; value: string | null }
  /**
   * `suppressed` is true when the cwd layer is off: the spec does not set
   * `cwdLayer`, a suppressor is set, or `<NAME>_CWD_DEV=0`.
   */
  cwd: { var: string; checkout: string | null; suppressed: boolean }
  /**
   * `legacy` is the link file a release before 0.8 wrote on macOS, when it is
   * there and the current one is not; null otherwise.
   */
  link: {
    path: string
    value: string | null
    valid: boolean
    suppressed: boolean
    legacy: string | null
  }
  /** The launcher's own checkout, when it has one. */
  self: string | null
  history: { path: string; entries: number }
  path: { names: Array<{ name: string; found: string | null }> }
  /** The first PATH match for `spec.name` when it is a devlink shim, else null. */
  shim: ShimStatus | null
}

/**
 * The state of one shim on the path: where it points, whether the target
 * exists and which checkout holds it.
 * @experimental
 */
export interface ShimStatus {
  path: string
  /** The launcher the shim runs. */
  target: string
  targetExists: boolean
  /** The checkout holding `target`. */
  checkout: string
  /** Short HEAD sha, or null when the checkout is gone or has no commit. */
  head: string | null
}

function shimStatus(spec: ToolSpec, path: string | null): ShimStatus | null {
  const target = path === null ? null : readShimTarget(path)
  if (path === null || target === null) return null
  const checkout = resolvePath(target, ...spec.launcher.split('/').map(() => '..'))
  const targetExists = existsSync(target)
  return {
    path,
    target,
    targetExists,
    checkout,
    head: targetExists ? gitHead(checkout).head : null,
  }
}

/**
 * Report which checkout would run now and why, with the state of the
 * environment variable, the working directory, the link and the shims.
 * @experimental
 */
export function status(spec: ToolSpec, opts: OpOptions = {}): StatusResult {
  const env = opts.env ?? process.env
  const cwd = opts.cwd ?? process.cwd()
  const isSuppressed = suppressed(spec, env)
  const linked = readActive(spec, opts)
  const names = pathNames(spec).map((name) => ({ name, found: findOnPath(name, env) }))
  return {
    selection: resolve(spec, opts),
    env: { var: homeVar(spec), value: env[homeVar(spec)] ?? null },
    cwd: {
      var: cwdDevVar(spec),
      checkout: cwdCheckout(spec, cwd),
      suppressed: !cwdLayerActive(spec, env, isSuppressed),
    },
    link: {
      path: homePath(spec, opts),
      value: linked,
      valid: linked !== null && isCheckout(spec, linked),
      suppressed: isSuppressed,
      legacy: legacyHomePath(spec, opts),
    },
    self: opts.self ?? null,
    history: { path: historyPath(spec, opts), entries: history(spec, opts).length },
    path: { names },
    shim: shimStatus(spec, names[0]?.found ?? null),
  }
}

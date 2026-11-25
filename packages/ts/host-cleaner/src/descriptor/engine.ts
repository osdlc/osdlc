/**
 * Descriptor to plugin (tier 1): {@link descriptorPlugin} turns a parsed
 * descriptor into a `definePlugin` value built only on the plugin kit, with
 * the same hooks a code plugin has.
 *
 * - detect: `detect`'s `onPath` and `exists`, or any of its folders existing.
 *   A `system: true` descriptor never applies ({@link skipReason}), nor one
 *   whose `supersededBy` plugin runs.
 * - roots: each of its `paths` for this OS that passes {@link pathProblem},
 *   as a self root (`{ path, self: true }`): a candidate may be the whole
 *   folder, so `~/.npm`'s root is `~/.npm` itself, and `delete` checks the
 *   folder again.
 * - discover: one candidate per folder, or per `glob` match inside it, and
 *   `project` build folders in the targets' checkouts. Each is
 *   `<name>:<path>`. Glob matches past `maxEntries` are combined into one ref
 *   candidate, `<name>:<folder>/<glob>:rest`, that removes each of them. A
 *   folder the checks refuse is listed, unmeasured, and refused
 *   `outside-roots`.
 * - object: only its own candidates: `inUse` refuses them `in-use`, a prune
 *   with no tool on PATH gets a `no-prune-tool` protest (D12), and a live
 *   process in a checkout refuses its build folders.
 * - delete: checks the candidate again, then runs the tool's command from the
 *   home folder, pointed at the checked folder (D13), or removes the folder
 *   with `kit.remove`.
 *
 * Idle time and size stay out of the evidence, as for `cargo` and `node`:
 * either may be unmeasured in one survey and measured in the next.
 */

import { lstatSync, readdirSync, realpathSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'

import { globRegExp } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import { checkoutsOf, hoursText, present, type Checkout } from '../artifacts.ts'
import { hostDirs } from '../config.ts'
import { DEFAULT_IDLE_HOURS, idleHoursSetting, type Idle, type Kit } from '../kit.ts'
import { containedIn, linkedCheckouts, realOr, rootProblem } from '../roots.ts'
import { DELETE_LIMIT_MS, OUTSIDE_ROOTS } from '../run.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Ctx,
  type MaybePromise,
  type Objection,
  type Plugin,
  type PluginDefinition,
  type Root,
} from '../types.ts'
import {
  DEFAULT_MAX_ENTRIES,
  type Descriptor,
  type DescriptorCandidate,
  type Os,
  type ProjectEntry,
} from './schema.ts'

/** The protest on a prune whose program is not on PATH; `--allow no-prune-tool` removes the folder instead (D12). */
export const NO_PRUNE_TOOL = 'no-prune-tool'

/** The refusal while an `inUse` process runs or lock exists. */
export const IN_USE = 'in-use'

/** How long a descriptor's `discover` may take: it measures every folder, and walks the checkouts for `project`. */
const DISCOVER_LIMIT_MS = 10 * 60_000

/** Folders never walked into when looking for `project` build folders. */
const NOT_WALKED = new Set(['.git', 'node_modules', 'target'])

export interface DescriptorOptions {
  /** The OS whose `paths` apply. Default: this one. */
  os?: Os | undefined
  /**
   * Whether the code plugin `plugin` runs this time: detected, enabled and not
   * skipped. A descriptor whose `supersededBy` runs doesn't. Default: none
   * does; the loader that builds the run's plugin list answers it.
   */
  runs?: ((plugin: string, ctx: Ctx) => MaybePromise<boolean>) | undefined
  /** host-cleaner's own folders, which no path may contain. Default: `hostDirs(env)`. */
  ownDirs?: readonly string[] | undefined
}

/** The OS `platform` (as `process.platform` names it) is, for `paths`. */
export const osOf = (platform: string): Os =>
  platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux'

/** Why the descriptor never runs, for a note; undefined when it may. */
export function skipReason(d: Descriptor): string | undefined {
  return d.system === true
    ? 'skipped: it describes data that needs root (system: true), which host-cleaner does not clean'
    : undefined
}

const isLink = (path: string): boolean =>
  lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true

/** Whether `inner` is `outer` or below it, by real paths. */
const within = (outer: string, inner: string): boolean => {
  const rel = relative(realOr(outer), realOr(inner))
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

/**
 * `folder` with `~` read as `home`, and no trailing separator: `lstat` follows
 * a link written as `link/`, so every symlink check would miss it.
 */
const expand = (folder: string, home: string): string => {
  const path =
    folder === '~' ? home : /^~[/\\]/.test(folder) ? join(home, folder.slice(2)) : normalize(folder)
  const bare = path.replace(/[/\\]+$/, '')
  return bare === '' || /^[A-Za-z]:$/.test(bare) ? path : bare
}

/**
 * Why `path`, one of a descriptor's folders, may not be cleaned, or null when
 * it may. It must pass the core's check of a self root ({@link rootProblem}),
 * sit strictly inside `home`, and neither hold nor sit inside host-cleaner's
 * own folders. Judged on the path as given and on its real path, as the
 * filesystem spells it.
 */
export function pathProblem(
  path: string,
  at: {
    home: string
    targets: readonly string[]
    checkouts: readonly string[]
    ownDirs: readonly string[]
  },
): string | null {
  const root = rootProblem(path, { ...at, linked: at.checkouts }, true)
  if (root !== null) return root
  if (containedIn([at.home], path) === null) return 'it is not inside the home folder'
  for (const own of at.ownDirs) {
    if (within(path, own)) return `it holds host-cleaner's own folder ${own}`
    if (within(own, path)) return `it is inside host-cleaner's own folder ${own}`
  }
  return null
}

/**
 * The folders of `checkout` that a `project` walk covers: all of a linked
 * worktree, but of a primary checkout only the targets inside it, since a
 * target inside a repository holds only what is inside the target.
 */
function walkedIn(checkout: Checkout, targets: readonly string[]): string[] {
  if (!checkout.primary || targets.some((t) => within(t, checkout.path))) return [checkout.path]
  return targets.filter((t) => within(checkout.path, t))
}

/**
 * Whether `path`, below `folder`, is a match of `glob` there by the rules of
 * {@link globMatches}, reading only the entries on its way.
 */
function isGlobMatch(folder: string, glob: string, path: string): boolean {
  const foldersOnly = /[/\\]$/.test(glob)
  const parts = glob.split(/[/\\]/).filter((p) => p !== '' && p !== '.')
  const rel = relative(folder, path)
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return false
  const names = rel.split(sep)
  if (names.length !== parts.length) return false
  let at = folder
  for (const [i, n] of names.entries()) {
    if (!globRegExp(parts[i]!).test(n)) return false
    at = join(at, n)
    const stat = lstatSync(at, { throwIfNoEntry: false })
    if (stat === undefined || stat.isSymbolicLink()) return false
    if ((i < names.length - 1 || foldersOnly) && !stat.isDirectory()) return false
  }
  return true
}

/**
 * The entries under `folder` that `glob` matches, sorted. Each `/`-separated
 * part matches one level; a trailing `/` takes folders only. Links are
 * neither matched nor walked through.
 */
export function globMatches(folder: string, glob: string): string[] {
  const foldersOnly = /[/\\]$/.test(glob)
  const parts = glob.split(/[/\\]/).filter((p) => p !== '' && p !== '.')
  let level = [folder]
  for (const [i, part] of parts.entries()) {
    const re = globRegExp(part)
    const last = i === parts.length - 1
    const next: string[] = []
    for (const dir of level) {
      let entries: Dirent[]
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const e of entries) {
        if (!re.test(e.name) || e.isSymbolicLink()) continue
        if ((!last || foldersOnly) && !e.isDirectory()) continue
        next.push(join(dir, e.name))
      }
    }
    level = next
  }
  return level.sort()
}

/** How a candidate is deleted: by the tool's command, or by removing the folder. */
type Action = 'command' | 'remove'

/**
 * What a candidate's evidence holds: its folder, and the `candidates` entry it
 * came from and how it is deleted, or the `project` entry and its checkout.
 */
type Evidence = {
  path: string
  /** For the candidate of the glob matches past `maxEntries`: each of them. */
  rest?: string[]
  candidate?: number
  action?: Action
  project?: number
  checkout?: string
}

/** One candidate and what its owner objects to. */
interface Row {
  candidate: Candidate
  objections: Array<Pick<Objection, 'level' | 'code' | 'reason'>>
  /** For `project` rows: the checkout whose processes refuse it. */
  checkout?: string
}

/** The plugin for the descriptor `d`, named `name` (its file name). Settings: `idleHours`. */
export function descriptorPlugin(
  name: string,
  d: Descriptor,
  opts: DescriptorOptions = {},
): PluginDefinition<z.ZodObject<{ idleHours: typeof idleHoursSetting }>> {
  return definePlugin({
    name,
    api: PLUGIN_API,
    settings: z.strictObject({ idleHours: idleHoursSetting }),
    create: ({ settings, kit, env }) =>
      engine(name, d, kit, {
        home: env.HOME ?? homedir(),
        os: opts.os ?? osOf(process.platform),
        idleHours: settings.idleHours ?? DEFAULT_IDLE_HOURS,
        runs: opts.runs,
        ownDirs: opts.ownDirs ?? ownDirsOf(env),
      }),
  })
}

/** host-cleaner's own folders for `env`, or why they could not be found: then no path passes. */
const ownDirsOf = (env: Readonly<Record<string, string | undefined>>): string[] | Error => {
  try {
    const dirs = hostDirs({ ...env })
    return [dirs.config, dirs.state, dirs.logs]
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
}

interface EngineAt {
  home: string
  os: Os
  idleHours: number
  runs: DescriptorOptions['runs']
  ownDirs: readonly string[] | Error
}

function engine(name: string, d: Descriptor, kit: Kit, at: EngineAt): Plugin {
  // The folders that apply on this OS, by their name in `paths`.
  const folders = new Map<string, string>()
  for (const [key, perOs] of Object.entries(d.paths)) {
    const folder = perOs.all ?? perOs[at.os]
    if (folder !== undefined) folders.set(key, expand(folder, at.home))
  }

  const problems = (ctx: Ctx) => {
    const out = new Map<string, string | null>()
    const own = at.ownDirs
    if (own instanceof Error) {
      for (const key of folders.keys()) {
        out.set(key, `host-cleaner's own folders could not be found: ${own.message}`)
      }
      return out
    }
    const where = {
      home: at.home,
      targets: ctx.targets,
      checkouts: linkedCheckouts(ctx.targets),
      ownDirs: own,
    }
    for (const [key, folder] of folders) out.set(key, pathProblem(folder, where))
    return out
  }

  /** The checkouts of the targets' repositories, primary first, ignored ones left out. */
  const checkoutsNow = (ctx: Ctx): Checkout[] =>
    checkoutsOf({ kit, git: undefined, idleHours: at.idleHours, ctx })

  /** How long `path` has sat unchanged: a folder by everything in it, a file (a glob may match one) by itself. */
  const idleOf = (path: string): Idle => {
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (stat === undefined || stat.isDirectory()) return kit.idle(path)
    const own = basename(path)
    return kit.idle(dirname(path), { skip: (n) => n !== own })
  }

  const thresholdOf = (entry: { idleHours?: number | undefined }): number =>
    entry.idleHours ?? at.idleHours

  const actionOf = (entry: DescriptorCandidate): Action =>
    entry.command !== undefined && kit.onPath(entry.command[0]!) ? 'command' : 'remove'

  /** One folder's row: a whole folder, or one glob match. */
  const folderRow = (
    entry: DescriptorCandidate,
    index: number,
    path: string,
    action: Action,
  ): Row | null => {
    const prune = entry.command !== undefined && entry.removes === 'unused'
    const program = entry.command?.[0]
    const objections: Row['objections'] = []
    if (prune && action === 'remove') {
      objections.push({
        level: 'protest',
        code: NO_PRUNE_TOOL,
        reason: `${program} is not on PATH to prune it; --allow ${NO_PRUNE_TOOL} removes the whole folder instead`,
      })
    }
    const evidence: Evidence = { path, candidate: index, action }
    const base = { kind: name, path, costDescription: entry.costDescription, evidence }
    if (prune && action === 'command') {
      // A prune removes only what nothing uses: no idle check.
      const bytes = kit.size(path)
      return {
        objections,
        candidate: kit.candidate({
          ...base,
          why: `${entry.command!.join(' ')} removes only what nothing uses`,
          ...(bytes === null ? {} : { bytes }),
          ...(entry.held === true ? { held: true } : {}),
        }),
      }
    }
    let idle
    try {
      idle = idleOf(path)
    } catch {
      // A folder that cannot be read may hide recent changes: no row.
      return null
    }
    const threshold = thresholdOf(entry)
    const how =
      action === 'command' ? `${entry.command!.join(' ')} empties it` : 'removed as a folder'
    if (idle.unmeasured) {
      return {
        objections,
        candidate: kit.candidate({
          ...base,
          why: `when it last changed could not be measured in the time budget; ${how}`,
          unmeasured: true,
          ...(entry.held === true ? { held: true } : {}),
        }),
      }
    }
    const idleNow = idle.hours === null || idle.hours >= threshold
    const bytes = kit.size(path)
    const since =
      idle.hours === null
        ? 'it holds no file'
        : `${idleNow ? 'nothing changed in it for' : 'it changed'} ${hoursText(idle.hours)} hours${idleNow ? '' : ' ago'} (threshold ${threshold})`
    return {
      objections,
      candidate: kit.candidate({
        ...base,
        why: `${since}; ${how}`,
        ...(bytes === null ? {} : { bytes }),
        ...(entry.held === true || !idleNow ? { held: true } : {}),
      }),
    }
  }

  /** Build folders beside a marker under `walk`, in `checkout`, for every `project` entry in one walk. */
  const projectRows = (checkout: string, walk: string): Row[] => {
    const entries = (d.project ?? []).map((entry, index) => ({
      entry,
      index,
      marker: globRegExp(entry.marker),
    }))
    const rows: Row[] = []
    const visit = (dir: string): void => {
      let found: Dirent[]
      try {
        found = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      const files = found.filter((e) => !e.isDirectory()).map((e) => e.name)
      const here = entries.filter((p) => files.some((f) => p.marker.test(f)))
      for (const e of found) {
        if (!e.isDirectory() || e.isSymbolicLink()) continue
        const path = join(dir, e.name)
        const builds = here.filter((p) => p.entry.dir === e.name)
        for (const p of builds) {
          const row = projectRow(p.entry, p.index, checkout, path)
          if (row !== null) rows.push(row)
        }
        if (builds.length === 0 && !NOT_WALKED.has(e.name) && !e.name.startsWith('.')) visit(path)
      }
    }
    if (entries.length > 0) visit(walk)
    // In `project` order, as one walk per entry listed them.
    const order = (r: Row): number => (r.candidate.evidence as Evidence).project ?? 0
    return rows.sort((x, y) => order(x) - order(y))
  }

  const projectRow = (
    entry: ProjectEntry,
    index: number,
    checkout: string,
    path: string,
  ): Row | null => {
    if (containedIn([checkout], path) === null) return null
    let idle
    try {
      idle = kit.idle(path)
    } catch {
      return null
    }
    const threshold = thresholdOf(entry)
    const evidence: Evidence = { path, project: index, checkout }
    if (idle.unmeasured) {
      return {
        checkout,
        objections: [],
        candidate: kit.candidate({
          kind: name,
          path,
          why: `a ${entry.marker} build folder whose last change could not be measured in the time budget`,
          costDescription: entry.costDescription,
          unmeasured: true,
          evidence,
        }),
      }
    }
    const idleNow = idle.hours === null || idle.hours >= threshold
    const bytes = kit.size(path)
    return {
      checkout,
      objections: [],
      candidate: kit.candidate({
        kind: name,
        path,
        why:
          idle.hours === null
            ? `a ${entry.marker} build folder that holds no file`
            : `a ${entry.marker} build folder ${idleNow ? 'unchanged for' : 'changed'} ${hoursText(idle.hours)} hours${idleNow ? '' : ' ago'} (threshold ${threshold})`,
        costDescription: entry.costDescription,
        ...(bytes === null ? {} : { bytes }),
        ...(idleNow ? {} : { held: true }),
        evidence,
      }),
    }
  }

  /** Every row now: past a glob's `maxEntries`, the rest as one row. */
  const rowsNow = (ctx: Ctx): Row[] => {
    const refused = problems(ctx)
    const rows: Row[] = []
    for (const [index, entry] of d.candidates.entries()) {
      const folder = folders.get(entry.path)
      if (folder === undefined || !present(folder)) continue
      const action = actionOf(entry)
      const problem = refused.get(entry.path) ?? null
      if (problem !== null) {
        // Listed so `status` says why, but nothing under it is measured.
        rows.push({
          objections: [{ level: 'refuse', code: OUTSIDE_ROOTS, reason: `${folder}: ${problem}` }],
          candidate: kit.candidate({
            kind: name,
            path: folder,
            why: `refused: ${problem}`,
            costDescription: entry.costDescription,
            held: true,
            evidence: { path: folder, candidate: index, action },
          }),
        })
        continue
      }
      if (entry.glob === undefined) {
        const row = folderRow(entry, index, folder, action)
        if (row !== null) rows.push(row)
        continue
      }
      const matches = globMatches(folder, entry.glob).filter(
        (match) => containedIn([folder], match) !== null,
      )
      const max = entry.maxEntries ?? DEFAULT_MAX_ENTRIES
      for (const match of matches.slice(0, max)) {
        const row = folderRow(entry, index, match, action)
        if (row !== null) rows.push(row)
      }
      if (matches.length > max) {
        const row = restRow(entry, index, folder, matches.slice(max), action)
        if (row !== null) rows.push(row)
      }
    }
    if ((d.project ?? []).length > 0) {
      for (const checkout of checkoutsNow(ctx)) {
        for (const walk of walkedIn(checkout, ctx.targets)) {
          rows.push(...projectRows(checkout.path, walk))
        }
      }
    }
    return rows
  }

  /**
   * The glob matches past `maxEntries`, combined into one ref candidate that
   * removes each of them. Held when any of them changed within the threshold;
   * one that cannot be read is left out, as its own row would be.
   */
  const restRow = (
    entry: DescriptorCandidate,
    index: number,
    folder: string,
    matches: readonly string[],
    action: Action,
  ): Row | null => {
    const threshold = thresholdOf(entry)
    const rest: string[] = []
    let changed = 0
    let unmeasured = false
    let bytes: number | null = 0
    for (const match of matches) {
      let idle
      try {
        idle = idleOf(match)
      } catch {
        continue
      }
      rest.push(match)
      if (idle.unmeasured) unmeasured = true
      else if (idle.hours !== null && idle.hours < threshold) changed++
      const size = kit.size(match)
      bytes = bytes === null || size === null ? null : bytes + size
    }
    if (rest.length === 0) return null
    const since = unmeasured
      ? 'when some last changed could not be measured in the time budget'
      : changed === 0
        ? `none changed in ${threshold} hours`
        : `${changed} changed in the last ${threshold} hours`
    const evidence: Evidence = { path: folder, rest, candidate: index, action }
    return {
      objections: [],
      candidate: kit.candidate({
        kind: name,
        ref: `${join(folder, entry.glob!)}:rest`,
        at: folder,
        why: `${rest.length} matches of ${entry.glob} past the first ${entry.maxEntries ?? DEFAULT_MAX_ENTRIES}, as one; ${since}; each removed as a folder`,
        costDescription: entry.costDescription,
        evidence,
        ...(bytes === null ? {} : { bytes }),
        ...(unmeasured ? { unmeasured: true } : {}),
        ...(entry.held === true || changed > 0 ? { held: true } : {}),
      }),
    }
  }

  const unreadable = (why: string): Row['objections'][number] => ({
    level: 'refuse',
    code: 'process-table-unreadable',
    reason: `process table unreadable: ${why}`,
  })

  /** The `inUse` objections now: a running process or a lock file refuses every candidate. */
  const inUseNow = (ctx: Ctx): Row['objections'] => {
    const out: Row['objections'] = []
    for (const program of d.inUse?.processes ?? []) {
      const found = kit.running(program, ctx)
      if (found.names.length > 0) {
        out.push({ level: 'refuse', code: IN_USE, reason: `running: ${found.names.join(', ')}` })
      }
      if (found.unknown !== undefined) {
        out.push(unreadable(found.unknown))
        break
      }
    }
    for (const lock of d.inUse?.locks ?? []) {
      const file = expand(lock, at.home)
      if (present(file))
        out.push({ level: 'refuse', code: IN_USE, reason: `the lock ${file} exists` })
    }
    return out
  }

  /** What blocks deleting a `project` row now: a busy process in its checkout. */
  const liveIn = (checkout: string, ctx: Ctx): Row['objections'] => {
    const held = kit.running({ in: checkout }, ctx)
    const out: Row['objections'] = []
    if (held.names.length > 0) {
      out.push({
        level: 'refuse',
        code: 'live-process',
        reason: `running in the checkout: ${held.names.join(', ')}`,
      })
    }
    if (held.unknown !== undefined) out.push(unreadable(held.unknown))
    return out
  }

  /** Each folder that passes the checks: the plugin's roots, each a self root. */
  const rootPaths = (refused: Map<string, string | null>): string[] => {
    const out = new Set<string>()
    for (const [key, folder] of folders) if (refused.get(key) === null) out.add(folder)
    return [...out]
  }

  /** Whether `dir` holds an entry, not a folder, that `marker` matches. */
  const marked = (dir: string, marker: string): boolean => {
    const re = globRegExp(marker)
    try {
      return readdirSync(dir, { withFileTypes: true }).some(
        (e) => !e.isDirectory() && re.test(e.name),
      )
    } catch {
      return false
    }
  }

  /**
   * Why the candidate at `path` with evidence `ev` may not be deleted now, or
   * null: the entry that gave it must still give it, under the same checks
   * and deleted the same way, and nothing in `inUse`, or for a build folder
   * in its checkout, may be running.
   */
  const refusal = (ev: Evidence, path: string, ctx: Ctx): string | null => {
    const live: Row['objections'] = []
    if (ev.project !== undefined) {
      const entry = d.project?.[ev.project]
      const checkout = ev.checkout
      if (entry === undefined || checkout === undefined) return 'no project entry gives it now'
      const now = checkoutsNow(ctx).find((c) => c.path === checkout)
      if (now === undefined) return `${checkout} is not a checkout of the targets`
      if (containedIn(walkedIn(now, ctx.targets), path) === null) {
        return `it is not inside ${checkout} and the targets`
      }
      if (basename(path) !== entry.dir || !marked(dirname(path), entry.marker)) {
        return `it is no longer a ${entry.dir} folder beside ${entry.marker}`
      }
      live.push(...liveIn(checkout, ctx))
    } else {
      const refused = problems(ctx)
      const now = rootPaths(refused)
      const paths = ev.rest ?? [path]
      for (const p of paths) {
        if (!now.some((r) => realOr(r) === realOr(p)) && containedIn(now, p) === null) {
          return `${p} is not inside ${name}'s roots`
        }
      }
      const entry = d.candidates[ev.candidate ?? -1]
      const folder = entry === undefined ? undefined : folders.get(entry.path)
      if (entry === undefined || folder === undefined) return 'no candidate entry gives it now'
      const problem = refused.get(entry.path) ?? null
      if (problem !== null) return problem
      for (const p of paths) {
        if (entry.glob === undefined ? p !== folder : !isGlobMatch(folder, entry.glob, p)) {
          return `${p} is no longer ${entry.glob === undefined ? folder : `a match of ${entry.glob} in ${folder}`}`
        }
      }
      if (actionOf(entry) !== ev.action) return 'how it would be deleted changed since the plan'
    }
    const busy = [...inUseNow(ctx), ...live]
    return busy.length === 0 ? null : busy.map((b) => b.reason).join('; ')
  }

  let rows = new Map<string, Row>()

  return {
    name,
    limits: { discover: DISCOVER_LIMIT_MS },
    async detect(ctx) {
      const skip = skipReason(d)
      if (skip !== undefined) return { active: false, note: skip }
      if (d.supersededBy !== undefined && (await at.runs?.(d.supersededBy, ctx)) === true) {
        return { active: false, note: `skipped: the plugin ${d.supersededBy} runs instead` }
      }
      const holds = (c: { onPath?: string | undefined; exists?: string | undefined }): boolean => {
        if (c.onPath !== undefined) return kit.onPath(c.onPath)
        const folder = c.exists === undefined ? undefined : folders.get(c.exists)
        return folder !== undefined && present(folder)
      }
      if (d.detect?.all !== undefined) return d.detect.all.every(holds)
      if (d.detect?.any !== undefined) return d.detect.any.some(holds)
      return [...folders.values()].some(present)
    },
    roots: (ctx): Root[] => rootPaths(problems(ctx)).map((path) => ({ path, self: true })),
    discover(ctx) {
      rows = new Map(rowsNow(ctx).map((r) => [r.candidate.id, r]))
      return [...rows.values()].map((r) => r.candidate)
    },
    object(all, ctx) {
      const mine = all.filter((c) => c.owner === name && rows.has(c.id))
      if (mine.length === 0) return []
      const inUse = inUseNow(ctx)
      const live = new Map<string, Row['objections']>()
      return mine.flatMap((c) => {
        const row = rows.get(c.id)!
        let extra = inUse
        if (row.checkout !== undefined) {
          if (!live.has(row.checkout)) live.set(row.checkout, liveIn(row.checkout, ctx))
          extra = [...inUse, ...live.get(row.checkout)!]
        }
        return [...row.objections, ...extra].map((o) => ({ ...o, by: name, candidate: c.id }))
      })
    },
    async delete(c, ctx) {
      const ev = c.evidence as Evidence
      if (c.ref !== undefined && Array.isArray(ev.rest)) {
        const left = ev.rest.filter(present)
        if (left.length === 0) return `already gone: every match in ${c.ref}`
        const link = left.find(isLink)
        if (link !== undefined) throw new Error(`${link} is now a symlink; it is not followed`)
        const why = refusal({ ...ev, rest: left }, ev.path, ctx)
        if (why !== null) throw new Error(`${c.ref} was not deleted: ${why}`)
        return left.map((p) => kit.remove(p, ctx)).join('; ')
      }
      const path = c.path
      if (path === undefined) throw new Error(`${c.id} is not a folder`)
      if (isLink(path)) throw new Error(`${path} is now a symlink; it is not followed`)
      if (!present(path)) return `already gone: ${path}`
      const why = refusal(ev, path, ctx)
      if (why !== null) throw new Error(`${path} was not deleted: ${why}`)
      if (ev.action === 'command') {
        return runCommand(kit, d.candidates[ev.candidate!]!, path, at.home, ctx)
      }
      return kit.remove(path, ctx)
    },
  }
}

const bytesText = (n: number | null): string => (n === null ? 'an unknown size' : `${n} bytes`)

/** Runs `entry`'s command from `home`, `{path}` read as `path`'s real path in every argument and `env` value. */
async function runCommand(
  kit: Kit,
  entry: DescriptorCandidate,
  path: string,
  home: string,
  ctx: Ctx,
): Promise<string> {
  const real = realpathSync(path)
  const fill = (text: string): string => text.replaceAll('{path}', real)
  const argv = entry.command!.map(fill)
  const env = Object.fromEntries(Object.entries(entry.env ?? {}).map(([k, v]) => [k, fill(v)]))
  const before = kit.size(real)
  const r = await kit.run(argv, { signal: ctx.signal, cwd: home, env, timeoutMs: DELETE_LIMIT_MS })
  if (!r.ok) {
    const said = (r.stderr || r.stdout).trim().split('\n')[0] ?? ''
    throw new Error(
      `${argv.join(' ')} failed (${r.neverExited === true ? 'did not run' : `exit ${r.exitCode}`})${said === '' ? '' : `: ${said}`}`,
    )
  }
  return `ran ${argv.join(' ')}; ${bytesText(before)} before, ${bytesText(kit.size(real))} after`
}

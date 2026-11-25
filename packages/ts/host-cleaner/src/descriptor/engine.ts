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
 *   `<name>:<path>`. A folder the checks refuse is listed, held, and refused
 *   `outside-roots`, with nothing under it measured.
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

import { readdirSync, realpathSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, normalize } from 'node:path'

import { globRegExp } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'
import { z } from 'zod'

import { hoursText, present } from '../artifacts.ts'
import { hostDirs } from '../config.ts'
import { DEFAULT_IDLE_HOURS, idleHoursSetting, type Kit } from '../kit.ts'
import { containedIn, isLink, realOr, rootProblem, within } from '../roots.ts'
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

/** `folder` with `~` read as `home`. */
const expand = (folder: string, home: string): string =>
  folder === '~' ? home : /^~[/\\]/.test(folder) ? join(home, folder.slice(2)) : normalize(folder)

/**
 * Why `path`, one of a descriptor's folders, may not be cleaned, or null when
 * it may. It must pass {@link rootProblem} as a self root, with the targets'
 * checkouts as linked worktrees, sit strictly inside `home`, and neither hold
 * nor sit in host-cleaner's own folders. Judged on the path as given and on
 * its real path.
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

/** The checkouts of the repositories among `targets`, as `git worktree list` gives them; bare and missing ones left out. */
function checkoutsIn(targets: readonly string[]): string[] {
  const out = new Set<string>()
  for (const target of targets) {
    try {
      for (const tree of new Git(target).worktrees()) {
        if (!tree.bare && present(tree.path)) out.add(tree.path)
      }
    } catch {
      // not a repository
    }
  }
  return [...out]
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

const ownDirsOf = (env: Readonly<Record<string, string | undefined>>): string[] => {
  try {
    const dirs = hostDirs({ ...env })
    return [dirs.config, dirs.state, dirs.logs]
  } catch {
    return []
  }
}

interface EngineAt {
  home: string
  os: Os
  idleHours: number
  runs: DescriptorOptions['runs']
  ownDirs: readonly string[]
}

function engine(name: string, d: Descriptor, kit: Kit, at: EngineAt): Plugin {
  // The folders that apply on this OS, by their name in `paths`.
  const folders = new Map<string, string>()
  for (const [key, perOs] of Object.entries(d.paths)) {
    const folder = perOs.all ?? perOs[at.os]
    if (folder !== undefined) folders.set(key, expand(folder, at.home))
  }

  const problems = (ctx: Ctx) => {
    const where = { ...at, targets: ctx.targets, checkouts: checkoutsIn(ctx.targets) }
    const out = new Map<string, string | null>()
    for (const [key, folder] of folders) out.set(key, pathProblem(folder, where))
    return out
  }

  const thresholdOf = (entry: { idleHours?: number | undefined }): number =>
    entry.idleHours ?? at.idleHours

  const actionOf = (entry: DescriptorCandidate): Action =>
    entry.command !== undefined && kit.onPath(entry.command[0]!) ? 'command' : 'remove'

  /** One folder's row: a whole folder, or one glob match; `action` is `actionOf(entry)`. */
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
    if (prune && action === 'command') {
      const bytes = kit.size(path)
      return {
        objections,
        candidate: kit.candidate({
          kind: name,
          path,
          why: `${entry.command!.join(' ')} removes only what nothing uses`,
          costDescription: entry.costDescription,
          ...(bytes === null ? {} : { bytes }),
          ...(entry.held === true ? { held: true } : {}),
          evidence,
        }),
      }
    }
    let idle
    try {
      idle = kit.idle(path)
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
          kind: name,
          path,
          why: `when it last changed could not be measured in the time budget; ${how}`,
          costDescription: entry.costDescription,
          unmeasured: true,
          ...(entry.held === true ? { held: true } : {}),
          evidence,
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
        kind: name,
        path,
        why: `${since}; ${how}`,
        costDescription: entry.costDescription,
        ...(bytes === null ? {} : { bytes }),
        ...(entry.held === true || !idleNow ? { held: true } : {}),
        evidence,
      }),
    }
  }

  /** Build folders beside a marker in `checkout`, for `project` entry `entry`. */
  const projectRows = (entry: ProjectEntry, index: number, checkout: string): Row[] => {
    const marker = globRegExp(entry.marker)
    const rows: Row[] = []
    const visit = (dir: string): void => {
      let entries: Dirent[]
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      const beside = marks(entries, marker)
      for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink()) continue
        const path = join(dir, e.name)
        if (beside && e.name === entry.dir) {
          const row = projectRow(entry, index, checkout, path)
          if (row !== null) rows.push(row)
        } else if (!NOT_WALKED.has(e.name) && !e.name.startsWith('.')) visit(path)
      }
    }
    visit(checkout)
    return rows
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

  /** Every row now; a glob that matched more than its `maxEntries` puts a note on its last listed row. */
  const rowsNow = (ctx: Ctx): Row[] => {
    const refused = problems(ctx)
    const rows: Row[] = []
    for (const [index, entry] of d.candidates.entries()) {
      const folder = folders.get(entry.path)
      if (folder === undefined || !present(folder)) continue
      const problem = refused.get(entry.path) ?? null
      const action = actionOf(entry)
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
      const matches = globMatches(folder, entry.glob)
      const max = entry.maxEntries ?? DEFAULT_MAX_ENTRIES
      const listed: Row[] = []
      // Matches that make no row (outside the folder by real path, or unreadable) don't count toward `max`.
      let more = 0
      for (const [i, match] of matches.entries()) {
        if (listed.length === max) {
          more = matches.length - i
          break
        }
        if (containedIn([folder], match) === null) continue
        const row = folderRow(entry, index, match, action)
        if (row !== null) listed.push(row)
      }
      const last = listed.at(-1)
      if (last !== undefined && more > 0) {
        last.objections.push({
          level: 'note',
          code: 'more-entries',
          reason: `${more} more entries match ${entry.glob} in ${folder}; they are listed once these are gone`,
        })
      }
      rows.push(...listed)
    }
    const projects = d.project ?? []
    const checkouts = projects.length === 0 ? [] : checkoutsIn(ctx.targets)
    for (const [index, entry] of projects.entries()) {
      for (const checkout of checkouts) {
        if (ctx.ignore?.some((i) => within(i, checkout)) === true) continue
        rows.push(...projectRows(entry, index, checkout))
      }
    }
    return rows
  }

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

  /** Each folder that passes the checks in `refused` ({@link problems}): the plugin's roots. */
  const rootPaths = (refused: ReadonlyMap<string, string | null>): string[] => {
    const out = new Set<string>()
    for (const [key, folder] of folders) if (refused.get(key) === null) out.add(folder)
    return [...out]
  }

  /** Whether `dir` holds an entry, not a folder, that `marker` matches. */
  const marked = (dir: string, marker: string): boolean => {
    try {
      return marks(readdirSync(dir, { withFileTypes: true }), globRegExp(marker))
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
    const busy: Row['objections'] = []
    if (ev.project !== undefined) {
      const entry = d.project?.[ev.project]
      const checkout = ev.checkout
      if (entry === undefined || checkout === undefined) return 'no project entry gives it now'
      if (!checkoutsIn(ctx.targets).includes(checkout)) {
        return `${checkout} is not a checkout of the targets`
      }
      if (containedIn([checkout], path) === null) return `it is not inside ${checkout}`
      if (basename(path) !== entry.dir || !marked(dirname(path), entry.marker)) {
        return `it is no longer a ${entry.dir} folder beside ${entry.marker}`
      }
      busy.push(...liveIn(checkout, ctx))
    } else {
      const refused = problems(ctx)
      const now = rootPaths(refused)
      if (!now.some((r) => realOr(r) === realOr(path)) && containedIn(now, path) === null) {
        return `it is not inside ${name}'s roots`
      }
      const entry = d.candidates[ev.candidate ?? -1]
      const folder = entry === undefined ? undefined : folders.get(entry.path)
      if (entry === undefined || folder === undefined) return 'no candidate entry gives it now'
      const problem = refused.get(entry.path) ?? null
      if (problem !== null) return problem
      if (
        entry.glob === undefined ? path !== folder : !globMatches(folder, entry.glob).includes(path)
      ) {
        return `it is no longer ${entry.glob === undefined ? folder : `a match of ${entry.glob} in ${folder}`}`
      }
      if (actionOf(entry) !== ev.action) return 'how it would be deleted changed since the plan'
    }
    busy.unshift(...inUseNow(ctx))
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
        return { active: false, note: `skipped: ${d.supersededBy} runs and covers this` }
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
      const path = c.path
      if (path === undefined) throw new Error(`${c.id} is not a folder`)
      if (isLink(path)) throw new Error(`${path} is now a symlink; it is not followed`)
      if (!present(path)) return `already gone: ${path}`
      const ev = c.evidence as Evidence
      const why = refusal(ev, path, ctx)
      if (why !== null) throw new Error(`${path} was not deleted: ${why}`)
      if (ev.action === 'command') {
        return runCommand(kit, d.candidates[ev.candidate!]!, path, at.home, ctx)
      }
      return kit.remove(path, ctx)
    },
  }
}

/** Whether `entries` hold an entry, not a folder, that `marker` matches. */
const marks = (entries: readonly Dirent[], marker: RegExp): boolean =>
  entries.some((e) => !e.isDirectory() && marker.test(e.name))

/** The objection for a process table that could not be read. */
const unreadable = (why: string): Row['objections'][number] => ({
  level: 'refuse',
  code: 'process-table-unreadable',
  reason: `process table unreadable: ${why}`,
})

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

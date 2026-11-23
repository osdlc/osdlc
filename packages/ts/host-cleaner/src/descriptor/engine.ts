/**
 * Descriptor to plugin (tier 1): {@link descriptorPlugin} turns a parsed
 * descriptor into a `definePlugin` value built only on the plugin kit, with
 * the same hooks a code plugin has.
 *
 * - detect: `detect`'s `onPath` and `exists`, or any of its folders existing.
 *   A `system: true` descriptor never applies ({@link skipReason}), nor one
 *   whose `supersededBy` plugin runs. Otherwise it first works out its `vars`
 *   (tier 2, {@link resolveVars}), so once per survey, and its folders with
 *   them. A folder whose variable has no value is left out, with its
 *   candidates.
 * - roots: the folder each of its `paths` sits in, for this OS. A candidate
 *   may be a whole folder, and the core holds a candidate strictly inside a
 *   root, so the root is the folder's parent; the engine's own checks
 *   ({@link pathProblem}) and `delete` keep it to the folder.
 * - discover: one candidate per folder, or per `glob` match inside it, and
 *   `project` build folders in the targets' checkouts. Each is
 *   `<name>:<path>`. A folder the checks refuse is listed, unmeasured, and
 *   refused `outside-roots`.
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
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { globRegExp } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'
import { z } from 'zod'

import { hostDirs } from '../config.ts'
import { DEFAULT_IDLE_HOURS, idleHoursSetting, type Kit } from '../kit.ts'
import { containedIn } from '../roots.ts'
import { DELETE_LIMIT_MS, HOOK_LIMIT_MS, OUTSIDE_ROOTS } from '../run.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Ctx,
  type MaybePromise,
  type Objection,
  type Plugin,
  type PluginDefinition,
} from '../types.ts'
import {
  DEFAULT_MAX_ENTRIES,
  type Descriptor,
  type DescriptorCandidate,
  type Os,
  type ProjectEntry,
} from './schema.ts'
import { VAR_COMMAND_LIMIT_MS, fillTemplate, resolveVars, type Vars } from './vars.ts'

/** The protest on a prune whose program is not on PATH; `--allow no-prune-tool` removes the folder instead (D12). */
export const NO_PRUNE_TOOL = 'no-prune-tool'

/** The refusal while an `inUse` process runs or lock exists. */
export const IN_USE = 'in-use'

/** Folders under home that a descriptor path may never be: they hold a person's own files. */
export const PERSONAL_FOLDERS = [
  'Documents',
  'Desktop',
  'Downloads',
  'Pictures',
  'Music',
  'Movies',
  'Library',
  '.ssh',
  '.config',
] as const

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

/** True when `path` exists as itself, a link counted as present. */
const present = (path: string): boolean => lstatSync(path, { throwIfNoEntry: false }) !== undefined

const isLink = (path: string): boolean =>
  lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true

const realOr = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** Whether `inner` is `outer` or below it, by real paths. */
const within = (outer: string, inner: string): boolean => {
  const rel = relative(realOr(outer), realOr(inner))
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

/**
 * Why `path`, one of a descriptor's folders, may not be cleaned, or null when
 * it may: it must sit strictly inside `home`, and not be a personal folder,
 * be or hold a target or a checkout, or hold host-cleaner's own folders. Judged
 * on the path as given and on its real path. A `trusted` folder, from a
 * variable set in the config, may sit outside `home`, but not hold it.
 */
export function pathProblem(
  path: string,
  at: {
    home: string
    targets: readonly string[]
    checkouts: readonly string[]
    ownDirs: readonly string[]
    trusted?: boolean | undefined
  },
): string | null {
  if (realOr(path) === realOr(at.home)) return 'it is the home folder'
  if (at.trusted === true) {
    if (within(path, at.home)) return 'it holds the home folder'
  } else if (containedIn([at.home], path) === null) return 'it is not inside the home folder'
  for (const name of PERSONAL_FOLDERS) {
    if (realOr(path) === realOr(join(at.home, name))) return `it is the personal folder ~/${name}`
  }
  for (const t of at.targets) {
    if (within(path, t))
      return realOr(path) === realOr(t) ? 'it is a target' : `it holds the target ${t}`
  }
  if (present(join(path, '.git'))) return 'it is a checkout'
  for (const c of at.checkouts) if (within(path, c)) return `it holds the checkout ${c}`
  for (const own of at.ownDirs) {
    if (within(path, own)) return `it holds host-cleaner's own folder ${own}`
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

/** `hours` for a sentence, in tenths rounded down, so it never says more than was measured. */
const hoursText = (hours: number): string => String(Math.floor(hours * 10) / 10)

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

/** A folder set for a variable in the config: under home or absolute. */
const varSetting = z
  .string()
  .regex(/^(~[/\\]|\/|[A-Za-z]:[/\\])/, 'must start with ~/ or be absolute')

/**
 * The descriptor plugin's settings: `idleHours`, and for a descriptor that
 * declares variables, `vars` with one optional folder for each. A tier 1
 * descriptor has no `vars`, so `settings.vars` is then always undefined.
 */
type DescriptorSettings = z.ZodObject<{
  idleHours: typeof idleHoursSetting
  vars: z.ZodOptional<z.ZodObject<Record<string, z.ZodOptional<typeof varSetting>>>>
}>

const settingsFor = (d: Descriptor): DescriptorSettings => {
  const base = z.strictObject({ idleHours: idleHoursSetting })
  if (d.vars === undefined) return base as unknown as DescriptorSettings
  const each = Object.keys(d.vars).map((v) => [
    v,
    varSetting
      .optional()
      .describe(
        `A folder for \${${v}}; it wins over the descriptor's sources and may sit outside the home folder.`,
      ),
  ])
  return base.extend({ vars: z.strictObject(Object.fromEntries(each)).optional() })
}

/**
 * The plugin for the descriptor `d`, named `name` (its file name). Settings:
 * `idleHours`, and `vars` for a descriptor that declares variables, where a
 * name it doesn't declare is an error.
 */
export function descriptorPlugin(
  name: string,
  d: Descriptor,
  opts: DescriptorOptions = {},
): PluginDefinition<DescriptorSettings> {
  return definePlugin({
    name,
    api: PLUGIN_API,
    settings: settingsFor(d),
    create: ({ settings, kit, env }) =>
      engine(name, d, kit, {
        home: env.HOME ?? homedir(),
        os: opts.os ?? osOf(process.platform),
        idleHours: settings.idleHours ?? DEFAULT_IDLE_HOURS,
        runs: opts.runs,
        ownDirs: opts.ownDirs ?? ownDirsOf(env),
        env,
        vars: settings.vars ?? {},
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
  env: Readonly<Record<string, string | undefined>>
  /** The config's `vars`: trusted folders. */
  vars: Readonly<Record<string, string | undefined>>
}

function engine(name: string, d: Descriptor, kit: Kit, at: EngineAt): Plugin {
  const config = Object.fromEntries(
    Object.entries(at.vars).filter((e): e is [string, string] => e[1] !== undefined),
  )
  // The folders that apply on this OS, by their name in `paths`, as the last
  // survey resolved them; and those of them a config value gave.
  let folders = new Map<string, string>()
  let trusted = new Set<string>()
  let vars: Vars | undefined

  const refresh = async (ctx: Ctx): Promise<void> => {
    const now = await resolveVars(d.vars ?? {}, {
      home: at.home,
      os: at.os,
      env: at.env,
      config,
      kit,
      signal: ctx.signal,
    })
    const nextFolders = new Map<string, string>()
    const nextTrusted = new Set<string>()
    for (const [key, perOs] of Object.entries(d.paths)) {
      const template = perOs.all ?? perOs[at.os]
      if (template === undefined) continue
      const filled = fillTemplate(template, now, at.home)
      // A variable with no value leaves the folder out.
      if ('missing' in filled) continue
      nextFolders.set(key, filled.path)
      if (filled.trusted) nextTrusted.add(key)
    }
    vars = now
    folders = nextFolders
    trusted = nextTrusted
  }

  /** Resolves the variables if no survey has yet. */
  const ready = async (ctx: Ctx): Promise<void> => {
    if (vars === undefined) await refresh(ctx)
  }

  const problems = (ctx: Ctx) => {
    const where = { ...at, targets: ctx.targets, checkouts: checkoutsIn(ctx.targets) }
    const out = new Map<string, string | null>()
    for (const [key, folder] of folders)
      out.set(key, pathProblem(folder, { ...where, trusted: trusted.has(key) }))
    return out
  }

  const thresholdOf = (entry: { idleHours?: number | undefined }): number =>
    entry.idleHours ?? at.idleHours

  const actionOf = (entry: DescriptorCandidate): Action =>
    entry.command !== undefined && kit.onPath(entry.command[0]!) ? 'command' : 'remove'

  /** One folder's row: a whole folder, or one glob match. */
  const folderRow = (entry: DescriptorCandidate, index: number, path: string): Row | null => {
    const action = actionOf(entry)
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
      // A prune removes only what nothing uses: no idle check.
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
      const marked = entries.some((e) => !e.isDirectory() && marker.test(e.name))
      for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink()) continue
        const path = join(dir, e.name)
        if (marked && e.name === entry.dir) {
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

  /** Every row now, and a note for each glob that matched more than its `maxEntries`. */
  const rowsNow = (ctx: Ctx): Row[] => {
    const refused = problems(ctx)
    const rows: Row[] = []
    for (const [index, entry] of d.candidates.entries()) {
      const folder = folders.get(entry.path)
      if (folder === undefined || !present(folder)) continue
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
            evidence: { path: folder, candidate: index, action: actionOf(entry) },
          }),
        })
        continue
      }
      if (entry.glob === undefined) {
        const row = folderRow(entry, index, folder)
        if (row !== null) rows.push(row)
        continue
      }
      const matches = globMatches(folder, entry.glob)
      const max = entry.maxEntries ?? DEFAULT_MAX_ENTRIES
      const listed: Row[] = []
      for (const match of matches.slice(0, max)) {
        if (containedIn([folder], match) === null) continue
        const row = folderRow(entry, index, match)
        if (row !== null) listed.push(row)
      }
      const last = listed.at(-1)
      if (last !== undefined && matches.length > max) {
        last.objections.push({
          level: 'note',
          code: 'more-entries',
          reason: `${matches.length - max} more entries match ${entry.glob} in ${folder}; they are listed once these are gone`,
        })
      }
      rows.push(...listed)
    }
    for (const [index, entry] of (d.project ?? []).entries()) {
      for (const checkout of checkoutsIn(ctx.targets)) {
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
        out.push({
          level: 'refuse',
          code: 'process-table-unreadable',
          reason: `process table unreadable: ${found.unknown}`,
        })
        break
      }
    }
    for (const lock of d.inUse?.locks ?? []) {
      const filled = fillTemplate(lock, vars ?? {}, at.home)
      // A lock whose variable has no value can't be looked for.
      if ('missing' in filled) continue
      const file = filled.path
      if (present(file))
        out.push({ level: 'refuse', code: IN_USE, reason: `the lock ${file} exists` })
    }
    return out
  }

  /** What blocks deleting a `project` row now: a busy process in its checkout. */
  const liveIn = (checkout: string, ctx: Ctx): Row['objections'] => {
    const held = kit.running({ in: checkout }, ctx)
    return [
      ...(held.names.length > 0
        ? [
            {
              level: 'refuse' as const,
              code: 'live-process',
              reason: `running in the checkout: ${held.names.join(', ')}`,
            },
          ]
        : []),
      ...(held.unknown === undefined
        ? []
        : [
            {
              level: 'refuse' as const,
              code: 'process-table-unreadable',
              reason: `process table unreadable: ${held.unknown}`,
            },
          ]),
    ]
  }

  const roots = (ctx: Ctx): string[] => {
    const refused = problems(ctx)
    const out = new Set<string>()
    for (const [key, folder] of folders) if (refused.get(key) === null) out.add(dirname(folder))
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
    const busy = inUseNow(ctx)
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
      if (containedIn(roots(ctx), path) === null) return `it is not inside ${name}'s roots`
      const entry = d.candidates[ev.candidate ?? -1]
      const folder = entry === undefined ? undefined : folders.get(entry.path)
      if (entry === undefined || folder === undefined) return 'no candidate entry gives it now'
      const problem = problems(ctx).get(entry.path) ?? null
      if (problem !== null) return problem
      if (
        entry.glob === undefined ? path !== folder : !globMatches(folder, entry.glob).includes(path)
      ) {
        return `it is no longer ${entry.glob === undefined ? folder : `a match of ${entry.glob} in ${folder}`}`
      }
      if (actionOf(entry) !== ev.action) return 'how it would be deleted changed since the plan'
    }
    return busy.length === 0 ? null : busy.map((b) => b.reason).join('; ')
  }

  let rows = new Map<string, Row>()

  // Commands run one at a time, each within its own limit.
  const commands = Object.values(d.vars ?? {})
    .flat()
    .filter((s) => 'command' in s).length

  return {
    name,
    limits: {
      discover: DISCOVER_LIMIT_MS,
      detect: Math.max(HOOK_LIMIT_MS, (commands + 1) * VAR_COMMAND_LIMIT_MS),
    },
    async detect(ctx) {
      if (skipReason(d) !== undefined) return false
      if (d.supersededBy !== undefined && (await at.runs?.(d.supersededBy, ctx)) === true) {
        return false
      }
      await refresh(ctx)
      const holds = (c: { onPath?: string | undefined; exists?: string | undefined }): boolean => {
        if (c.onPath !== undefined) return kit.onPath(c.onPath)
        const folder = c.exists === undefined ? undefined : folders.get(c.exists)
        return folder !== undefined && present(folder)
      }
      if (d.detect?.all !== undefined) return d.detect.all.every(holds)
      if (d.detect?.any !== undefined) return d.detect.any.some(holds)
      return [...folders.values()].some(present)
    },
    async roots(ctx) {
      await ready(ctx)
      return roots(ctx)
    },
    async discover(ctx) {
      await ready(ctx)
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
      await ready(ctx)
      const why = refusal(c.evidence as Evidence, path, ctx)
      if (why !== null) throw new Error(`${path} was not deleted: ${why}`)
      const ev = c.evidence as Evidence
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

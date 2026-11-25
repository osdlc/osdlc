/**
 * Descriptor to plugin (tier 1): {@link descriptorPlugin} turns a parsed
 * descriptor into a `definePlugin` value built only on the plugin kit, with
 * the same hooks a code plugin has. What each hook does: the "Descriptors"
 * section of the package README.
 *
 * Roots are self roots because a candidate may be the whole folder: `~/.npm`'s
 * root is `~/.npm` itself, so `delete` checks the folder again. A folder the
 * checks refuse is still listed, unmeasured and refused `outside-roots`. The
 * prune protest is D12; pointing the command at the checked folder is D13.
 *
 * Idle time and size stay out of the evidence, as for `cargo` and `node`:
 * either may be unmeasured in one survey and measured in the next.
 */

import { lstatSync, readdirSync, realpathSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'

import { failureText, firstLine } from '@osdlc/command-seam'
import { globRegExp } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import { checkoutsOf, hoursText, type Checkout } from '../artifacts.ts'
import { hostDirs } from '../config.ts'
import { containsIgnored, coveredBy } from '../ignore.ts'
import { DEFAULT_IDLE_HOURS, idleHoursSetting, present, type Idle, type Kit } from '../kit.ts'
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

/** The refusal of a folder two entries give, unless both are `project` entries. */
export const DUPLICATE_ENTRY = 'duplicate-entry'

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

/** The descriptor `paths` OS for a `process.platform` value. */
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
  const inside = [
    ...new Map(targets.filter((t) => within(checkout.path, t)).map((t) => [realOr(t), t])).values(),
  ]
  // A target inside another one is walked with it.
  return inside.filter((t) => !inside.some((o) => o !== t && within(o, t)))
}

/** A glob's parts, one per level, and whether a trailing `/` takes folders only. */
interface GlobParts {
  parts: RegExp[]
  foldersOnly: boolean
}

const globParts = (glob: string): GlobParts => ({
  parts: glob
    .split(/[/\\]/)
    .filter((p) => p !== '' && p !== '.')
    .map((p) => globRegExp(p)),
  foldersOnly: /[/\\]$/.test(glob),
})

/**
 * Whether `path`, below `folder`, is a match of `glob` there by the rules of
 * {@link globMatches}, reading only the entries on its way.
 */
function isGlobMatch(folder: string, { parts, foldersOnly }: GlobParts, path: string): boolean {
  const rel = relative(folder, path)
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return false
  const names = rel.split(sep)
  if (names.length !== parts.length) return false
  let at = folder
  for (const [i, n] of names.entries()) {
    if (!parts[i]!.test(n)) return false
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
  const { parts, foldersOnly } = globParts(glob)
  let level = [folder]
  for (const [i, re] of parts.entries()) {
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
  /** For a folder several entries give: the highest of their idle thresholds. */
  idleHours?: number
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
  /** The run's home: the core's, else the one the plugin was created with. */
  const homeOf = (ctx: Pick<Ctx, 'home'>): string => ctx.home ?? at.home

  // The folders that apply on this OS, by their name in `paths`, for the last home asked.
  let foldersAt: { home: string; folders: Map<string, string> } | undefined
  const foldersOf = (ctx: Pick<Ctx, 'home'>): Map<string, string> => {
    const home = homeOf(ctx)
    if (foldersAt !== undefined && foldersAt.home === home) return foldersAt.folders
    const folders = new Map<string, string>()
    for (const [key, perOs] of Object.entries(d.paths)) {
      const folder = perOs.all ?? perOs[at.os]
      if (folder !== undefined) folders.set(key, expand(folder, home))
    }
    foldersAt = { home, folders }
    return folders
  }

  // What git says of the targets' checkouts, once per run: a run's hooks share its targets.
  const linkedOf = new WeakMap<readonly string[], string[]>()
  const checkoutsOfRun = new WeakMap<readonly string[], Checkout[]>()

  // The `project` entries, each with its marker compiled once.
  const projects = (d.project ?? []).map((entry, index) => ({
    entry,
    index,
    marker: globRegExp(entry.marker),
  }))

  const problems = (ctx: Ctx) => {
    const out = new Map<string, string | null>()
    const folders = foldersOf(ctx)
    const own = at.ownDirs
    if (own instanceof Error) {
      for (const key of folders.keys()) {
        out.set(key, `host-cleaner's own folders could not be found: ${own.message}`)
      }
      return out
    }
    let checkouts = linkedOf.get(ctx.targets)
    if (checkouts === undefined) {
      checkouts = linkedCheckouts(ctx.targets)
      linkedOf.set(ctx.targets, checkouts)
    }
    const where = { home: homeOf(ctx), targets: ctx.targets, checkouts, ownDirs: own }
    for (const [key, folder] of folders) out.set(key, pathProblem(folder, where))
    return out
  }

  /** The checkouts of the targets' repositories, primary first, ignored ones left out. */
  const checkoutsNow = (ctx: Ctx): Checkout[] => {
    let out = checkoutsOfRun.get(ctx.targets)
    if (out === undefined) {
      out = checkoutsOf({ kit, git: undefined, idleHours: at.idleHours, ctx })
      checkoutsOfRun.set(ctx.targets, out)
    }
    return out
  }

  /**
   * How long `path` has sat unchanged: a folder by everything in it, a file (a
   * glob may match one) by itself. Throws when it is gone, so it gives no row.
   */
  const idleOf = (path: string): Idle => {
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (stat === undefined) throw new Error(`${path} is gone`)
    if (stat.isDirectory()) return kit.idle(path)
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
    const objections: Row['objections'] = []
    if (prune && action === 'remove') {
      objections.push({
        level: 'protest',
        code: NO_PRUNE_TOOL,
        reason: `${entry.command![0]} is not on PATH to prune it; --allow ${NO_PRUNE_TOOL} removes the whole folder instead`,
      })
    }
    const evidence: Evidence = { path, candidate: index, action }
    const base = {
      kind: name,
      path,
      costDescription: entry.costDescription,
      evidence,
      ...(entry.held === true ? { held: true } : {}),
    }
    if (prune && action === 'command') {
      // A prune removes only what nothing uses: no idle check.
      const bytes = kit.size(path)
      return {
        objections,
        candidate: kit.candidate({
          ...base,
          why: `${entry.command!.join(' ')} removes only what nothing uses`,
          ...(bytes === null ? {} : { bytes }),
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
        ...(idleNow ? {} : { held: true }),
      }),
    }
  }

  /** Build folders beside a marker under `walk`, in `checkout`, for every `project` entry in one walk. */
  const projectRows = (checkout: string, walk: string): Row[] => {
    const rows: Row[] = []
    const visit = (dir: string): void => {
      let found: Dirent[]
      try {
        found = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      const files = found.filter((e) => !e.isDirectory()).map((e) => e.name)
      const here = projects.filter((p) => files.some((f) => p.marker.test(f)))
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
    visit(walk)
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
    let refused: Map<string, string | null> | undefined
    const rows: Row[] = []
    const folders = foldersOf(ctx)
    for (const [index, entry] of d.candidates.entries()) {
      const folder = folders.get(entry.path)
      if (folder === undefined || !present(folder)) continue
      const action = actionOf(entry)
      refused ??= problems(ctx)
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
        // The core checks only the candidate's own path against the ignore list.
        const ignore = ctx.ignore ?? []
        const left = matches
          .slice(max)
          .filter(
            (m) => coveredBy(m, ignore) === undefined && containsIgnored(m, ignore) === undefined,
          )
        const row = restRow(entry, index, folder, left, max, action)
        if (row !== null) rows.push(row)
      }
    }
    if (projects.length > 0) {
      for (const checkout of checkoutsNow(ctx)) {
        for (const walk of walkedIn(checkout, ctx.targets)) {
          rows.push(...projectRows(checkout.path, walk))
        }
      }
    }
    return rows
  }

  /**
   * The glob matches past `maxEntries`, combined into one candidate at the
   * first of them that removes each, since the core lets only a path
   * candidate remove folders. Held when any of them changed within the
   * threshold; one that cannot be read is left out, as its own row would be.
   */
  const restRow = (
    entry: DescriptorCandidate,
    index: number,
    folder: string,
    matches: readonly string[],
    max: number,
    action: Action,
  ): Row | null => {
    const threshold = thresholdOf(entry)
    const rest: string[] = []
    let changed = 0
    let unmeasured = false
    let bytes: number | null = 0
    for (const [i, match] of matches.entries()) {
      let idle
      try {
        idle = idleOf(match)
      } catch {
        continue
      }
      rest.push(match)
      if (idle.unmeasured) unmeasured = true
      else if (idle.hours !== null && idle.hours < threshold) changed++
      if (changed > 0) {
        // Held now, whatever the others are: they stay unchecked and unsized
        // here, and `delete` checks each of them again.
        rest.push(...matches.slice(i + 1))
        bytes = null
        break
      }
      const size = kit.size(match)
      bytes = bytes === null || size === null ? null : bytes + size
    }
    const [path] = rest
    if (path === undefined) return null
    const since = unmeasured
      ? 'when some last changed could not be measured in the time budget'
      : changed === 0
        ? `none changed in ${threshold} hours`
        : `one changed in the last ${threshold} hours, so the others were not measured`
    const evidence: Evidence = { path: folder, rest, candidate: index, action }
    return {
      objections: [],
      candidate: kit.candidate({
        kind: name,
        path,
        why: `${rest.length} matches of ${entry.glob} past the first ${max}, from this one on, as one; ${since}; each removed as a folder`,
        costDescription: entry.costDescription,
        evidence,
        ...(bytes === null ? {} : { bytes }),
        ...(unmeasured ? { unmeasured: true } : {}),
        ...(entry.held === true || changed > 0 ? { held: true } : {}),
      }),
    }
  }

  /** The `inUse` objections now: a running process or a lock file refuses every candidate. */
  const inUseNow = (ctx: Ctx): Row['objections'] => {
    const home = homeOf(ctx)
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
      const file = expand(lock, home)
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
  const rootPaths = (refused: Map<string, string | null>, ctx: Ctx): string[] => {
    const out = new Set<string>()
    for (const [key, folder] of foldersOf(ctx)) if (refused.get(key) === null) out.add(folder)
    return [...out]
  }

  /** Whether `dir` holds an entry, not a folder, that `marker` matches. */
  const marked = (dir: string, marker: RegExp): boolean => {
    try {
      return readdirSync(dir, { withFileTypes: true }).some(
        (e) => !e.isDirectory() && marker.test(e.name),
      )
    } catch {
      return false
    }
  }

  /**
   * Why `paths` of `c` are no longer as idle as the plan had them, or null: one
   * the plan ran as idle may not have changed within `threshold` hours since,
   * nor be unmeasured now, as for the artifact plugins.
   */
  const stillIdle = (
    c: Candidate,
    paths: readonly string[],
    threshold: number,
    named: (p: string) => string,
  ): string | null => {
    for (const p of paths) {
      let idle
      try {
        idle = idleOf(p)
      } catch {
        return `${named(p)} cannot be read now`
      }
      if (idle.unmeasured) {
        if (c.unmeasured !== true) return `${named(p)} could not be measured idle in the time budget now`
      } else if (idle.hours !== null && idle.hours < threshold && c.held !== true) {
        return `${named(p)} is no longer idle: it changed ${hoursText(idle.hours)} hours ago (threshold ${threshold})`
      }
    }
    return null
  }

  /** A row's idle threshold: the merged one, else its entry's. */
  const thresholdOfRow = (ev: Evidence): number => {
    if (ev.idleHours !== undefined) return ev.idleHours
    const entry =
      ev.project !== undefined ? projects[ev.project]?.entry : d.candidates[ev.candidate ?? -1]
    return entry === undefined ? at.idleHours : thresholdOf(entry)
  }

  /**
   * One row for two that give the same folder, so neither is dropped: held or
   * unmeasured when either is, the higher threshold, and both rows' objections.
   * Two `project` entries remove it the same way; any other pair is refused,
   * since which entry would delete it is not clear.
   */
  const both = (a: Row, b: Row): Row => {
    const ea = a.candidate.evidence as Evidence
    const eb = b.candidate.evidence as Evidence
    const objections = [...a.objections, ...b.objections]
    if (ea.project === undefined || eb.project === undefined) {
      objections.push({
        level: 'refuse',
        code: DUPLICATE_ENTRY,
        reason: `two entries of ${name} give ${a.candidate.path ?? a.candidate.id}; which one deletes it is not clear`,
      })
    }
    const held = a.candidate.held === true || b.candidate.held === true
    const unmeasured = a.candidate.unmeasured === true || b.candidate.unmeasured === true
    const evidence: Evidence = {
      ...ea,
      idleHours: Math.max(thresholdOfRow(ea), thresholdOfRow(eb)),
    }
    return {
      ...a,
      objections,
      candidate: {
        ...a.candidate,
        ...(held ? { held: true } : {}),
        ...(unmeasured ? { unmeasured: true } : {}),
        evidence,
      } as Candidate,
    }
  }

  /**
   * Why the candidate at `path` with evidence `ev` may not be deleted now, or
   * null: the entry that gave it must still give it, under the same checks
   * and deleted the same way, and nothing in `inUse`, or for a build folder
   * in its checkout, may be running.
   */
  const refusal = (c: Candidate, ev: Evidence, path: string, ctx: Ctx): string | null => {
    const live: Row['objections'] = []
    const paths = ev.rest ?? [path]
    // Of a combined candidate, the reason names the match at fault.
    const named = (p: string): string => (ev.rest === undefined ? 'it' : p)
    if (ev.project !== undefined) {
      const project = projects[ev.project]
      const checkout = ev.checkout
      if (project === undefined || checkout === undefined) return 'no project entry gives it now'
      const { entry, marker } = project
      const now = checkoutsNow(ctx).find((x) => x.path === checkout)
      if (now === undefined) return `${checkout} is not a checkout of the targets`
      if (containedIn(walkedIn(now, ctx.targets), path) === null) {
        return `it is not inside ${checkout} and the targets`
      }
      if (basename(path) !== entry.dir || !marked(dirname(path), marker)) {
        return `it is no longer a ${entry.dir} folder beside ${entry.marker}`
      }
      const idle = stillIdle(c, paths, ev.idleHours ?? thresholdOf(entry), named)
      if (idle !== null) return idle
      live.push(...liveIn(checkout, ctx))
    } else {
      const refused = problems(ctx)
      const now = rootPaths(refused, ctx)
      const realNow = new Set(now.map(realOr))
      for (const p of paths) {
        if (!realNow.has(realOr(p)) && containedIn(now, p) === null) {
          return `${named(p)} is not inside ${name}'s roots`
        }
      }
      const entry = d.candidates[ev.candidate ?? -1]
      const folder = entry === undefined ? undefined : foldersOf(ctx).get(entry.path)
      if (entry === undefined || folder === undefined) return 'no candidate entry gives it now'
      const problem = refused.get(entry.path) ?? null
      if (problem !== null) return problem
      const glob = entry.glob === undefined ? undefined : globParts(entry.glob)
      for (const p of paths) {
        if (glob === undefined ? p !== folder : !isGlobMatch(folder, glob, p)) {
          return `${named(p)} is no longer ${entry.glob === undefined ? folder : `a match of ${entry.glob} in ${folder}`}`
        }
      }
      if (actionOf(entry) !== ev.action) return 'how it would be deleted changed since the plan'
      // A prune removes only what nothing uses: it has no idle check.
      if (!(entry.command !== undefined && entry.removes === 'unused' && ev.action === 'command')) {
        const idle = stillIdle(c, paths, ev.idleHours ?? thresholdOf(entry), named)
        if (idle !== null) return idle
      }
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
        const folder = c.exists === undefined ? undefined : foldersOf(ctx).get(c.exists)
        return folder !== undefined && present(folder)
      }
      if (d.detect?.all !== undefined) return d.detect.all.every(holds)
      if (d.detect?.any !== undefined) return d.detect.any.some(holds)
      return [...foldersOf(ctx).values()].some(present)
    },
    roots: (ctx): Root[] => rootPaths(problems(ctx), ctx).map((path) => ({ path, self: true })),
    discover(ctx) {
      rows = new Map()
      for (const r of rowsNow(ctx)) {
        const had = rows.get(r.candidate.id)
        rows.set(r.candidate.id, had === undefined ? r : both(had, r))
      }
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
      if (Array.isArray(ev.rest)) {
        const left = ev.rest.filter(present)
        if (left.length === 0) return `already gone: every match of ${c.id}`
        const link = left.find(isLink)
        if (link !== undefined) throw new Error(`${link} is now a symlink; it is not followed`)
        const why = refusal(c, { ...ev, rest: left }, ev.path, ctx)
        if (why !== null) throw new Error(`${c.id} was not deleted: ${why}`)
        const done: string[] = []
        for (const [i, p] of left.entries()) {
          try {
            done.push(kit.remove(p, ctx))
          } catch (err) {
            // The receipt keeps what was removed before the failure; the rest is not tried.
            const said = err instanceof Error ? err.message : String(err)
            const untried = left.length - i - 1
            throw new Error(
              `${done.length === 0 ? '' : `${done.join('; ')}; then `}${p}: ${said}${untried === 0 ? '' : `; ${untried} more not tried`}`,
            )
          }
        }
        return done.join('; ')
      }
      const path = c.path
      if (path === undefined) throw new Error(`${c.id} is not a folder`)
      if (isLink(path)) throw new Error(`${path} is now a symlink; it is not followed`)
      if (!present(path)) return `already gone: ${path}`
      const why = refusal(c, ev, path, ctx)
      if (why !== null) throw new Error(`${path} was not deleted: ${why}`)
      if (ev.action === 'command') {
        return runCommand(kit, d.candidates[ev.candidate!]!, path, homeOf(ctx), ctx)
      }
      return kit.remove(path, ctx)
    },
  }
}

const unreadable = (why: string): Row['objections'][number] => ({
  level: 'refuse',
  code: 'process-table-unreadable',
  reason: `process table unreadable: ${why}`,
})

/** Why a command never exited: only a failed spawn means it did not run, so the folder may be part pruned otherwise. */
const stopped = (reason: string | undefined): string =>
  reason === 'spawn'
    ? 'did not run'
    : `stopped before it exited (${reason ?? 'unknown'}); the folder may be partly pruned`

const bytesText =(n: number | null): string => (n === null ? 'an unknown size' : `${n} bytes`)

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
    const said = firstLine(failureText(r, { both: true }))
    throw new Error(
      `${argv.join(' ')} failed (${r.neverExited === true ? stopped(r.reason) : `exit ${r.exitCode}`})${said === '' ? '' : `: ${said}`}`,
    )
  }
  return `ran ${argv.join(' ')}; ${bytesText(before)} before, ${bytesText(kit.size(real))} after`
}

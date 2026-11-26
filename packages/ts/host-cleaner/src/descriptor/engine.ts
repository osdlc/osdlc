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
 * The variables a folder or lock uses on this OS (tier 2, {@link resolveVars})
 * are resolved once per survey, in detect.
 *
 * Idle time and size stay out of the evidence, as for `cargo` and `node`:
 * either may be unmeasured in one survey and measured in the next.
 */

import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, realpathSync, type Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { failureText, firstLine, type NeverExitedReason } from '@osdlc/command-seam'
import { globRegExp } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import { checkoutsOf, hoursText, type Checkout } from '../artifacts.ts'
import { hostDirs } from '../config.ts'
import { COST_DESCRIPTIONS, type CostDescription } from '../cost.ts'
import { DISCOVER_LIMIT_MS, errorText, yieldToLimit } from '../helpers.ts'
import { containsIgnored, coveredBy } from '../ignore.ts'
import {
  DEFAULT_IDLE_HOURS,
  MEASURE_BUDGET_MS,
  idleHoursSetting,
  present,
  type Idle,
  type Kit,
} from '../kit.ts'
import { containedIn, linkedCheckouts, realOr, rootProblem, within } from '../roots.ts'
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
  type Root,
  type SettingSource,
} from '../types.ts'
import {
  DEFAULT_MAX_ENTRIES,
  FolderSchema,
  type Descriptor,
  type DescriptorCandidate,
  type Os,
  type ProjectEntry,
} from './schema.ts'
import {
  VAR_COMMAND_LIMIT_MS,
  fillTemplate,
  forOs,
  resolveVars,
  varRefs,
  type Vars,
} from './vars.ts'

/** The protest on a prune whose program is not on PATH; `--allow no-prune-tool` removes the folder instead (D12). */
export const NO_PRUNE_TOOL = 'no-prune-tool'

/** The refusal while an `inUse` process runs or lock exists. */
export const IN_USE = 'in-use'

/** The refusal of a folder that two entries give, since which of them would delete it is not clear. */
export const DUPLICATE_ENTRY = 'duplicate-entry'

/** Folders never walked into when looking for `project` build folders. */
const NOT_WALKED = new Set(['.git', 'node_modules', 'target'])

export interface DescriptorOptions {
  /** The OS whose `paths` apply. Default: this one. */
  os?: Os | undefined
  /**
   * Whether the code plugin `plugin` runs this time: detected, enabled and not
   * skipped. A descriptor whose `supersededBy` runs doesn't. Default: whether
   * survey has found it active (`ctx.running`).
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

/**
 * Why `path`, one of a descriptor's folders, may not be cleaned, or null when
 * it may. It must pass the core's check of a self root ({@link rootProblem}),
 * sit strictly inside `home` unless it is `trusted` (from a variable set in
 * the config), and neither hold nor sit inside host-cleaner's own folders.
 * Judged on the path as given and on its real path, as the filesystem spells
 * it.
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
  const root = rootProblem(path, { ...at, linked: at.checkouts }, true)
  if (root !== null) return root
  if (at.trusted !== true && containedIn([at.home], path) === null) {
    return 'it is not inside the home folder'
  }
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
  /** For the candidate of the glob matches past `maxEntries`: how many, and a digest of their paths. */
  rest?: { matches: number; digest: string }
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
  /** For the candidate of the glob matches past `maxEntries`: each of them. Kept out of the evidence, which a huge cache would flood. */
  rest?: string[]
}

/**
 * A folder set for a variable in the config: under home or absolute, and
 * passing the checks on a descriptor's folders (no `..`, not a home folder or
 * a root), since it is trusted.
 */
const varSetting = z
  .string()
  .regex(/^(~[/\\]|\/|[A-Za-z]:[/\\])/, 'must start with ~/ or be absolute')
  .pipe(FolderSchema)

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

/** The `project` entry at `index`, with its marker compiled. */
interface Project {
  entry: ProjectEntry
  index: number
  marker: RegExp
}

const digestOf = (paths: readonly string[]): string =>
  createHash('sha256').update(paths.join('\0')).digest('hex')

/** The costliest of `costs`. */
const costliest = (costs: readonly CostDescription[]): CostDescription =>
  COST_DESCRIPTIONS[Math.max(...costs.map((c) => COST_DESCRIPTIONS.indexOf(c)))]!

const HOUR_MS = 3_600_000

/** Whether one measurement's time has passed since this call. */
const afterBudget = (): (() => boolean) => {
  const start = performance.now()
  return () => performance.now() - start > MEASURE_BUDGET_MS
}

/** Why a folder whose idle time cannot be read is left alone. */
const UNREADABLE = 'it cannot be read now'

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
    idleHoursOf: (idleHours, source) =>
      [
        ...d.candidates.map((c) => ({
          part: c.glob === undefined ? c.path : `${c.path}/${c.glob}`,
          own: c.idleHours,
        })),
        ...(d.project ?? []).map((p) => ({
          part: `${p.dir} beside ${p.marker}`,
          own: p.idleHours,
        })),
      ]
        .filter((p) => p.own !== undefined)
        .map((p) => ({ part: p.part, idleHours: entryIdleHours(p.own, idleHours, source) })),
    create: ({ settings, sources, kit, env }) =>
      engine(name, d, kit, {
        home: env.HOME ?? homedir(),
        os: opts.os ?? osOf(process.platform),
        idleHours: settings.idleHours ?? DEFAULT_IDLE_HOURS,
        // A setting given with no source raises an entry's value, as the one that deletes less.
        idleHoursFrom:
          sources !== undefined
            ? (sources.idleHours ?? 'default')
            : settings.idleHours === undefined
              ? 'default'
              : 'shared',
        runs: opts.runs ?? ((plugin, ctx) => ctx.running?.includes(plugin) === true),
        ownDirs: opts.ownDirs ?? ownDirsOf(env),
        env,
        vars: settings.vars,
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

/**
 * The idle threshold of an entry whose own `idleHours` is `own`, given the
 * plugin's `idleHours` setting and where it came from. The plugin's own entry
 * in the config wins; the top-level setting can only raise the entry's value;
 * the default leaves it. An entry with none takes the setting.
 */
const entryIdleHours = (own: number | undefined, setting: number, from: SettingSource): number =>
  own === undefined || from === 'config'
    ? setting
    : from === 'shared'
      ? Math.max(own, setting)
      : own

interface EngineAt {
  home: string
  os: Os
  idleHours: number
  idleHoursFrom: SettingSource
  runs: NonNullable<DescriptorOptions['runs']>
  ownDirs: readonly string[] | Error
  env: Readonly<Record<string, string | undefined>>
  /** The config's `vars`: trusted folders. */
  vars?: Readonly<Record<string, string | undefined>> | undefined
}

/** One of a descriptor's folders, resolved; trusted when a config value gave it. */
type Folder = { path: string; trusted: boolean }

/**
 * The variables that `templates` use on `os`, declared or built in, with the
 * ones their sources use in turn: the ones a survey resolves.
 */
function varsUsed(d: Descriptor, os: Os, templates: readonly string[]): Set<string> {
  const used = new Set<string>()
  const add = (text: string): void => {
    for (const ref of varRefs(text)) {
      if (used.has(ref)) continue
      used.add(ref)
      for (const s of sourcesOf(d, ref)) {
        if ('file' in s) add(s.file)
        if ('value' in s) {
          const v = forOs(s.value, os)
          if (v !== undefined) add(v)
        }
      }
    }
  }
  templates.forEach(add)
  return used
}

/** The sources `d` declares for the variable `name`; none for a built-in. */
const sourcesOf = (d: Descriptor, name: string) =>
  d.vars !== undefined && Object.hasOwn(d.vars, name) ? d.vars[name]! : []

/** Why the variable `missing` has no value, for a note: each source tried and why it gave none. */
function missingText(key: string, missing: string, vars: Readonly<Vars>): string {
  const tried = Object.hasOwn(vars, missing) ? vars[missing]!.tried : []
  const why = tried.map((t) => `${t.source}: ${t.failed}`).join('; ')
  return `${key} is left out: \${${missing}} has no value${why === '' ? '' : ` (${why})`}`
}

function engine(name: string, d: Descriptor, kit: Kit, at: EngineAt): Plugin {
  /** The run's home: the core's, else the one the plugin was created with. */
  const homeOf = (ctx: Pick<Ctx, 'home'>): string => ctx.home ?? at.home

  const pathTemplates = Object.entries(d.paths).flatMap(([key, perOs]) => {
    const template = forOs(perOs, at.os)
    return template === undefined ? [] : [[key, template] as const]
  })
  const lockTemplates = d.inUse?.locks ?? []
  // resolveVars resolves the variables these use in turn as their sources need them.
  const used = [...pathTemplates.map(([, t]) => t), ...lockTemplates].flatMap(varRefs)
  const shown = varsUsed(d, at.os, [...pathTemplates.map(([, t]) => t), ...lockTemplates])

  // The folders by their name in `paths`, and the lock files, as the last
  // survey filled them, for the home `filledFor`; undefined until a survey runs.
  let folders = new Map<string, Folder>()
  let locks: string[] = []
  // Each lock whose variable has no value, and why: the in-use check cannot be
  // made, so it refuses every candidate.
  let unknownLocks: string[] = []
  let filledFor: string | undefined
  // Why the last survey left folders or locks out; undefined when it left none out.
  let leftOut: string | undefined

  /** Resolves the variables and fills the folders and locks with them; returns every variable's outcome. */
  const refresh = async (ctx: Ctx): Promise<Vars> => {
    const home = homeOf(ctx)
    const vars = await resolveVars(d.vars ?? {}, {
      home,
      os: at.os,
      env: at.env,
      config: at.vars,
      trustsXdg: (folder) => FolderSchema.safeParse(folder).success,
      kit,
      signal: ctx.signal,
      only: used,
    })
    const why: string[] = []
    const next = new Map<string, Folder>()
    for (const [key, template] of pathTemplates) {
      const filled = fillTemplate(template, vars, home)
      if ('missing' in filled) why.push(missingText(key, filled.missing, vars))
      else next.set(key, filled)
    }
    folders = next
    const unknown: string[] = []
    locks = lockTemplates.flatMap((lock) => {
      const filled = fillTemplate(lock, vars, home)
      if (!('missing' in filled)) return [filled.path]
      why.push(missingText(`the lock ${lock}`, filled.missing, vars))
      unknown.push(`the lock ${lock} cannot be checked: \${${filled.missing}} has no value`)
      return []
    })
    unknownLocks = unknown
    leftOut = why.length === 0 ? undefined : why.join('; ')
    filledFor = home
    return vars
  }

  /** Resolves the variables if no survey has yet for the run's home. */
  const ready = async (ctx: Ctx): Promise<void> => {
    if (filledFor !== homeOf(ctx)) await refresh(ctx)
  }

  // What git says of the targets' checkouts, once per run: a run's hooks share its targets.
  const linkedOf = new WeakMap<readonly string[], string[]>()
  const checkoutsOfRun = new WeakMap<readonly string[], Checkout[]>()

  // The `project` entries, each with its marker compiled once.
  const projects: Project[] = (d.project ?? []).map((entry, index) => ({
    entry,
    index,
    marker: globRegExp(entry.marker),
  }))

  const problems = (ctx: Ctx) => {
    const out = new Map<string, string | null>()
    const own = at.ownDirs
    if (own instanceof Error) {
      for (const key of folders.keys()) {
        out.set(key, `host-cleaner's own folders could not be found: ${own.message}`)
      }
      return out
    }
    const checkouts = linkedOf.get(ctx.targets) ?? linkedCheckouts(ctx.targets)
    linkedOf.set(ctx.targets, checkouts)
    const where = { home: homeOf(ctx), targets: ctx.targets, checkouts, ownDirs: own }
    for (const [key, { path, trusted }] of folders) {
      out.set(key, pathProblem(path, { ...where, trusted }))
    }
    return out
  }

  /** The checkouts of the targets' repositories, primary first, ignored ones left out. */
  const checkoutsNow = (ctx: Ctx): Checkout[] => {
    const all =
      checkoutsOfRun.get(ctx.targets) ??
      checkoutsOf({ kit, git: undefined, idleHours: at.idleHours, ctx })
    checkoutsOfRun.set(ctx.targets, all)
    return all.filter((c) => present(c.path))
  }

  /**
   * How long `path` has sat unchanged: a folder by everything in it, a file (a
   * glob may match one) by itself. Throws when it is gone, before or while it is
   * measured, so it gives no row: the kit reads a gone folder as an empty one.
   */
  const idleOf = (path: string): Idle => {
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (stat === undefined) throw new Error(`${path} is gone`)
    if (!stat.isDirectory()) {
      const hours = Math.max(0, (Date.now() - stat.mtimeMs) / HOUR_MS)
      return { unmeasured: false, newestMs: stat.mtimeMs, hours }
    }
    const idle = kit.idle(path)
    if (!present(path)) throw new Error(`${path} is gone`)
    return idle
  }

  const thresholdOf = (entry: { idleHours?: number | undefined }): number =>
    entryIdleHours(entry.idleHours, at.idleHours, at.idleHoursFrom)

  const projectThreshold = (builds: readonly Project[]): number =>
    Math.max(...builds.map((p) => thresholdOf(p.entry)))

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

  /**
   * Build folders beside a marker under `walk`, in `checkout`, for every
   * `project` entry in one walk. A folder that `isWalk` has a walk of its own.
   */
  const projectRows = (
    checkout: string,
    walk: string,
    isWalk: (path: string) => boolean,
  ): Row[] => {
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
        if (isWalk(path)) continue
        const builds = here.filter((p) => p.entry.dir === e.name)
        if (builds.length > 0) {
          const row = projectRow(builds, checkout, path)
          if (row !== null) rows.push(row)
        } else if (!NOT_WALKED.has(e.name) && !e.name.startsWith('.')) visit(path)
      }
    }
    visit(walk)
    // In `project` order, as one walk per entry listed them.
    const order = (r: Row): number => (r.candidate.evidence as Evidence).project ?? 0
    return rows.sort((x, y) => order(x) - order(y))
  }

  /** The row for the build folder at `path` that each of `builds` gives: by the highest of their thresholds, at the highest of their costs. */
  const projectRow = (builds: readonly Project[], checkout: string, path: string): Row | null => {
    if (containedIn([checkout], path) === null) return null
    let idle
    try {
      idle = idleOf(path)
    } catch {
      return null
    }
    const threshold = projectThreshold(builds)
    const marker = builds.map((p) => p.entry.marker).join(' and ')
    const costDescription = costliest(builds.map((p) => p.entry.costDescription))
    const evidence: Evidence = { path, project: builds[0]!.index, checkout }
    if (idle.unmeasured) {
      return {
        checkout,
        objections: [],
        candidate: kit.candidate({
          kind: name,
          path,
          why: `a ${marker} build folder whose last change could not be measured in the time budget`,
          costDescription,
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
            ? `a ${marker} build folder that holds no file`
            : `a ${marker} build folder ${idleNow ? 'unchanged for' : 'changed'} ${hoursText(idle.hours)} hours${idleNow ? '' : ' ago'} (threshold ${threshold})`,
        costDescription,
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
    const reported = new Set<string>()
    for (const [index, entry] of d.candidates.entries()) {
      const folder = folders.get(entry.path)?.path
      if (folder === undefined || !present(folder)) continue
      const action = actionOf(entry)
      refused ??= problems(ctx)
      const problem = refused.get(entry.path) ?? null
      if (problem !== null) {
        // Listed once, so `status` says why, but nothing under it is measured.
        if (reported.has(folder)) continue
        reported.add(folder)
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
      // By real path, each with its own walk: one inside another is walked once.
      const walks = new Map<string, { checkout: string; walk: string }>()
      for (const checkout of checkoutsNow(ctx)) {
        for (const walk of walkedIn(checkout, ctx.targets)) {
          const real = realOr(walk)
          if (!walks.has(real)) walks.set(real, { checkout: checkout.path, walk })
        }
      }
      const names = new Set([...walks.keys()].map((real) => basename(real)))
      const isWalk = (path: string): boolean => names.has(basename(path)) && walks.has(realOr(path))
      for (const { checkout, walk } of walks.values()) {
        rows.push(...projectRows(checkout, walk, isWalk))
      }
    }
    return rows
  }

  /**
   * The glob matches past `maxEntries`, combined into one candidate at the
   * first of them that removes each, since the core lets only a path
   * candidate remove folders. Held when any of them changed within the
   * threshold. All of them together get the time of one measurement, for idle
   * and then for size: past it they are unmeasured, or of unknown size. One
   * that cannot be read is not deleted.
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
    const read: string[] = []
    let changed = 0
    let unmeasured = false
    let late = afterBudget()
    for (const match of matches) {
      unmeasured = late()
      if (unmeasured) break
      let idle
      try {
        idle = idleOf(match)
      } catch {
        continue
      }
      read.push(match)
      unmeasured = idle.unmeasured
      if (idle.unmeasured) break
      if (idle.hours !== null && idle.hours < threshold) changed++
    }
    const [path] = matches
    if (path === undefined || (read.length === 0 && !unmeasured)) return null
    let bytes: number | null = unmeasured ? null : 0
    late = afterBudget()
    for (const match of read) {
      if (bytes === null) break
      const size = late() ? null : kit.size(match)
      bytes = size === null ? null : bytes + size
    }
    const since = unmeasured
      ? 'when they last changed could not be measured in the time budget'
      : changed === 0
        ? `none changed in ${threshold} hours`
        : `${changed} changed in the last ${threshold} hours`
    const evidence: Evidence = {
      path: folder,
      rest: { matches: matches.length, digest: digestOf(matches) },
      candidate: index,
      action,
    }
    return {
      objections: [],
      rest: [...matches],
      candidate: kit.candidate({
        kind: name,
        path,
        why: `${matches.length} matches of ${entry.glob} past the first ${max}, from this one on, as one; ${since}; each removed as a folder`,
        costDescription: entry.costDescription,
        evidence,
        ...(bytes === null ? {} : { bytes }),
        ...(unmeasured ? { unmeasured: true } : {}),
        ...(entry.held === true || changed > 0 ? { held: true } : {}),
      }),
    }
  }

  /**
   * `found` by id, each folder that two of them give refused in both, since
   * which of their entries would delete it is not clear; of two with one id,
   * the first.
   */
  const byId = (found: readonly Row[]): Map<string, Row> => {
    const out = new Map<string, Row>()
    const giver = new Map<string, Row>()
    for (const row of found) {
      for (const path of row.rest ?? [row.candidate.path!]) {
        const real = realOr(path)
        const had = giver.get(real)
        giver.set(real, had ?? row)
        if (had === undefined) continue
        for (const r of [had, row]) {
          if (r.objections.some((o) => o.code === DUPLICATE_ENTRY)) continue
          r.objections.push({
            level: 'refuse',
            code: DUPLICATE_ENTRY,
            reason: `two entries of ${name} give ${path}; which one deletes it is not clear`,
          })
        }
      }
      if (!out.has(row.candidate.id)) out.set(row.candidate.id, row)
    }
    return out
  }

  /** The `inUse` objections now: a running process or a lock file refuses every candidate. */
  const inUseNow = (ctx: Ctx): Row['objections'] => {
    const out: Row['objections'] = []
    // One process may match several of the names.
    const names = new Set<string>()
    let unknown: string | undefined
    for (const program of d.inUse?.processes ?? []) {
      const found = kit.running(program, ctx)
      for (const n of found.names) names.add(n)
      unknown = found.unknown
      if (unknown !== undefined) break
    }
    if (names.size > 0) {
      out.push({ level: 'refuse', code: IN_USE, reason: `running: ${[...names].join(', ')}` })
    }
    if (unknown !== undefined) out.push(unreadable(unknown))
    for (const file of locks) {
      if (present(file))
        out.push({ level: 'refuse', code: IN_USE, reason: `the lock ${file} exists` })
    }
    for (const reason of unknownLocks) out.push({ level: 'refuse', code: IN_USE, reason })
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
    for (const [key, { path }] of folders) if (refused.get(key) === null) out.add(path)
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
   * Why `path`, of `c`, is no longer as idle as the plan had it, or null: one
   * the plan ran as idle may not have changed within `threshold` hours since,
   * nor be unmeasured now, by the rules of `checkAgain` (`../helpers.ts`).
   */
  const notIdle = (c: Candidate, path: string, threshold: number): string | null => {
    let idle
    try {
      idle = idleOf(path)
    } catch {
      return UNREADABLE
    }
    if (idle.unmeasured) {
      return c.unmeasured === true ? null : 'it could not be measured idle in the time budget now'
    }
    return c.held !== true && idle.hours !== null && idle.hours < threshold
      ? `it is no longer idle: it changed ${hoursText(idle.hours)} hours ago (threshold ${threshold})`
      : null
  }

  /**
   * Why the candidate `c`, which deletes `paths`, may not be deleted now, or
   * null: the entry that gave it must still give it, under the same checks
   * and deleted the same way, as idle as the plan had it, and nothing in
   * `inUse`, or for a build folder in its checkout, may be running. The idle
   * check of a combined candidate is {@link removeRest}'s.
   */
  const refusal = (c: Candidate, paths: readonly string[], ctx: Ctx): string | null => {
    const ev = c.evidence as Evidence
    const live: Row['objections'] = []
    let idle: string | null = null
    if (ev.project !== undefined) {
      const path = paths[0]!
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
      const builds = projects.filter(
        (p) => p.entry.dir === entry.dir && marked(dirname(path), p.marker),
      )
      idle = notIdle(c, path, projectThreshold([project, ...builds]))
      live.push(...liveIn(checkout, ctx))
    } else {
      const refused = problems(ctx)
      const now = rootPaths(refused)
      // Of a combined candidate, the reason names the match at fault.
      const named = (p: string): string => (ev.rest === undefined ? 'it' : p)
      const realNow = new Set(now.map(realOr))
      for (const p of paths) {
        if (!realNow.has(realOr(p)) && containedIn(now, p) === null) {
          return `${named(p)} is not inside ${name}'s roots`
        }
      }
      const entry = d.candidates[ev.candidate ?? -1]
      const folder = entry === undefined ? undefined : folders.get(entry.path)?.path
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
      // A prune removes only what nothing uses: no idle check.
      const prune = entry.removes === 'unused' && ev.action === 'command'
      if (!prune && ev.rest === undefined) idle = notIdle(c, paths[0]!, thresholdOf(entry))
    }
    if (idle !== null) return idle
    const busy = [...inUseNow(ctx), ...live]
    return busy.length === 0 ? null : busy.map((b) => b.reason).join('; ')
  }

  let rows = new Map<string, Row>()

  /**
   * Removes the matches of the combined candidate `c` that the last survey
   * listed: none of them when one is no longer idle, and each checked once
   * more right before it goes. One that cannot be read or removed does not stop
   * the others; one that changed meanwhile does. Throws, with what was removed,
   * when not all of them were.
   */
  const removeRest = async (c: Candidate, ctx: Ctx): Promise<string> => {
    const ev = c.evidence as Evidence
    const matches = rows.get(c.id)?.rest
    if (matches === undefined || digestOf(matches) !== ev.rest?.digest) {
      throw new Error(`${c.id} was not deleted: the last survey did not list its matches`)
    }
    const left = matches.filter(present)
    if (left.length === 0) return `already gone: every match of ${c.id}`
    const link = left.find(isLink)
    if (link !== undefined) throw new Error(`${link} is now a symlink; it is not followed`)
    const why = refusal(c, left, ctx)
    if (why !== null) throw new Error(`${c.id} was not deleted: ${why}`)
    const threshold = thresholdOf(d.candidates[ev.candidate!]!)
    const kept: string[] = []
    const idle: string[] = []
    for (const p of left) {
      await yieldToLimit(ctx)
      if (!present(p)) continue
      const changed = notIdle(c, p, threshold)
      if (changed === null) idle.push(p)
      else if (changed === UNREADABLE) kept.push(`${p}: ${changed}`)
      else throw new Error(`${c.id} was not deleted: ${p}: ${changed}`)
    }
    const done: string[] = []
    const fails: string[] = []
    let untried = idle.length
    for (const p of idle) {
      try {
        await yieldToLimit(ctx)
      } catch (err) {
        fails.push(errorText(err))
        break
      }
      untried--
      const changed = present(p) ? notIdle(c, p, threshold) : null
      if (changed !== null) fails.push(`${p}: ${changed}`)
      if (changed !== null && changed !== UNREADABLE) break
      if (changed !== null) continue
      try {
        done.push(kit.remove(p, ctx))
      } catch (err) {
        fails.push(`${p}: ${errorText(err)}`)
      }
    }
    if (fails.length === 0 && done.length > 0) {
      return [...done, ...kept.map((k) => `left ${k}`)].join('; ')
    }
    throw new Error(
      [
        `removed ${done.length} of ${left.length} matches`,
        ...done,
        ...[...fails, ...kept].map((f) => `not removed: ${f}`),
        ...(untried === 0 ? [] : [`${untried} not tried`]),
      ].join('; '),
    )
  }

  // detect's limit covers every variable's commands as if they ran one at a time.
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
      const skip = skipReason(d)
      if (skip !== undefined) return { active: false, note: skip }
      if (d.supersededBy !== undefined && (await at.runs(d.supersededBy, ctx)) === true) {
        return { active: false, note: `skipped: the plugin ${d.supersededBy} runs instead` }
      }
      const vars = await refresh(ctx)
      const holds = (c: { onPath?: string | undefined; exists?: string | undefined }): boolean => {
        if (c.onPath !== undefined) return kit.onPath(c.onPath)
        const folder = c.exists === undefined ? undefined : folders.get(c.exists)?.path
        return folder !== undefined && present(folder)
      }
      const active = (): boolean => {
        if (d.detect?.all !== undefined) return d.detect.all.every(holds)
        if (d.detect?.any !== undefined) return d.detect.any.some(holds)
        return [...folders.values()].some((f) => present(f.path))
      }
      const shownVars = Object.entries(vars).filter(([n]) => shown.has(n))
      if (leftOut === undefined && shownVars.length === 0) return active()
      return {
        active: active(),
        ...(leftOut === undefined ? {} : { note: leftOut }),
        ...(shownVars.length === 0 ? {} : { vars: Object.fromEntries(shownVars) }),
      }
    },
    async roots(ctx): Promise<Root[]> {
      await ready(ctx)
      return rootPaths(problems(ctx)).map((path) => ({ path, self: true }))
    },
    async discover(ctx) {
      await ready(ctx)
      rows = byId(rowsNow(ctx))
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
      await ready(ctx)
      const ev = c.evidence as Evidence
      if (ev.rest !== undefined) return removeRest(c, ctx)
      const path = c.path
      if (path === undefined) throw new Error(`${c.id} is not a folder`)
      if (isLink(path)) throw new Error(`${path} is now a symlink; it is not followed`)
      if (!present(path)) return `already gone: ${path}`
      const why = refusal(c, [path], ctx)
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

/** How a command that never exited ended: only one that did not start is sure to have removed nothing. */
const ended = (reason: NeverExitedReason | undefined): string =>
  reason === 'spawn'
    ? 'did not run'
    : `stopped before it exited (${reason ?? 'unknown'}); it may have removed part of the folder`

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
    const said = firstLine(failureText(r, { both: true }))
    throw new Error(
      `${argv.join(' ')} failed (${r.neverExited === true ? ended(r.reason) : `exit ${r.exitCode}`})${said === '' ? '' : `: ${said}`}`,
    )
  }
  return `ran ${argv.join(' ')}; ${bytesText(before)} before, ${bytesText(kit.size(real))} after`
}

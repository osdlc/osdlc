/**
 * The session core: what one run of wayfinder knows about one repository,
 * and the operations every surface shares. See `README.md` beside this file
 * for how the CLI, the terminal UI and the web view use it.
 */

import { isAbsolute, relative, resolve, sep } from 'node:path'

import { commandString } from '@osdlc/command-seam/quote'
import { closestMatches } from '@osdlc/config-layers/did-you-mean'
import type {
  Catalog,
  Project,
  RunnerCacheState,
  RunnerReport,
  Task,
} from '@osdlc/system-model/detect'
import {
  homeDir,
  parseTrustScope,
  policyExecGate,
  withheldHint,
  type ExecGate,
  type PolicyDecisionOptions,
} from '@osdlc/trust-repo'

import { BIN, PROJECT_CONFIG_FILENAME } from '../app.ts'
import { cacheDir } from '../cache.ts'
import { settingLayer } from '../config-keys.ts'
import {
  collectAndCache,
  fromStore,
  makeProject,
  orderedCatalog,
  projectRootFor,
  readCachedCatalog,
  runnerIds,
  settledBoth,
  type WayOptions,
} from '../catalog.ts'
import {
  ConfigError,
  collectOptionsFromConfig,
  readSettings,
  trustPolicyFromConfig,
  writeSetting,
  trustPolicyOptions,
  type LoadedConfig,
  type Settings,
} from '../config.ts'
import { readSkills } from '../skills.ts'
import { toolSummary, type ToolSummary } from '../tool-info.ts'
import { VERSION } from '../version.ts'
import { loadTools, ToolModuleError, type LoadedTool } from '../tools.ts'
import { appTrustStore } from '../trust-store.ts'
import { EDITOR_VARIABLE_LABEL, type WithheldReason } from '../vocabulary.ts'
import { taskCopyText } from './copy-text.ts'
import { filterTasks, type TaskFilter, type TaskHit } from './filter.ts'
import { readView, viewKey, writeView } from './saved-view.ts'
import { flushWrites } from './writes.ts'
import { filterSkills, type SkillHit, type SkillRow } from './skills.ts'
import { execOffSource, unknownsOf, type Unknown } from './unknowns.ts'

/**
 * Why a session could not start, or an operation was refused. `code` is
 * stable, for an error document.
 */
export class SessionError extends Error {
  readonly code:
    | 'no-such-directory'
    | 'config'
    | 'tool-module'
    | 'not-trustable'
    | 'task-not-found'
    | 'ambiguous-task'
    | 'not-runnable'
    | 'bad-arguments'
    | 'task-changed'
  /** A sentence on what to do, when there is one. */
  readonly hint: string | undefined
  constructor(code: SessionError['code'], message: string, hint?: string) {
    super(message)
    this.name = 'SessionError'
    this.code = code
    this.hint = hint
  }
}

/**
 * The choices a command line makes for one run. Each field is absent unless
 * its flag was given, so the config files can answer instead.
 */
export interface SessionFlags {
  /** `--exec` or `--no-exec`. */
  allowExec?: boolean | undefined
  /** `--only`: restrict to these runners. */
  only?: string[] | undefined
  /** `--exclude`: skip these runners, replacing the configured `runners.disabled`. */
  exclude?: string[] | undefined
  /** `--exclude-path`, replacing the configured list. */
  excludePaths?: string[] | undefined
  discovery?: 'git' | 'walk' | 'auto' | undefined
  /** `--config` modules of extra tools, as typed. */
  toolModules?: readonly string[] | undefined
}

/** What {@link createSession} needs. */
export interface SessionOptions {
  /** The start directory, absolute or relative to `cwd`. It must exist. */
  dir: string
  /** The working directory: the base for a relative `dir` and `--config` paths. */
  cwd: string
  /** The environment config, trust and cache paths are read from. */
  env: Record<string, string | undefined>
  /** The home directory. Default: the OS account's. */
  home?: string | undefined
  flags?: SessionFlags | undefined
  /** Aborts every probe this session starts. */
  signal?: AbortSignal | undefined
}

/** One runner's cache verdict, with the measured time of a probe made just now. */
export type CacheState = RunnerCacheState & {
  /** How long this runner's probe took, when it was probed in this call. */
  probeMs?: number | undefined
}

/**
 * What a probe reports while it runs, so a surface can draw each runner as
 * it answers. See {@link Session.catalog}.
 */
export interface CatalogProgress {
  /** Once, before any runner answers: every runner this call probes. */
  onRunners?(runners: readonly string[]): void
  /**
   * Once per runner, as it answers, a withheld runner included: its report
   * and its cache state. The snapshot `catalog` resolves with is still the
   * answer to show; it can add a diagnostic this report lacks.
   */
  onRunner?(report: RunnerReport, cache: CacheState): void
  /**
   * Once, as soon as the agent skills are read: before, between or after the
   * runners. The snapshot holds the same rows.
   */
  onSkills?(skills: readonly SkillRow[]): void
}

/** A catalog and where each runner's rows came from. */
export interface CatalogSnapshot {
  /** Grouped and in the configured runner order. */
  catalog: Catalog
  /** One entry per selected runner. */
  cache: CacheState[]
  /** The agent skills for the Skills group, as the `skills` setting chooses. */
  skills: SkillRow[]
  /**
   * `probe`: every runner was probed now. `store`: from the stored probe,
   * with any runner missing from it probed now. `empty-store`: a stored
   * answer was asked for, but there was none, so it was probed now.
   * `saved`: the view the last probe or store read showed, not checked
   * against the files (see {@link Session.savedCatalog}).
   */
  origin: 'probe' | 'store' | 'empty-store' | 'saved'
}

/** The facts behind a settings screen. */
export interface SettingsSnapshot {
  root: string
  /** Every setting and its source, from the reader `way config` uses. */
  settings: Settings
  /** Whether this session runs the repository's tools. */
  allowExec: boolean
  /** Why {@link allowExec} came out as it did. */
  reason: ExecGate['reason']
  trusted: boolean
  /** Whether a trust grant would change this session's execution. */
  trustable: boolean
  /** Every registered tool's description, homepage and language, in registry order. */
  tools: ToolSummary[]
  /**
   * The tool ids trusted on their own, by a `--scope` grant or `trust.tools`
   * in the user config. Empty when the repository is trusted as a whole, or
   * trust does not decide execution.
   */
  trustedTools: string[]
}

/** What {@link Session.saveSetting} wrote. */
export interface SavedSetting {
  key: string
  /** The file it was written to. */
  file: string
  layer: 'user' | 'project'
  /** A command-line flag decides this setting for the rest of this session. */
  pinned: boolean
  /** The settings as read back after the write. */
  snapshot: SettingsSnapshot
}

/** What a trust grant or revoke changed. */
export interface TrustChange {
  /** False when the store already said so. */
  changed: boolean
  /** A sentence to show, such as that project tools load on the next start. */
  note?: string | undefined
}

/** A task ready to run: what to spawn, where, and with which variables. */
export interface RunPlan {
  task: Task
  /** The argv to spawn, without a shell. `argv[0]` is always the task's own. */
  argv: string[]
  /** Variables the task's `env` parameters set, added to the environment. */
  env: Record<string, string>
  /** Absolute. */
  cwd: string
}

/** One run of wayfinder over one repository. */
export interface Session {
  /** The project root the start directory is in. */
  readonly root: string
  /** The config as last read: at start, then after {@link reloadSettings} or {@link saveSetting}. */
  readonly config: LoadedConfig
  /** Warnings from the config files and the tool modules, for stderr. */
  readonly warnings: readonly string[]
  /** The execution decision. A trust grant updates it. */
  readonly gate: ExecGate
  readonly project: Project
  /** The tools loaded from modules, beside the built-ins. */
  readonly tools: readonly LoadedTool[]
  /**
   * The collect options. A trust grant, a saved setting and a reload change
   * them in place, so a probe always uses the current ones.
   */
  readonly options: WayOptions
  /** The project file names tools that were not loaded, because execution is not allowed. */
  readonly projectToolsPending: boolean
  /** The collect options a flag set, which a saved setting must not undo. */
  readonly pinnedByFlag: readonly string[]
  /** Where probes are stored. */
  readonly store: string
  readonly env: Record<string, string | undefined>
  readonly home: string
  /** `runners.order` from the config as last read. */
  runnerOrder(): string[] | undefined
  /** Why withheld runners are withheld, or null when execution is allowed. */
  withheldReason(): WithheldReason | null
  /**
   * The catalog. Probed fresh by default, since a script must not get an old
   * answer without being told. `cached` answers with {@link savedCatalog}
   * when there is one, which checks nothing; else it reads the store, which
   * checks each runner's files, and probes only the runners missing from it.
   * A probe always writes the store. `signal`
   * stops this call's probes as well as the session's own signal.
   * `progress` hears about each runner this call probes as it answers; an
   * answer from the saved view or the store probes none.
   */
  catalog(opts?: {
    cached?: boolean
    signal?: AbortSignal | undefined
    progress?: CatalogProgress | undefined
  }): Promise<CatalogSnapshot>
  /**
   * The catalog from the store alone, probing nothing: for a first paint
   * before a probe. Null when the store has no answer for this project. A
   * runner missing from the store is missing from the catalog.
   */
  storedCatalog(): Promise<CatalogSnapshot | null>
  /**
   * The catalog the last {@link catalog} call showed, in this process or
   * another, read from one file without detecting or hashing anything: for
   * a first paint in well under a second. Not checked against the files, so
   * probe after drawing it. Null when nothing was saved under this session's
   * trust and settings. Each `cache[].ageMs` counts from the probe.
   */
  savedCatalog(): Promise<CatalogSnapshot | null>
  /**
   * Before a task from a saved or stored listing runs: probe its runner
   * alone, and return the plan for the task as that probe sees it. Throws
   * {@link SessionError} `task-changed` when the task is gone, or its argv or
   * cwd differ from `plan`'s; the message shows the new command line. A
   * dry run does not need this.
   */
  confirmRun(plan: RunPlan, args?: readonly string[], signal?: AbortSignal): Promise<RunPlan>
  /**
   * What decides which rows a probe returns here: trust, the collect
   * options, the skills setting and the tools. Two sessions with the same
   * key read the same catalog.
   */
  viewKey(): string
  /** The tasks of `catalog` that pass `filter`, best first when there is a query. */
  search(catalog: Pick<Catalog, 'reports'>, filter: TaskFilter): TaskHit[]
  /** The skills that pass `filter`, matched as {@link search} matches tasks. */
  searchSkills(skills: readonly SkillRow[], filter: TaskFilter): SkillHit[]
  /** Everything this session could not know about `snapshot`. */
  unknowns(snapshot: { catalog: Pick<Catalog, 'reports'>; cache: readonly CacheState[] }): Unknown[]
  /** Whether a trust grant would change this session's execution. */
  trustable(): boolean
  /**
   * Trust the repository and allow execution for the rest of this session.
   * With `scope`, a tool or runner id, trust only that tool: a runner runs
   * once it and each tool manager that wraps it are trusted (see the
   * `missing` of a withheld unknown). Throws {@link SessionError}
   * `not-trustable` when trust is not what withholds execution, and
   * `bad-arguments` for a scope that cannot be a grant. Probe again
   * afterwards.
   */
  grantTrust(scope?: string): Promise<TrustChange>
  /**
   * Remove the repository's trust grant, or with `scope` that tool's. A
   * whole-repository revoke leaves this session's execution as it is until
   * it ends; a tool revoke applies to the next probe.
   */
  revokeTrust(scope?: string): Promise<TrustChange>
  /**
   * The trust scopes `runner` needs that are not trusted, as of the last
   * probe. Empty when it may run; undefined when per-tool trust does not
   * apply (the repository is trusted, or execution is off).
   */
  missingScopes(runner: string): string[] | undefined
  /** The settings as last read, with this session's execution and trust. */
  settings(): SettingsSnapshot
  /**
   * Read the config files again, so {@link settings} shows edits made
   * elsewhere. The collect options and the `skills` setting follow, except
   * where a flag decided. Throws {@link SessionError} `config`.
   */
  reloadSettings(): Promise<SettingsSnapshot>
  /**
   * Save one setting, as a settings screen does, then read the files back as
   * {@link reloadSettings} does. The file comes from `settingLayer`: the
   * user file for a user-only key, the file that sets `runners.order`, else
   * the project file. Throws {@link SessionError} `config` for a value the
   * key does not take or a file that cannot be written or read back; the
   * message starts with `not saved:` or `saved to <file>, but`.
   */
  saveSetting(key: string, value: unknown): Promise<SavedSetting>
  /**
   * The task `id` names (an id, or a line from `list` or a `display` only
   * one task has), with `args` bound the way its tool expects. The
   * same rules as the terminal UI and the web view. Throws
   * {@link SessionError}: `task-not-found`, `ambiguous-task`, `not-runnable` or
   * `bad-arguments`.
   */
  resolveRun(catalog: Pick<Catalog, 'reports'>, id: string, args?: readonly string[]): RunPlan
}

/**
 * Load the tool modules this run names and build the project over them.
 * Throws {@link SessionError} `tool-module` when a module cannot be used.
 */
async function projectFor(
  toolModules: readonly string[],
  cfg: LoadedConfig,
  cwd: string,
  home: string,
  projectAllowed: boolean,
): Promise<{ project: Project; tools: LoadedTool[]; warnings: string[] }> {
  let loaded: Awaited<ReturnType<typeof loadTools>>
  try {
    loaded = await loadTools({ flag: toolModules, cwd, config: cfg, home, projectAllowed })
  } catch (err) {
    if (err instanceof ToolModuleError) throw new SessionError('tool-module', err.message)
    throw err
  }
  try {
    return { project: makeProject(loaded.tools.map((t) => t.def)), ...loaded }
  } catch (err) {
    // Every tool here passed loadTools, so a registry refusal (such as an
    // ecosystem id a built-in already uses) comes from the modules.
    const modules = [...new Set(loaded.tools.map((t) => t.module))].join(', ')
    const message = err instanceof Error ? err.message : String(err)
    throw new SessionError('tool-module', `${message} (from a tool module: ${modules})`)
  }
}

/**
 * Every scope a tool grant can name for `project`: each runner's id, and
 * each tool manager that wraps commands (`mise exec`), since a runner it
 * wraps needs it trusted too.
 */
function toolTrustScopes(project: Project): string[] {
  const wrappers = project.tools.filter((t) => t.roles.toolManager?.exec !== undefined)
  return [...new Set([...runnerIds(project), ...wrappers.map((t) => t.id)])]
}

/** `opts` with an `ownerOf` that runs git at most once per root. */
function onceOwner(opts: PolicyDecisionOptions): PolicyDecisionOptions {
  const ownerOf = opts.ownerOf
  if (ownerOf === undefined) return opts
  const seen = new Map<string, ReturnType<typeof ownerOf>>()
  return {
    ...opts,
    ownerOf: (root) => {
      let owner = seen.get(root)
      if (owner === undefined) {
        owner = ownerOf(root)
        seen.set(root, owner)
      }
      return owner
    },
  }
}

/** A scope a person typed, checked as `way trust --scope` checks it. */
function parseScope(scope: string): string {
  try {
    return parseTrustScope(scope)
  } catch (err) {
    throw new SessionError('bad-arguments', err instanceof Error ? err.message : String(err))
  }
}

/** The collect option a flag sets, for each setting a settings screen saves. */
const FLAG_OF_SETTING: Readonly<Record<string, string>> = {
  'runners.disabled': 'exclude',
  discovery: 'discovery',
  excludePaths: 'excludePaths',
}

/** A config error as a session error; anything else unchanged. */
function asSessionError(err: unknown, prefix = ''): unknown {
  if (err instanceof ConfigError) return new SessionError('config', prefix + err.message)
  return err
}

/** The fresh state of a runner probed just now, with its measured time when it ran. */
function probedState(runner: string, probeMs: number | undefined): CacheState {
  return {
    runner,
    state: 'fresh',
    ageMs: 0,
    estimateMs: probeMs ?? null,
    slow: false,
    ...(probeMs !== undefined ? { probeMs } : {}),
  }
}

/** Fresh states for a catalog probed just now, with each runner's measured time. */
function probedStates(catalog: Catalog, times: ReadonlyMap<string, number>): CacheState[] {
  return catalog.reports.map((r) => probedState(r.runner, times.get(r.runner)))
}

/**
 * Start a session: find the root, load config, decide execution against the
 * trust store, and load tool modules. Throws {@link SessionError} for a start
 * directory that does not exist, a config file that cannot be used, or a tool
 * module that cannot be loaded.
 */
export async function createSession(opts: SessionOptions): Promise<Session> {
  const env = opts.env
  const home = opts.home ?? homeDir()
  const flags = opts.flags ?? {}
  const start = isAbsolute(opts.dir) ? opts.dir : resolve(opts.cwd, opts.dir)
  const root = await projectRootFor(start)
  if (root === null) {
    throw new SessionError('no-such-directory', `${opts.dir}: no such directory`)
  }

  let settings: Settings
  try {
    settings = await readSettings(root, env, home)
  } catch (err) {
    throw asSessionError(err)
  }
  const config = settings.loaded

  // Precedence for allowExec, highest first: --exec / --no-exec, then
  // allowExec in the project file (false only), then the user file, then
  // the built-in default (true). Trust is decided here; collection never
  // reads the trust store.
  const configured = settings.allowExec.value
  const trustStore = appTrustStore({ env, home })
  const policy = trustPolicyFromConfig(config.effective)
  const policyOptions = onceOwner(trustPolicyOptions(home))
  let gate = await policyExecGate(
    trustStore,
    policy,
    { root, configured, flag: flags.allowExec },
    policyOptions,
  )

  // A project module runs code on import, so it needs execution allowed as
  // well as trust.
  const projectAllowed = gate.trusted && gate.allowExec
  const built = await projectFor(flags.toolModules ?? [], config, opts.cwd, home, projectAllowed)
  const projectToolsPending = !projectAllowed && (config.layers.project?.tools?.length ?? 0) > 0

  // The config's own allowExec was consumed by the gate.
  const { allowExec: _consumed, ...configOptions } = collectOptionsFromConfig(config.effective)
  // Config first, flags second. --exclude REPLACES runners.disabled.
  const options: WayOptions = {
    ...configOptions,
    allowExec: gate.allowExec,
    // Only when trust is what is missing: when a file turned execution off,
    // trusting the repository would change nothing.
    ...(gate.reason === 'untrusted' ? { execWithheldHint: withheldHint(BIN) } : {}),
    ...(flags.only ? { only: flags.only } : {}),
    ...(flags.exclude ? { exclude: flags.exclude } : {}),
    ...(flags.excludePaths ? { excludePaths: flags.excludePaths } : {}),
    ...(flags.discovery !== undefined ? { discovery: flags.discovery } : {}),
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  }
  const pinnedByFlag = [
    ...(flags.exclude ? ['exclude'] : []),
    ...(flags.excludePaths ? ['excludePaths'] : []),
    ...(flags.discovery !== undefined ? ['discovery'] : []),
  ]
  // Per-tool trust applies only when the repository's own trust is what
  // withholds execution. The set is read on every probe, so a tool grant in
  // this session applies to the next one.
  const toolTrusted = new Set<string>()
  let scopesByRunner: ReadonlyMap<string, readonly string[]> = new Map()
  const toolScopes = gate.reason === 'untrusted' ? toolTrustScopes(built.project) : ([] as string[])
  const decideTools = async (): Promise<void> => {
    toolTrusted.clear()
    if (toolScopes.length === 0) return
    const decided = await policyExecGate(
      trustStore,
      policy,
      { root, configured: true, scopes: toolScopes },
      policyOptions,
    )
    for (const [scope, d] of Object.entries(decided.decisions))
      if (d.trusted) toolTrusted.add(scope)
  }
  await decideTools()
  if (toolScopes.length > 0) {
    options.toolTrust = {
      trusted: toolTrusted,
      onScopes: (scopes) => {
        scopesByRunner = scopes
      },
    }
  }
  const skills = (): Promise<SkillRow[]> =>
    readSkills(root, { setting: settings.skills.value, home, env, signal: opts.signal })
  /** The skills, told to `progress` as soon as they are read. */
  const toldSkills = async (progress?: CatalogProgress): Promise<SkillRow[]> => {
    const rows = await skills()
    progress?.onSkills?.(rows)
    return rows
  }
  const store = cacheDir(env, home)
  const runnerOrder = (): string[] | undefined => settings.loaded.effective.runners?.order

  /** Take `next` as the settings: the collect options follow, except where a flag decided. */
  const adopt = (next: Settings): void => {
    settings = next
    const derived = collectOptionsFromConfig(next.loaded.effective) as Record<string, unknown>
    const target = options as unknown as Record<string, unknown>
    for (const key of ['exclude', 'discovery', 'excludePaths', 'probeTimeoutMs'] as const) {
      if (pinnedByFlag.includes(key)) continue
      if (derived[key] === undefined) delete target[key]
      else target[key] = derived[key]
    }
  }
  const reread = async (prefix = ''): Promise<void> => {
    try {
      adopt(await readSettings(root, env, home))
    } catch (err) {
      throw asSessionError(err, prefix)
    }
  }
  const trustable = (): boolean => options.execWithheldHint !== undefined

  /** The options, stopped by this call's `signal` as well as the session's. */
  const withSignal = (signal?: AbortSignal): WayOptions => {
    const signals = [options.signal, signal].filter((s) => s !== undefined)
    return signals.length > 0 ? { ...options, signal: AbortSignal.any(signals) } : options
  }

  /** Probe the runners `only` names (all when absent), timing each and telling `progress`. */
  const probe = async (
    only?: string[],
    signal?: AbortSignal,
    progress?: CatalogProgress,
  ): Promise<{ catalog: Catalog; times: Map<string, number> }> => {
    const times = new Map<string, number>()
    const catalog = await collectAndCache(
      project,
      root,
      {
        ...withSignal(signal),
        ...(only !== undefined ? { only } : {}),
        onProbe: ({ runner, durationMs }) => times.set(runner, durationMs),
        ...(progress?.onRunners !== undefined
          ? { onRunners: (runners) => progress.onRunners?.(runners) }
          : {}),
        ...(progress?.onRunner !== undefined
          ? {
              onReport: (report) =>
                progress.onRunner?.(report, probedState(report.runner, times.get(report.runner))),
            }
          : {}),
      },
      store,
    )
    return { catalog, times }
  }

  const { project, tools } = built

  /** What decides which rows a probe returns; a saved view is used only under the same key. */
  const currentViewKey = (): string =>
    viewKey({
      version: VERSION,
      root,
      allowExec: options.allowExec ?? false,
      withheldHint: options.execWithheldHint !== undefined,
      toolTrusted: [...toolTrusted].sort(),
      only: options.only ?? null,
      exclude: options.exclude ?? null,
      discovery: options.discovery ?? null,
      excludePaths: options.excludePaths ?? null,
      skills: settings.skills.value,
      tools: project.tools.map((t) => t.id),
    })
  /** Save `snapshot` as the view a first paint draws, without waiting, and return it. */
  const saved = (snapshot: CatalogSnapshot): CatalogSnapshot => {
    void writeView(store, {
      key: currentViewKey(),
      savedAt: Date.now(),
      catalog: snapshot.catalog,
      cache: snapshot.cache.map(({ probeMs: _probeMs, ...rest }) => rest),
      skills: snapshot.skills,
      scopes: Object.fromEntries([...scopesByRunner].map(([r, s]) => [r, [...s]])),
    })
    return snapshot
  }
  const session: Session = {
    root,
    get config() {
      return settings.loaded
    },
    warnings: [...config.warnings, ...built.warnings],
    get gate() {
      return gate
    },
    project,
    tools,
    options,
    projectToolsPending,
    pinnedByFlag,
    store,
    env,
    home,
    runnerOrder,
    withheldReason() {
      if (gate.allowExec) return null
      return gate.reason === 'untrusted' ? 'untrusted' : 'exec-off'
    },
    async catalog(opts = {}) {
      if (opts.cached !== true) {
        // The skills are read beside the probe, so the answer does not wait
        // for both in turn. Both settle before a failure is thrown.
        const [{ catalog, times }, skillRows] = await settledBoth(
          probe(undefined, opts.signal, opts.progress),
          toldSkills(opts.progress),
        )
        return saved({
          catalog: orderedCatalog(catalog, runnerOrder()),
          cache: probedStates(catalog, times),
          skills: skillRows,
          origin: 'probe',
        })
      }
      const view = await session.savedCatalog()
      if (view !== null) return view
      // A probe in this process writes the store after it answers.
      await flushWrites()
      // The call's signal too: a closed tab stops hashing the store.
      const stored = await readCachedCatalog(project, root, withSignal(opts.signal), store)
      if (stored.catalog === null || !fromStore(stored)) {
        const [{ catalog, times }, skillRows] = await settledBoth(
          probe(undefined, opts.signal, opts.progress),
          toldSkills(opts.progress),
        )
        return saved({
          catalog: orderedCatalog(catalog, runnerOrder()),
          cache: probedStates(catalog, times),
          skills: skillRows,
          origin: 'empty-store',
        })
      }
      // A miss is a runner with nothing stored. Only the missing runners are probed.
      const missing = stored.runners.filter((r) => r.state === 'miss').map((r) => r.runner)
      if (missing.length === 0) {
        return saved({
          catalog: orderedCatalog(stored.catalog, runnerOrder()),
          cache: stored.runners,
          skills: await skills(),
          origin: 'store',
        })
      }
      // No progress here: it would name only the missing runners, while the
      // stored ones wait for the document.
      const { catalog: probed, times } = await probe(missing, opts.signal)
      const fresh = new Map(probedStates(probed, times).map((s) => [s.runner, s]))
      return saved({
        catalog: orderedCatalog(
          { ...stored.catalog, reports: [...stored.catalog.reports, ...probed.reports] },
          runnerOrder(),
        ),
        cache: stored.runners.map((r) => fresh.get(r.runner) ?? r),
        skills: await skills(),
        origin: 'store',
      })
    },
    async storedCatalog() {
      await flushWrites()
      const stored = await readCachedCatalog(project, root, options, store)
      if (stored.catalog === null || !fromStore(stored)) return null
      return {
        catalog: orderedCatalog(stored.catalog, runnerOrder()),
        cache: stored.runners,
        skills: await skills(),
        origin: 'store',
      }
    },
    viewKey: currentViewKey,
    async savedCatalog() {
      try {
        const view = await readView(store, root, currentViewKey())
        if (view === null) return null
        // The withheld unknowns name the scopes each runner needs, which a
        // probe would have reported. Only runner ids this session knows.
        if (toolScopes.length > 0) {
          const known = new Set(toolScopes)
          scopesByRunner = new Map(
            Object.entries(view.scopes)
              .filter(([runner]) => known.has(runner))
              .map(([runner, scopes]) => [runner, scopes.filter((s) => known.has(s))]),
          )
        }
        const since = Math.max(0, Date.now() - view.savedAt)
        return {
          catalog: orderedCatalog(view.catalog, runnerOrder()),
          cache: view.cache.map((r) =>
            r.state === 'miss' ? r : { ...r, ageMs: (r.ageMs ?? 0) + since },
          ),
          skills: view.skills,
          origin: 'saved',
        }
      } catch {
        return null
      }
    },
    async confirmRun(plan, args = [], signal) {
      const { catalog } = await probe([plan.task.runner], signal)
      const shown = plan.task.display
      const report = catalog.reports.find((r) => r.runner === plan.task.runner)
      const now = report?.tasks.filter((t) => t.id === plan.task.id) ?? []
      // A runner that failed, was withheld, or lost the task with a complaint
      // (an unparseable file) did not read the task's file cleanly.
      const complaint = report?.diagnostics.find((d) => d.severity !== 'info')
      const failed =
        report === undefined ||
        report.status === 'error' ||
        report.skippedForExec ||
        (now.length !== 1 && complaint !== undefined)
      if (failed) {
        const why = complaint === undefined ? '' : ` (${complaint.message})`
        throw new SessionError(
          'task-changed',
          `${shown}: not run; ${plan.task.runner} could not be read again${why}`,
          `"${BIN} list" shows what it reports now`,
        )
      }
      if (now.length !== 1) {
        throw new SessionError(
          'task-changed',
          `${shown}: not found when ${plan.task.runner} was read again; ` +
            'the listing it came from is out of date',
          `"${BIN} list" shows the tasks now`,
        )
      }
      const task = now[0]!
      const same =
        task.cwd === plan.task.cwd &&
        task.argv.length === plan.task.argv.length &&
        task.argv.every((a, i) => a === plan.task.argv[i])
      if (!same) {
        const line = taskCopyText(task, process.platform) ?? commandString(task.argv)
        throw new SessionError(
          'task-changed',
          `${shown}: changed since the listing it came from; it now runs: ${line}`,
          'nothing ran; run it again to run the new command',
        )
      }
      return resolveRun(project, root, catalog, task.id, args)
    },
    search(catalog, filter) {
      return filterTasks(catalog.reports, filter)
    },
    searchSkills(list, filter) {
      return filterSkills(list, filter)
    },
    unknowns(snapshot) {
      let withheld = session.withheldReason() ?? 'untrusted'
      // Once any tool is trusted here, a withheld runner is one whose own
      // tools are not.
      if (withheld === 'untrusted' && toolTrusted.size > 0) withheld = 'tool-untrusted'
      return unknownsOf({
        reports: snapshot.catalog.reports,
        cache: snapshot.cache,
        withheld,
        ...(withheld === 'exec-off' ? { execOff: execOffSource(settings) } : {}),
        missingScopes: (runner) => session.missingScopes(runner),
      })
    },
    missingScopes(runner) {
      if (gate.allowExec || toolScopes.length === 0) return undefined
      const needs = scopesByRunner.get(runner) ?? [runner]
      return needs.filter((s) => !toolTrusted.has(s))
    },
    trustable,
    async grantTrust(scope) {
      if (!trustable()) {
        throw new SessionError(
          'not-trustable',
          "a trust grant would not change this run's execution gate",
        )
      }
      if (scope !== undefined) {
        const parsed = parseScope(scope)
        const result = await trustStore.trust(root, parsed)
        toolTrusted.add(parsed)
        return { changed: !result.alreadyTrusted }
      }
      const result = await trustStore.trust(root)
      options.allowExec = true
      // The hint told the user to trust this repository, which they just did.
      delete options.execWithheldHint
      gate = { ...gate, allowExec: true, trusted: true, reason: 'allowed', missing: [] }
      // Tool modules are code; a grant does not import them.
      const note = projectToolsPending
        ? `the tools ${PROJECT_CONFIG_FILENAME} names load the next time ${BIN} starts with execution allowed`
        : undefined
      return { changed: !result.alreadyTrusted, ...(note !== undefined ? { note } : {}) }
    },
    async revokeTrust(scope) {
      if (scope !== undefined) {
        const removed = await trustStore.untrust(root, parseScope(scope))
        // The user config's trust.tools may still trust it.
        await decideTools()
        return { changed: removed }
      }
      const removed = await trustStore.untrust(root)
      return { changed: removed }
    },
    settings() {
      return {
        root,
        settings,
        allowExec: gate.allowExec,
        reason: gate.reason,
        trusted: gate.trusted,
        trustable: trustable(),
        tools: project.tools.map(toolSummary),
        trustedTools: gate.allowExec ? [] : [...toolTrusted],
      }
    },
    async reloadSettings() {
      await reread()
      return session.settings()
    },
    async saveSetting(key, value) {
      const source = settings.settings.find((s) => s.key === key)?.source ?? 'default'
      const layer = settingLayer(key, source)
      let file: string
      try {
        ;({ file } = await writeSetting({ layer, root, env, home }, key, value))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new SessionError('config', `not saved: ${message}`)
      }
      await reread(`saved to ${file}, but it cannot be read back: `)
      const flag = FLAG_OF_SETTING[key]
      return {
        key,
        file,
        layer,
        pinned: flag !== undefined && pinnedByFlag.includes(flag),
        snapshot: session.settings(),
      }
    },
    resolveRun(catalog, id, args = []) {
      return resolveRun(project, root, catalog, id, args)
    },
  }
  return session
}

/**
 * The task `id` names: by id, else by the line `list` prints for it (the
 * copied form, with its `cd` and quoting), else by its `display`. A line or
 * a display names a task only when no other task has it.
 */
function findTask(catalog: Pick<Catalog, 'reports'>, id: string): Task | undefined {
  const all = catalog.reports.flatMap((r) => r.tasks)
  const only = (tasks: Task[]): Task | undefined => (tasks.length === 1 ? tasks[0] : undefined)
  const lineOf = (t: Task): string | null => taskCopyText(t, process.platform)
  const byId = all.filter((t) => t.id === id)
  if (byId.length === 1) return byId[0]
  const byLine = only(all.filter((t) => lineOf(t) === id))
  if (byLine !== undefined) return byLine
  // Ids are `runner:source:name`, and a name may hold a `:`, so two tasks can
  // share one. Running the first would run a task the caller did not pick.
  if (byId.length > 1) {
    const lines = byId.map(lineOf)
    const usable = lines.every(
      (line) => line !== null && all.filter((t) => lineOf(t) === line).length === 1,
    )
    throw new SessionError(
      'ambiguous-task',
      `'${id}' is the id of ${byId.length} tasks`,
      usable
        ? `run one by its line from "${BIN} list": ` +
            lines.map((line) => commandString([BIN, 'run', line!])).join(' or ')
        : `they have the same line in "${BIN} list", so ${BIN} cannot tell them apart; ` +
            'run the command yourself',
    )
  }
  return only(all.filter((t) => t.display === id))
}

/** See {@link Session.resolveRun}. */
export function resolveRun(
  project: Project,
  root: string,
  catalog: Pick<Catalog, 'reports'>,
  id: string,
  args: readonly string[] = [],
): RunPlan {
  const task = findTask(catalog, id)
  if (task === undefined) {
    const all = catalog.reports.flatMap((r) => r.tasks)
    // A task that contains `id` first; else one whose name is a near miss of
    // it. Not a fuzzy match: letters in order find unrelated tasks.
    let close = filterTasks(catalog.reports, { query: id, mode: 'exact' })
      .slice(0, 3)
      .map((h) => h.task.id)
    if (close.length === 0) {
      const names = closestMatches(id, [...new Set(all.map((t) => t.path.at(-1) ?? t.id))])
      close = all
        .filter((t) => names.includes(t.path.at(-1) ?? t.id))
        .map((t) => t.id)
        .slice(0, 3)
    }
    throw new SessionError(
      'task-not-found',
      `no task '${id}'`,
      close.length > 0
        ? `did you mean ${close.join(', ')}?`
        : `"${BIN} list --json" lists every task id`,
    )
  }
  if (task.parametersUnknown === 'editor-variable') {
    throw new SessionError('not-runnable', `${task.display}: ${EDITOR_VARIABLE_LABEL}`)
  }
  let invocation: { argv: string[]; env: Record<string, string> }
  try {
    invocation =
      args.length === 0
        ? { argv: [...task.argv], env: {} }
        : project.runners.invocation(task, [...args])
  } catch (err) {
    throw new SessionError('bad-arguments', err instanceof Error ? err.message : String(err))
  }
  // The binary is always the task's own: invoke may not change it.
  if (invocation.argv[0] !== task.argv[0]) {
    throw new SessionError(
      'bad-arguments',
      `${task.runner}: invoke changed the binary from ${task.argv[0]} to ${invocation.argv[0]}`,
    )
  }
  // A catalog can come from a file (the saved view, the store), so its cwd
  // is checked here, whatever the catalog's source.
  const cwd = task.cwd === '.' ? root : resolve(root, task.cwd)
  const inside = relative(root, cwd)
  if (
    isAbsolute(task.cwd) ||
    inside === '..' ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside)
  ) {
    throw new SessionError('not-runnable', `${task.display}: its directory is outside ${root}`)
  }
  return { task, argv: invocation.argv, env: invocation.env, cwd }
}

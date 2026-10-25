/**
 * The session core: what one run of wayfinder knows about one repository,
 * and the operations every surface shares. See `README.md` beside this file
 * for how the CLI, the terminal UI and the web view use it.
 */

import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import { closestMatches } from '@osdlc/config-layers/did-you-mean'
import type { Catalog, Project, RunnerCacheState, Task } from '@osdlc/system-model/detect'
import { homeDir, policyExecGate, withheldHint, type ExecGate } from '@osdlc/trust-repo'

import { BIN, PROJECT_CONFIG_FILENAME } from '../app.ts'
import { cacheDir } from '../cache.ts'
import {
  collectAndCache,
  fromStore,
  makeProject,
  orderedCatalog,
  readCachedCatalog,
  type WayOptions,
} from '../catalog.ts'
import {
  ConfigError,
  collectOptionsFromConfig,
  readSettings,
  trustPolicyFromConfig,
  trustPolicyOptions,
  type LoadedConfig,
  type Settings,
} from '../config.ts'
import { loadTools, ToolModuleError, type LoadedTool } from '../tools.ts'
import { appTrustStore } from '../trust-store.ts'
import type { WithheldReason } from '../vocabulary.ts'
import { filterTasks, type TaskFilter, type TaskHit } from './filter.ts'
import { unknownsOf, type Unknown } from './unknowns.ts'

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
    | 'not-runnable'
    | 'bad-arguments'
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

/** A catalog and where each runner's rows came from. */
export interface CatalogSnapshot {
  /** Grouped and in the configured runner order. */
  catalog: Catalog
  /** One entry per selected runner. */
  cache: CacheState[]
  /**
   * `probe`: every runner was probed now. `store`: from the stored probe,
   * with any runner missing from it probed now. `empty-store`: a stored
   * answer was asked for, but there was none, so it was probed now.
   */
  origin: 'probe' | 'store' | 'empty-store'
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
  readonly config: LoadedConfig
  /** Warnings from the config files and the tool modules, for stderr. */
  readonly warnings: readonly string[]
  /** The execution decision. A trust grant updates it. */
  readonly gate: ExecGate
  readonly project: Project
  /** The tools loaded from modules, beside the built-ins. */
  readonly tools: readonly LoadedTool[]
  /**
   * The collect options. A trust grant and a saved setting change them in
   * place, so a probe always uses the current ones.
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
  /** `runners.order` from config. */
  runnerOrder(): string[] | undefined
  /** Why withheld runners are withheld, or null when execution is allowed. */
  withheldReason(): WithheldReason | null
  /**
   * The catalog. Probed fresh by default, since a script must not get an old
   * answer without being told. `cached` reads the store first and probes only
   * the runners missing from it. A probe always writes the store. `signal`
   * stops this call's probes as well as the session's own signal.
   */
  catalog(opts?: { cached?: boolean; signal?: AbortSignal | undefined }): Promise<CatalogSnapshot>
  /** The tasks of `catalog` that pass `filter`, best first when there is a query. */
  search(catalog: Catalog, filter: TaskFilter): TaskHit[]
  /** Everything this session could not know about `snapshot`. */
  unknowns(snapshot: Pick<CatalogSnapshot, 'catalog' | 'cache'>): Unknown[]
  /** Whether a trust grant would change this session's execution. */
  trustable(): boolean
  /**
   * Trust the repository and allow execution for the rest of this session.
   * Throws {@link SessionError} `not-trustable` when trust is not what
   * withholds execution. Probe again afterwards.
   */
  grantTrust(): Promise<TrustChange>
  /**
   * Remove the repository's trust grant. This session's execution setting
   * stays as it is until it ends.
   */
  revokeTrust(): Promise<TrustChange>
  settings(): SettingsSnapshot
  /**
   * The task `id` names, with `args` bound the way its tool expects. The
   * same rules as the terminal UI and the web view. Throws
   * {@link SessionError}: `task-not-found`, `not-runnable` or `bad-arguments`.
   */
  resolveRun(catalog: Catalog, id: string, args?: readonly string[]): RunPlan
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
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

/** Fresh states for a catalog probed just now, with each runner's measured time. */
function probedStates(catalog: Catalog, times: ReadonlyMap<string, number>): CacheState[] {
  return catalog.reports.map((r) => {
    const probeMs = times.get(r.runner)
    return {
      runner: r.runner,
      state: 'fresh' as const,
      ageMs: 0,
      estimateMs: probeMs ?? null,
      slow: false,
      ...(probeMs !== undefined ? { probeMs } : {}),
    }
  })
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
  if (!(await isDirectory(start))) {
    throw new SessionError('no-such-directory', `${opts.dir}: no such directory`)
  }
  // The root is found with the built-in tools only.
  const root = await makeProject().findRoot(start)

  let settings: Settings
  try {
    settings = await readSettings(root, env, home)
  } catch (err) {
    if (err instanceof ConfigError) throw new SessionError('config', err.message)
    throw err
  }
  const config = settings.loaded

  // Precedence for allowExec, highest first: --exec / --no-exec, then
  // allowExec in the project file (false only), then the user file, then
  // the built-in default (true). Trust is decided here; collection never
  // reads the trust store.
  const configured = settings.allowExec.value
  const trustStore = appTrustStore({ env, home })
  let gate = await policyExecGate(
    trustStore,
    trustPolicyFromConfig(config.effective),
    { root, configured, flag: flags.allowExec },
    trustPolicyOptions(home),
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
  const store = cacheDir(env, home)
  const runnerOrder = (): string[] | undefined => config.effective.runners?.order
  const trustable = (): boolean => options.execWithheldHint !== undefined

  /** Probe the runners `only` names (all when absent), timing each. */
  const probe = async (
    only?: string[],
    signal?: AbortSignal,
  ): Promise<{ catalog: Catalog; times: Map<string, number> }> => {
    const times = new Map<string, number>()
    const signals = [options.signal, signal].filter((s) => s !== undefined)
    const catalog = await collectAndCache(
      project,
      root,
      {
        ...options,
        ...(only !== undefined ? { only } : {}),
        ...(signals.length > 0 ? { signal: AbortSignal.any(signals) } : {}),
        onProbe: ({ runner, durationMs }) => times.set(runner, durationMs),
      },
      store,
    )
    return { catalog, times }
  }

  const { project, tools } = built
  const session: Session = {
    root,
    config,
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
        const { catalog, times } = await probe(undefined, opts.signal)
        return {
          catalog: orderedCatalog(catalog, runnerOrder()),
          cache: probedStates(catalog, times),
          origin: 'probe',
        }
      }
      const stored = await readCachedCatalog(project, root, options, store)
      if (stored.catalog === null || !fromStore(stored)) {
        const { catalog, times } = await probe(undefined, opts.signal)
        return {
          catalog: orderedCatalog(catalog, runnerOrder()),
          cache: probedStates(catalog, times),
          origin: 'empty-store',
        }
      }
      // A miss is a runner with nothing stored. Only the missing runners are probed.
      const missing = stored.runners.filter((r) => r.state === 'miss').map((r) => r.runner)
      if (missing.length === 0) {
        return {
          catalog: orderedCatalog(stored.catalog, runnerOrder()),
          cache: stored.runners,
          origin: 'store',
        }
      }
      const { catalog: probed, times } = await probe(missing, opts.signal)
      const fresh = new Map(probedStates(probed, times).map((s) => [s.runner, s]))
      return {
        catalog: orderedCatalog(
          { ...stored.catalog, reports: [...stored.catalog.reports, ...probed.reports] },
          runnerOrder(),
        ),
        cache: stored.runners.map((r) => fresh.get(r.runner) ?? r),
        origin: 'store',
      }
    },
    search(catalog, filter) {
      return filterTasks(catalog.reports, filter)
    },
    unknowns(snapshot) {
      const withheld = session.withheldReason() ?? 'untrusted'
      return unknownsOf({ reports: snapshot.catalog.reports, cache: snapshot.cache, withheld })
    },
    trustable,
    async grantTrust() {
      if (!trustable()) {
        throw new SessionError(
          'not-trustable',
          "a trust grant would not change this run's execution gate",
        )
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
    async revokeTrust() {
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
      }
    },
    resolveRun(catalog, id, args = []) {
      return resolveRun(project, root, catalog, id, args)
    },
  }
  return session
}

/** The task `id` names: by id, else by a `display` only one task has. */
function findTask(catalog: Catalog, id: string): Task | undefined {
  const all = catalog.reports.flatMap((r) => r.tasks)
  const byId = all.find((t) => t.id === id)
  if (byId !== undefined) return byId
  const byDisplay = all.filter((t) => t.display === id)
  return byDisplay.length === 1 ? byDisplay[0] : undefined
}

/** See {@link Session.resolveRun}. */
export function resolveRun(
  project: Project,
  root: string,
  catalog: Catalog,
  id: string,
  args: readonly string[] = [],
): RunPlan {
  const task = findTask(catalog, id)
  if (task === undefined) {
    const all = catalog.reports.flatMap((r) => r.tasks)
    // A fuzzy match first; else a task whose name is a near miss of `id`.
    let close = filterTasks(catalog.reports, { query: id })
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
    throw new SessionError(
      'not-runnable',
      `${task.display}: the task uses an editor variable, so it cannot run here`,
    )
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
  // The binary is always the task's own, from a catalog this process built.
  if (invocation.argv[0] !== task.argv[0]) {
    throw new SessionError(
      'bad-arguments',
      `${task.runner}: invoke changed the binary from ${task.argv[0]} to ${invocation.argv[0]}`,
    )
  }
  return {
    task,
    argv: invocation.argv,
    env: invocation.env,
    cwd: task.cwd === '.' ? root : resolve(root, task.cwd),
  }
}

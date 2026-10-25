/**
 * `createProject`: build one registry from a set of tools and answer every
 * question over it.
 *
 * Registration is explicit. The caller passes the tools it wants. Nothing is
 * discovered or loaded by name.
 */

import { readCachedCatalog, collectAndCache, type CachedCatalog } from './cached.ts'
import { collectRunners, invocationOf, invokeTask } from './collect.ts'
import type { CollectOptions, DetectOptions } from './contract.ts'
import { detectProject } from './detect.ts'
import { matchEntry, terms, type Mode } from './match.ts'
import type { Catalog, Invocation, ParamValues, Task } from './model.ts'
import { pinnedInstall, type PinnedInstall, type PinnedInstallOptions } from './pinned.ts'
import { buildRegistry } from './registry.ts'
import {
  armActions,
  choosePackageManagers,
  execPrefix,
  frozenInstallActions,
  installActions,
  missingDepsActions,
  rootTools,
  toolForCommand,
  trustActions,
  type PackageManagerChoice,
  type ToolAction,
} from './roles.ts'
import { findRoot } from './root.ts'
import type { Detected, EcosystemDef, ProjectProfile, ToolDef } from './tool.ts'

/** The runner half of a {@link Project}. */
export interface Runners {
  /** Run each detected tool's runner. Never spawns a task. */
  collect(profile: ProjectProfile, options?: CollectOptions): Promise<Catalog>
  /**
   * The argv that runs `task` with `args` bound the way its tool expects:
   * appended for just and pnpm, after `--` for npm run, cargo run and moon
   * run. The library never spawns it.
   *
   * `args` is a list of positional arguments, or values by parameter name,
   * bound by each parameter's `binding`. Throws when a value does not fit the
   * parameters (see `bindParams`), when a parameter is bound to the
   * environment (use {@link Runners.invocation}), and when the tool's rule
   * would change the binary, `argv[0]`.
   */
  invoke(task: Task, args: readonly string[] | ParamValues): string[]
  /** {@link Runners.invoke}, with the environment variables `env` parameters set. */
  invocation(task: Task, args: readonly string[] | ParamValues): Invocation
  /** The tasks matching a query, best first. An empty query matches everything. */
  search(catalog: Catalog, query: string, mode?: Mode): Task[]
  /**
   * What the cache under `cacheDir` holds for this profile, with a fresh,
   * stale or miss state per runner, without probing.
   *
   * @experimental
   */
  readCached(
    profile: ProjectProfile,
    cacheDir: string,
    options?: CollectOptions,
  ): Promise<CachedCatalog>
  /**
   * `collect`, then store each runner's result under `cacheDir`.
   *
   * @experimental
   */
  collectAndCache(
    profile: ProjectProfile,
    cacheDir: string,
    options?: CollectOptions,
  ): Promise<Catalog>
}

/**
 * A registry of tools and the questions you can ask of it. Role questions
 * take a package directory, `.` (the root) by default.
 */
export interface Project {
  readonly tools: readonly ToolDef[]
  readonly ecosystems: readonly EcosystemDef[]
  /** Read what the repository at `root` contains. */
  detect(root: string, options?: DetectOptions): Promise<ProjectProfile>
  /** The repository root above `from`. */
  findRoot(from: string): Promise<string>
  readonly runners: Runners
  /** The registered tool a command's first word names (`bunx` is bun). */
  toolForCommand(command: string): ToolDef | undefined
  /** @experimental The package manager for each ecosystem of a package. */
  packageManagers(profile: ProjectProfile, dir?: string): PackageManagerChoice[]
  /** @experimental One install command per ecosystem of a package. */
  install(profile: ProjectProfile, dir?: string): ToolAction[]
  /** @experimental The installs that refuse to change a lockfile. */
  frozenInstall(profile: ProjectProfile, dir?: string): ToolAction[]
  /** @experimental The installs whose dependency directory is missing. */
  missingDeps(profile: ProjectProfile, dir?: string): ToolAction[]
  /** @experimental A frozen install through the executable that has the pinned version. */
  pinnedInstall(
    profile: ProjectProfile,
    install: ToolAction,
    options: PinnedInstallOptions,
  ): PinnedInstall | null
  /** @experimental The tool managers detected at the root. */
  toolManagers(profile: ProjectProfile): Detected[]
  /** @experimental The argv prefix that runs `binary` through the detected tool manager. */
  execPrefix(profile: ProjectProfile, binary: string): string[]
  /** @experimental The one-time trust grants the detected tool managers need. */
  trust(profile: ProjectProfile): ToolAction[]
  /** @experimental The hook managers detected at the root. */
  hookManagers(profile: ProjectProfile): Detected[]
  /** @experimental The commands that arm the detected hook managers. */
  armHooks(profile: ProjectProfile): ToolAction[]
}

/** Options for {@link createProject}. */
export interface ProjectOptions {
  /** The tools to register, in report order. */
  tools: readonly ToolDef[]
}

/**
 * Build a {@link Project} from `tools`. Throws when two tools share an id, or
 * when two different ecosystem definitions share an id.
 */
export function createProject(options: ProjectOptions): Project {
  const registry = buildRegistry(options.tools)
  return {
    tools: registry.tools,
    ecosystems: registry.ecosystems,
    detect: (root, opts) => detectProject(registry, root, opts),
    findRoot: (from) => findRoot(registry, from),
    runners: {
      collect: (profile, opts) => collectRunners(registry, profile, opts),
      invoke: (task, args) => invokeTask(registry, task, args),
      invocation: (task, args) => invocationOf(registry, task, args),
      search: (catalog, query, mode = 'fuzzy') => search(catalog, query, mode),
      readCached: (profile, dir, opts) => readCachedCatalog(registry, profile, dir, opts),
      collectAndCache: (profile, dir, opts) => collectAndCache(registry, profile, dir, opts),
    },
    toolForCommand: (command) => toolForCommand(registry, command),
    packageManagers: (profile, dir) => choosePackageManagers(registry, profile, dir),
    install: (profile, dir) => installActions(registry, profile, dir),
    frozenInstall: (profile, dir) => frozenInstallActions(registry, profile, dir),
    missingDeps: (profile, dir) => missingDepsActions(registry, profile, dir),
    pinnedInstall: (profile, install, opts) => pinnedInstall(registry, profile, install, opts),
    toolManagers: (profile) => rootTools(registry, profile, 'toolManager').map((t) => t.detected),
    execPrefix: (profile, binary) => execPrefix(registry, profile, binary),
    trust: (profile) => trustActions(registry, profile),
    hookManagers: (profile) => rootTools(registry, profile, 'hookManager').map((t) => t.detected),
    armHooks: (profile) => armActions(registry, profile),
  }
}

function search(catalog: Catalog, query: string, mode: Mode): Task[] {
  const words = terms(query)
  const scored: Array<{ task: Task; score: number; index: number }> = []
  catalog.reports
    .flatMap((r) => r.tasks)
    .forEach((task, index) => {
      const hit = matchEntry(task, words, mode)
      if (hit !== null) scored.push({ task, score: hit.score, index })
    })
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.task)
}

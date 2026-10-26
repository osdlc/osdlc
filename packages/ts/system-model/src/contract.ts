/**
 * The context a runner and a `detect` function receive, and the options of
 * the two calls that pass it to them.
 *
 * Two rules keep runners correct and testable:
 *
 *   1. They never spawn a process. `ctx.runner(binary)` returns an injected
 *      runner, so a test supplies canned output instead of needing moon on
 *      the PATH.
 *   2. They never read the filesystem for discovery. `ctx.files()` applies the
 *      chosen strategy (git-tracked or a directory walk). A runner that went
 *      around it would disagree with every other runner about which files
 *      exist.
 */

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import type { DiscoveryMode, RunnerReport } from './model.ts'
import type { PackageManagerChoice } from './roles.ts'
import type { ProjectProfile, ToolDef } from './tool.ts'

/**
 * Whether a runner must run subprocesses to list its tasks.
 *
 * This is a trust boundary, not an optimization. `moon query tasks` runs the
 * repository's toolchain config. With execution withheld, only `parse`
 * runners run. A `parse` runner may still ask its own tool when execution is
 * allowed and the binary is present (just, rake, go-task and gradle do). The
 * `parse` kind promises a correct answer without running anything.
 */
export type ProviderKind = 'parse' | 'exec'

/** The read-only view of one repository that runners and `detect` functions use. */
export interface ProviderContext {
  /** Absolute. Every path a runner returns is relative to this. */
  root: string
  /**
   * A runner for one binary, injected. When `allowExec` is false, every call
   * resolves as a spawn failure and runs nothing.
   */
  runner(binary: string): AsyncCommandRunner
  /**
   * Root-relative paths matching a pattern, memoized for the call.
   *
   * Patterns use `.gitignore`'s anchoring. A pattern with no `/` matches a
   * basename at any depth (`justfile`, `*.mk`). A pattern with a `/` at the
   * start or in the middle is a path from the root (`/mise.toml`,
   * `.github/workflows/*.yml`). A trailing `/` matches every file under that
   * directory. `*` matches within one path segment.
   */
  files(pattern: string): Promise<string[]>
  /** Read and parse a JSON file, root-relative. `null` when `readText` gives `null` or the JSON is malformed. */
  readJson(relPath: string): Promise<unknown>
  /**
   * Read a text file, root-relative. `null` when it is absent, is not a
   * regular file, is a symlink that leaves the root, or is larger than
   * `MAX_READ_BYTES`.
   */
  readText(relPath: string): Promise<string | null>
  /**
   * True when a root-relative path exists inside the root. A path with `..`,
   * an absolute path, and a path through a symlink that leaves the root are
   * false.
   */
  exists(relPath: string): Promise<boolean>
  /** PATH lookup for a binary, with no subprocess. */
  which(binary: string): string | null
  /**
   * Whether subprocesses are allowed. An `exec` runner never sees `false`,
   * because it is withheld instead. A `parse` runner or a `detect` function
   * must not spawn a process when this is `false`.
   */
  allowExec: boolean
  discovery: DiscoveryMode
  /** Aborted when the caller cancels. */
  signal: AbortSignal
}

/** A {@link ProviderContext} plus the profile and the registered tools, for runners. */
export interface RunnerContext extends ProviderContext {
  profile: ProjectProfile
  tools: readonly ToolDef[]
  /**
   * `Project.packageManagers` for this profile: the manager per ecosystem of
   * the package at `dir`.
   *
   * @experimental
   */
  packageManagers(dir: string): PackageManagerChoice[]
}

/** Options for `Project.detect`. */
export interface DetectOptions {
  /**
   * Allow `describe` functions that run a subprocess, such as moon's project
   * roles. Defaults to `false`.
   */
  allowExec?: boolean | undefined
  /**
   * `git` lists tracked files plus untracked files that are not ignored.
   * `walk` walks the tree, skipping well-known directories. `auto` (the
   * default) picks git when the root is a repository and git is on the PATH.
   */
  discovery?: DiscoveryMode | 'auto' | undefined
  /**
   * Extra paths to skip, on top of the built-in list. A bare name matches a
   * path segment at any depth. A value with a slash matches a root-relative
   * prefix. Use it for trees that are data, such as test-fixture repositories.
   */
  excludePaths?: string[] | undefined
  /**
   * Add the built-in exclude list to `excludePaths` (default `true`). Pass
   * `false` when `excludePaths` must be the whole list.
   */
  useBuiltinExcludes?: boolean | undefined
  /**
   * Build the runner for a binary. Defaults to `spawnRunnerAsync` from
   * `@osdlc/command-seam` with `absolutePathOnly`, so a bare name runs only
   * from an absolute PATH entry.
   */
  makeRunner?: ((binary: string) => AsyncCommandRunner) | undefined
  /** PATH lookup. Defaults to a walk of the absolute PATH entries. */
  which?: ((binary: string) => string | null) | undefined
  /** Ends every subprocess detection starts, git included, when aborted. */
  signal?: AbortSignal | undefined
}

/** Options for `Project.runners.collect` and the cached variants. */
export interface CollectOptions {
  /** Restrict to these runner ids. */
  only?: string[] | undefined
  /** Skip these runner ids. */
  exclude?: string[] | undefined
  /**
   * Allow subprocesses. Defaults to `false`, because a library that runs
   * subprocesses by default runs unknown code when pointed at a new repo.
   */
  allowExec?: boolean | undefined
  /**
   * Appended to the diagnostic of a runner withheld because execution is not
   * allowed. For example, a CLI's sentence telling the user how to trust the
   * repo.
   */
  execWithheldHint?: string | undefined
  /**
   * Probe timeouts in ms, by runner id. Each replaces that runner's
   * `RunnerRole.probe.timeoutMs` and {@link probeTimeoutMs}.
   *
   * A probe timeout bounds each subprocess the runner starts and the whole
   * probe. A runner still running at its timeout is stopped: the processes
   * it started are killed with their trees, and it reports `status: 'error'`
   * with the diagnostic `timed out after <n> s`. The other runners go on.
   * The clock starts once the shared file listing is ready.
   *
   * `Infinity` means no limit. A finite value above 2^31-1 ms is treated as
   * 2^31-1. A runner whose timeout is not above 0 reports an error and is
   * not probed.
   */
  timeouts?: Readonly<Record<string, number>> | undefined
  /**
   * The probe timeout in ms of every runner {@link timeouts} does not name,
   * replacing `RunnerRole.probe.timeoutMs`. Unset, each runner has its own,
   * else `DEFAULT_PROBE_TIMEOUT_MS`.
   */
  probeTimeoutMs?: number | undefined
  /**
   * The longest probe timeout in ms of any runner, applied after
   * {@link timeouts} and {@link probeTimeoutMs}. It only lowers a limit. A
   * host gives it a value from a less trusted source, such as a project
   * file, so that source cannot make a runner wait longer.
   */
  maxProbeTimeoutMs?: number | undefined
  /**
   * Build the runner for a binary. Defaults to `spawnRunnerAsync` from
   * `@osdlc/command-seam` with `absolutePathOnly`, so a bare name runs only
   * from an absolute PATH entry.
   */
  makeRunner?: ((binary: string) => AsyncCommandRunner) | undefined
  /** PATH lookup. Defaults to a walk of the absolute PATH entries. */
  which?: ((binary: string) => string | null) | undefined
  /** Ends every subprocess a runner starts, git included, when aborted. */
  signal?: AbortSignal | undefined
  /**
   * Called once for each runner that was probed, with how long its probe
   * took. Not called for a runner withheld because execution is not allowed.
   * A callback that throws rejects the whole collect.
   */
  onProbe?: ((probe: { runner: string; durationMs: number }) => void) | undefined
  /**
   * Called once, before any runner is probed, with the id of each runner
   * this collect reports, in report order. A callback that throws rejects
   * the whole collect.
   */
  onRunners?: ((runners: readonly string[]) => void) | undefined
  /**
   * Called once for each runner as its report is ready, a withheld runner
   * included, so a host can show each runner as it answers. The catalog
   * still holds every report. `collectAndCache` may add a diagnostic to the
   * catalog's copy that this one lacks. A callback that throws rejects the
   * whole collect.
   */
  onReport?: ((report: RunnerReport) => void) | undefined
}

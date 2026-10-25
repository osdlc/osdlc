/**
 * `runners.collect`: run each detected tool's runner and build the catalog.
 *
 * A runner runs only when its tool was detected. It gets the packages where
 * the tool was found. An `exec` runner is withheld unless execution is
 * allowed, and its withheld report appears only when its tool was detected.
 * Runners run concurrently. One that throws does not lose the others' work.
 *
 * Each call lists and reads the repository again, with the discovery
 * settings recorded on the profile. Runners re-read the files they report on.
 * So a second collect sees edits to them, and a profile copied through JSON
 * collects the same way. Which packages and tools exist, and which package
 * manager each package uses, come from the profile. Detect again after adding
 * or removing a manifest, lockfile or marker.
 * The cache (`cached.ts`) sits above this and uses `probeObserver`.
 */

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import {
  boundRunners,
  createContext,
  createContextState,
  DEFAULT_PROBE_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  type ContextState,
} from './context.ts'
import type { CollectOptions, ProviderContext, ProviderKind, RunnerContext } from './contract.ts'
import { createLister } from './discovery.ts'
import {
  CATALOG_SCHEMA_VERSION,
  type Catalog,
  type ChainSegment,
  type Invocation,
  type ParamValues,
  type RunnerBrand,
  type RunnerReport,
  type Task,
} from './model.ts'
import { bindParams } from './params.ts'
import { manifestsOf, markersOf, type Registry } from './registry.ts'
import { choosePackageManagers } from './roles.ts'
import { synthesizedRunners } from './synthesized.ts'
import type { Package, ProjectProfile, RunnerRole } from './tool.ts'
import { defaultRunner, which as whichOnPath } from './which.ts'

/** One runner to run: a tool's runner role, or a synthesized role group. */
export interface RunnerSpec {
  id: string
  role: RunnerRole
  binary?: string | undefined
  brand?: RunnerBrand | undefined
  packages: readonly Package[]
  /** Patterns that detected the tool, re-checked by the cache fingerprint. */
  patterns: string[]
}

/** Internal: what one runner's run measured and touched. */
export interface ProbeRecord {
  runner: string
  kind: ProviderKind
  durationMs: number
  /** Root-relative paths read through `ctx`, plus the detection evidence. */
  reads: string[]
  /** Every pattern passed to `ctx.files()`, plus the tool's own markers. */
  queries: string[]
  /**
   * Every binary looked up through `ctx.which`, with what it found. A runner
   * that picks a tool by what is installed (Procfile's manager, poe's `uv run`)
   * gives another answer once that changes.
   */
  lookups: Record<string, string | null>
  watch: string[]
  report: RunnerReport
  files: (pattern: string) => Promise<string[]>
}

export interface InternalCollectOptions extends CollectOptions {
  probeObserver?: ((probe: ProbeRecord) => void) | undefined
}

const DEFAULT_CHAIN: readonly ChainSegment[] = [
  { label: 'runner', hint: 'The tool that runs the task.' },
  { label: 'task', hint: 'The task name.' },
]

/** The runners one call runs, in registry order, after `only` and `exclude`. */
export function selectRunners(
  registry: Registry,
  profile: ProjectProfile,
  options: CollectOptions,
): RunnerSpec[] {
  const specs: RunnerSpec[] = []
  for (const tool of registry.tools) {
    const role = tool.roles.runner
    if (role === undefined) continue
    const packages = profile.packages.filter((p) => p.tools.some((t) => t.tool === tool.id))
    if (packages.length === 0) continue
    specs.push({
      id: tool.id,
      role,
      binary: tool.binary,
      brand: tool.brand ?? role.brand,
      packages,
      patterns: [...markersOf(tool).map((m) => m.files), ...manifestsOf(tool)],
    })
  }
  specs.push(...synthesizedRunners(registry, profile))

  let out = specs
  if (options.only) {
    const wanted = new Set(options.only)
    out = out.filter((s) => wanted.has(s.id))
  }
  if (options.exclude) {
    const unwanted = new Set(options.exclude)
    out = out.filter((s) => !unwanted.has(s.id))
  }
  return out
}

/** New read state for one call, listing files the same way the profile was detected. */
export function stateFor(
  profile: ProjectProfile,
  makeRunner: (binary: string) => AsyncCommandRunner,
  signal: AbortSignal,
): ContextState {
  return createContextState(
    createLister(
      profile.root,
      profile.discovery,
      boundRunners(makeRunner, signal, GIT_TIMEOUT_MS)('git'),
      profile.excludePaths,
      profile.useBuiltinExcludes,
    ),
  )
}

/** The timeout each subprocess of `spec` gets: the caller's, the runner's, else the default. */
export function probeTimeout(spec: RunnerSpec, options: CollectOptions): number {
  return options.timeouts?.[spec.id] ?? spec.role.probe?.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
}

export async function collectRunners(
  registry: Registry,
  profile: ProjectProfile,
  options: InternalCollectOptions = {},
): Promise<Catalog> {
  const allowExec = options.allowExec ?? false
  const makeRunner = options.makeRunner ?? defaultRunner
  const which = options.which ?? whichOnPath
  const signal = options.signal ?? new AbortController().signal
  const state = stateFor(profile, makeRunner, signal)
  const base = createContext({
    absRoot: profile.root,
    allowExec,
    makeRunner,
    which,
    signal,
    discovery: profile.discovery,
    state,
  })
  const ctx: RunnerContext = {
    ...base,
    profile,
    tools: registry.tools,
    packageManagers: (dir) => choosePackageManagers(registry, profile, dir),
  }
  const observer = options.probeObserver

  const reports = await Promise.all(
    selectRunners(registry, profile, options).map(async (spec): Promise<RunnerReport> => {
      if (spec.role.kind === 'exec' && !allowExec) {
        return execWithheldReport(spec, options.execWithheldHint, which)
      }
      const head = reportHead(spec, which)
      const reads = new Set<string>()
      const queries = new Set<string>()
      const lookups = new Map<string, string | null>()
      const own: RunnerContext = {
        ...ctx,
        runner: boundRunners(makeRunner, signal, probeTimeout(spec, options)),
      }
      const recording = observer === undefined ? own : recordReads(own, reads, queries, lookups)

      const startedAt = performance.now()
      let report: RunnerReport
      try {
        const result = await spec.role.collect(recording, spec.packages)
        report = { ...head, ...result, skippedForExec: false }
      } catch (err) {
        report = {
          ...head,
          status: 'error',
          tasks: [],
          skippedForExec: false,
          diagnostics: [{ severity: 'error', message: describe(err) }],
        }
      }

      const durationMs = performance.now() - startedAt
      options.onProbe?.({ runner: spec.id, durationMs })
      observer?.({
        runner: spec.id,
        kind: spec.role.kind,
        durationMs,
        reads: [...reads, ...evidencePaths(spec.packages)],
        queries: [...queries, ...spec.patterns],
        lookups: Object.fromEntries([...lookups].sort(([a], [b]) => (a < b ? -1 : 1))),
        watch: spec.role.watch ?? [],
        report,
        files: ctx.files,
      })
      return report
    }),
  )

  return {
    kind: 'catalog',
    schemaVersion: CATALOG_SCHEMA_VERSION,
    root: profile.root,
    generatedAt: new Date().toISOString(),
    discovery: profile.discovery,
    allowExec,
    reports,
  }
}

/** Every file the detection of these packages depends on. */
function evidencePaths(packages: readonly Package[]): string[] {
  const out = new Set<string>()
  for (const pkg of packages) {
    for (const t of pkg.tools) {
      for (const ev of t.evidence) out.add(ev.source.split('#')[0]!)
    }
  }
  return [...out]
}

/** The `runner`/`chain`/`brand`/`tool` prefix every report carries. */
function reportHead(
  spec: RunnerSpec,
  which: (binary: string) => string | null,
): Pick<RunnerReport, 'runner' | 'chain' | 'brand' | 'tool'> {
  return {
    runner: spec.id,
    // A copy of every chain, so a caller editing one report's chain changes
    // no other report and no later collect.
    chain: (spec.role.chain ?? DEFAULT_CHAIN).map((segment) => ({ ...segment })),
    ...(spec.brand ? { brand: spec.brand } : {}),
    ...(spec.binary ? { tool: toolStatus(spec.binary, which) } : {}),
  }
}

/**
 * The report an `exec` runner gets when execution is withheld. It is
 * reported, not dropped, so a caller can say why moon is missing. The cached
 * path uses the same function, so both describe it the same way.
 */
export function execWithheldReport(
  spec: RunnerSpec,
  hint: string | undefined,
  which: (binary: string) => string | null,
): RunnerReport {
  return {
    ...reportHead(spec, which),
    status: 'absent',
    tasks: [],
    skippedForExec: true,
    diagnostics: [
      {
        severity: 'info',
        message: `${spec.id} needs to run a subprocess; ${
          hint ?? 're-run with execution allowed to include it'
        }`,
      },
    ],
  }
}

/** A copy of a context that records every path read, pattern listed and binary looked up through it. */
function recordReads<C extends ProviderContext>(
  ctx: C,
  reads: Set<string>,
  queries: Set<string>,
  lookups: Map<string, string | null>,
): C {
  return {
    ...ctx,
    which: (binary: string) => {
      const found = ctx.which(binary)
      lookups.set(binary, found)
      return found
    },
    files: async (pattern: string) => {
      const found = await ctx.files(pattern)
      queries.add(pattern)
      for (const path of found) reads.add(path)
      return found
    },
    readText: (relPath: string) => {
      reads.add(relPath)
      return ctx.readText(relPath)
    },
    readJson: (relPath: string) => {
      reads.add(relPath)
      return ctx.readJson(relPath)
    },
    exists: (relPath: string) => {
      reads.add(relPath)
      return ctx.exists(relPath)
    },
  }
}

function toolStatus(
  binary: string,
  which: (binary: string) => string | null,
): { binary: string; found: boolean; path?: string } {
  const path = which(binary)
  return path === null ? { binary, found: false } : { binary, found: true, path }
}

/**
 * What runs `task` with `args`, by the owning runner's rule. A list of
 * strings is positional arguments, passed as given. Values by name are bound
 * by each parameter's `binding` (see `bindParams`): `positional`, `flag` and
 * `switch` words go through the runner's rule, so they land after any `--` it
 * adds. `assign` arguments go straight after the task's own argv, before any
 * `--`, because the runner reads them.
 *
 * Throws when the runner's rule changes `argv[0]`, the binary. The binary
 * always comes from a catalog built by reading the repository, never from
 * the caller. Also throws when a positional value bound by name starts with
 * `-` and would reach the runner as one of its own options: no `--` comes
 * before it, and the runner does not set `optionsEndAtTask`.
 */
export function invocationOf(
  registry: Registry,
  task: Task,
  args: readonly string[] | ParamValues,
): Invocation {
  const bound = isList(args)
    ? { args: [...args], positional: [], assign: [], env: {} }
    : bindParams(task.parameters, args)
  const runner = registry.byId.get(task.runner)?.roles.runner
  const rule = runner?.invoke
  const base =
    bound.args.length === 0
      ? [...task.argv]
      : rule === undefined
        ? [...task.argv, ...bound.args]
        : rule(task, bound.args)
  if (base[0] !== task.argv[0]) {
    throw new Error(`${task.runner}: invoke changed the binary from ${task.argv[0]} to ${base[0]}`)
  }
  if (runner?.optionsEndAtTask !== true) {
    const end = base.indexOf('--', task.argv.length)
    for (const value of bound.positional) {
      if (!value.startsWith('-')) continue
      const at = base.indexOf(value, task.argv.length)
      if (at !== -1 && (end === -1 || at < end)) {
        throw new Error(
          `${task.runner}: the value ${value} starts with "-", and the runner would read it as an option`,
        )
      }
    }
  }
  const argv =
    bound.assign.length === 0
      ? base
      : startsWith(base, task.argv)
        ? [...task.argv, ...bound.assign, ...base.slice(task.argv.length)]
        : [...base, ...bound.assign]
  return { argv, env: bound.env }
}

/** {@link invocationOf}'s argv. Throws when a parameter is bound to the environment. */
export function invokeTask(
  registry: Registry,
  task: Task,
  args: readonly string[] | ParamValues,
): string[] {
  const { argv, env } = invocationOf(registry, task, args)
  const names = Object.keys(env)
  if (names.length > 0) {
    throw new Error(`${names.join(', ')} must be set in the environment; use runners.invocation`)
  }
  return argv
}

function isList(args: readonly string[] | ParamValues): args is readonly string[] {
  return Array.isArray(args)
}

function startsWith(argv: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((word, i) => argv[i] === word)
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

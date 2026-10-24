/**
 * `runners.collect`: run each detected tool's runner and assemble the
 * catalog.
 *
 * A runner runs only when its tool was detected, and gets the packages where
 * it was found. An `exec` runner is withheld unless execution is allowed, and
 * its withheld row appears only when its tool was detected. Runners run
 * concurrently; one throwing does not lose the others' work.
 *
 * Collection holds nothing across calls. The cache is a layer above this
 * (`cached.ts`), reached through `probeObserver`.
 */

import { spawnRunnerAsync } from '@osdlc/command-seam'

import { createContext, createContextState, type ContextState } from './context.ts'
import type { CollectOptions, ProviderContext, ProviderKind, RunnerContext } from './contract.ts'
import { profileState } from './detect.ts'
import { createLister } from './discovery.ts'
import type { Catalog, ChainSegment, RunnerBrand, RunnerReport, Task } from './model.ts'
import { manifestsOf, markersOf, type Registry } from './registry.ts'
import { choosePackageManagers } from './roles.ts'
import { synthesizedRunners } from './synthesized.ts'
import type { Package, ProjectProfile, RunnerRole } from './tool.ts'
import { which as whichOnPath } from './which.ts'

/** One runner to run: a tool's runner role, or a synthesized role group. */
export interface RunnerSpec {
  id: string
  role: RunnerRole
  binary?: string | undefined
  packages: readonly Package[]
  /** Patterns that showed the tool, re-checked by the cache fingerprint. */
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
  watch: string[]
  report: RunnerReport
  files: (pattern: string) => Promise<string[]>
}

export interface InternalCollectOptions extends CollectOptions {
  probeObserver?: ((probe: ProbeRecord) => void) | undefined
}

const DEFAULT_CHAIN: ChainSegment[] = [
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

/** The context state for a profile: the one `detect` built, or a fresh one. */
export function stateFor(
  profile: ProjectProfile,
  makeGit: () => ReturnType<typeof spawnRunnerAsync>,
): ContextState {
  return (
    profileState.get(profile) ??
    createContextState(
      createLister(profile.root, profile.discovery, makeGit(), profile.excludePaths),
    )
  )
}

export async function collectRunners(
  registry: Registry,
  profile: ProjectProfile,
  options: InternalCollectOptions = {},
): Promise<Catalog> {
  const allowExec = options.allowExec ?? false
  const makeRunner = options.makeRunner ?? ((binary: string) => spawnRunnerAsync(binary))
  const which = options.which ?? whichOnPath
  const signal = options.signal ?? new AbortController().signal
  const state = stateFor(profile, () => makeRunner('git'))
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
      const recording = observer === undefined ? ctx : recordReads(ctx, reads, queries)

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

      observer?.({
        runner: spec.id,
        kind: spec.role.kind,
        durationMs: performance.now() - startedAt,
        reads: [...reads, ...evidencePaths(spec.packages)],
        queries: [...queries, ...spec.patterns],
        watch: spec.role.watch ?? [],
        report,
        files: ctx.files,
      })
      return report
    }),
  )

  return {
    root: profile.root,
    generatedAt: new Date().toISOString(),
    discovery: profile.discovery,
    allowExec,
    reports,
  }
}

/** Every file the detection of these packages rests on. */
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
    chain: spec.role.chain ?? DEFAULT_CHAIN,
    ...(spec.role.brand ? { brand: spec.role.brand as RunnerBrand } : {}),
    ...(spec.binary ? { tool: toolStatus(spec.binary, which) } : {}),
  }
}

/**
 * The report an `exec` runner gets when execution is withheld. Reported
 * rather than dropped, so a surface can say why moon is missing. The cached
 * path uses the same function so both describe it the same way.
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

/** A view of a context that notes every path read and pattern listed through it. */
function recordReads<C extends ProviderContext>(
  ctx: C,
  reads: Set<string>,
  queries: Set<string>,
): C {
  return {
    ...ctx,
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

/** The argv that runs `task` with `args`, by the owning runner's rule; appended by default. */
export function invokeTask(registry: Registry, task: Task, args: readonly string[]): string[] {
  const invoke = registry.byId.get(task.runner)?.roles.runner?.invoke
  if (invoke !== undefined) return invoke(task, args)
  return [...task.argv, ...args]
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

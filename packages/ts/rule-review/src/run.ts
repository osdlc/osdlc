/** Discovery, dispatch, and collection of a review run. */
import { adapterFor, callAgent } from '@osdlc/agent-call'
import type { AgentCallSpec, AgentName, AgentResult } from '@osdlc/agent-call'

import { errorText } from './changeset.ts'
import { validateConfig } from './config.ts'
import { mergeFindings, parseFindings } from './findings.ts'
import { planJobs } from './plan.ts'
import { buildSpec, type FileDiff } from './prompt.ts'
import type {
  DiscoveryContext,
  JobOutcome,
  RuleSource,
  RuleSourceProvider,
  ReviewConfig,
  ReviewJob,
  ReviewRun,
} from './types.ts'

/**
 * Collect rule sources from every provider, in registration order.
 *
 * @throws {Error} Two sources share an id; the message names both providers.
 */
export async function discoverSources(
  providers: readonly RuleSourceProvider[],
  ctx: DiscoveryContext,
): Promise<RuleSource[]> {
  const collected = await Promise.all(providers.map((p) => p.discover(ctx)))

  // Checked here so a duplicate names its providers, not the registry.
  const seen = new Map<string, string>()
  const sources: RuleSource[] = []
  collected.forEach((batch, i) => {
    const providerId = providers[i]?.id ?? 'unknown'
    for (const source of batch) {
      const owner = seen.get(source.id)
      if (owner !== undefined) {
        throw new Error(
          `rule source id '${source.id}' claimed by both '${owner}' and '${providerId}'`,
        )
      }
      seen.set(source.id, providerId)
      sources.push(source)
    }
  })
  return sources
}

/**
 * The dispatch seam.
 *
 * Defaults to a real `callAgent`. Injected in tests so the planner, the
 * concurrency cap, and finding attribution can be exercised without spawning
 * an agent.
 */
export type Dispatch = (
  spec: AgentCallSpec,
  config: ReviewConfig,
  signal?: AbortSignal,
) => Promise<AgentResult>

const dispatchViaAgentCall: Dispatch = (spec, config, signal) =>
  callAgent(
    adapterFor(
      // validateConfig refused any other name before the run started.
      config.engine as AgentName,
      config.binary !== undefined ? { binary: config.binary } : {},
    ),
    spec,
    { signal },
  )

/** Input to {@link review}. The optional fields scope settings per job, skip the agent call, or replace it. */
export interface ReviewOptions {
  projectRoot: string
  sources: readonly RuleSource[]
  changedFiles: readonly string[]
  diffs: readonly FileDiff[]
  config: ReviewConfig
  /**
   * Per-job settings, when the caller scopes them more narrowly than the run.
   *
   * Called once per planned job. Only the fields a single judgement uses are
   * read per job: `engine`, `binary`, `model`, `effort`, `extraArgs`,
   * `timeoutMs` and `maxPromptBytes`. `concurrency`, `exclude` and
   * `maxFilesPerJob` stay run-level by construction: the cap governs the whole
   * fan-out, and exclusions and sharding are applied before any job exists.
   */
  configFor?: (job: ReviewJob) => ReviewConfig
  /**
   * Plan and measure without dispatching anything.
   *
   * Every stage before the agent call is deterministic and free, so a dry run
   * reports what would be judged, by which rules, at what prompt size.
   */
  dryRun?: boolean
  /** Called as each job settles, for progress output. */
  onJobSettled?: (outcome: JobOutcome) => void
  /** Override the agent call. Defaults to `callAgent` on `config.engine`. */
  dispatch?: Dispatch
  /**
   * Aborting it kills every running agent, and a job not yet dispatched is
   * recorded as an error without starting its agent. Each agent runs
   * in its own process group, so a host that can be interrupted must pass one
   * and abort it on SIGINT/SIGTERM, or its agents outlive it.
   */
  signal?: AbortSignal
}

/**
 * Plan the run, dispatch every job, and collect the findings.
 *
 * The lower-level entry: the caller supplies the rule sources, the changed
 * files and their diffs. {@link reviewChanges} reads all three from a git
 * checkout.
 *
 * @throws {ScopeError} A source's scope or an `exclude` pattern cannot be read.
 * @throws {Error} A setting is out of range (see `validateConfig`), checked for
 * the run and for every job before any agent starts. An unknown engine name is
 * refused only when no custom `dispatch` is given.
 */
export async function review(options: ReviewOptions): Promise<ReviewRun> {
  const { jobs, skipped } = planJobs(options.sources, options.changedFiles, options.config)

  const dryRun = options.dryRun === true
  // Every job's settings are resolved before any is dispatched, so a
  // `configFor` that throws rejects the run before an agent has been started.
  // Prompts are still built one job at a time, so only the ones in flight are
  // held in memory.
  const configured = jobs.map((job) => ({
    job,
    config: options.configFor?.(job) ?? options.config,
  }))
  const checkEngine = { engine: options.dispatch === undefined }
  for (const config of new Set([options.config, ...configured.map((c) => c.config)])) {
    validateConfig(config, checkEngine)
  }
  const outcomes = dryRun
    ? configured.map((c) => measureJob(prepare(c, options)))
    : await dispatchAll(configured, options)

  return {
    jobs,
    outcomes,
    findings: mergeFindings(outcomes),
    skipped,
    degraded: outcomes.some((o) => o.error !== undefined),
    dryRun,
  }
}

interface ConfiguredJob {
  job: ReviewJob
  config: ReviewConfig
}

/**
 * Run every configured job under the concurrency cap.
 *
 * The jobs share one abort signal, tied to the caller's. When any job rejects
 * (an `onJobSettled` that throws, say) `review` rejects at once, so the jobs
 * still running are aborted too: their agents would otherwise run to the end
 * with results nobody collects. From then on `onJobSettled` is not called, so
 * no progress arrives after the caller has seen the rejection.
 */
async function dispatchAll(
  configured: readonly ConfiguredJob[],
  options: ReviewOptions,
): Promise<JobOutcome[]> {
  const run = new AbortController()
  const forward = (): void => run.abort(options.signal?.reason)
  if (options.signal?.aborted === true) forward()
  else options.signal?.addEventListener('abort', forward, { once: true })
  let rejected = false
  const settle = (outcome: JobOutcome): void => {
    if (!rejected) options.onJobSettled?.(outcome)
  }
  try {
    return await mapCapped(configured, options.config.concurrency, async (c) => {
      try {
        return await runJob(prepare(c, options), options, run.signal, settle)
      } catch (err) {
        rejected = true
        run.abort(err)
        throw err
      }
    })
  } finally {
    options.signal?.removeEventListener('abort', forward)
  }
}

/**
 * Everything about a job that is knowable without dispatching it.
 *
 * Prompt size is measured on the built prompt rather than the raw diff: what
 * matters is what the judge actually receives, rules and framing included.
 */
interface PreparedJob {
  job: ReviewJob
  config: ReviewConfig
  spec: ReturnType<typeof buildSpec>
  promptBytes: number
  oversize?: { bytes: number; limit: number }
  /** False when none of the job's files has a diff, so there is nothing to judge. */
  hasDiff: boolean
}

function prepare({ job, config }: ConfiguredJob, options: ReviewOptions): PreparedJob {
  const spec = buildSpec(job, options.diffs, config, options.projectRoot)
  const promptBytes = Buffer.byteLength(spec.prompt, 'utf8')
  const oversize =
    config.maxPromptBytes > 0 && promptBytes > config.maxPromptBytes
      ? { bytes: promptBytes, limit: config.maxPromptBytes }
      : undefined
  const files = new Set(job.files)
  const hasDiff = options.diffs.some((d) => files.has(d.file))
  return {
    job,
    config,
    spec,
    promptBytes,
    hasDiff,
    ...(oversize !== undefined ? { oversize } : {}),
  }
}

/**
 * An outcome with no findings: a measured job (no `error`) or one that was not
 * judged. `oversize` is carried either way, so a report can still flag it.
 */
function emptyOutcome(
  { job, promptBytes, oversize }: PreparedJob,
  durationMs: number,
  error?: string,
): JobOutcome {
  return {
    job,
    findings: [],
    ...(error !== undefined ? { error } : {}),
    durationMs,
    promptBytes,
    ...(oversize !== undefined ? { oversize } : {}),
  }
}

/**
 * Why a job with no diff to read is not dispatched. A path git could not
 * render (a nested checkout, say) leaves the judge nothing to read; asking
 * would cost a call to judge an empty prompt.
 */
const NO_DIFF = 'not judged: none of its files has a diff'

/**
 * What a job would do, without doing it. A job the real run would not
 * dispatch carries the reason, so a dry run shows what `--strict` fails on.
 */
function measureJob(prepared: PreparedJob): JobOutcome {
  return prepared.hasDiff ? emptyOutcome(prepared, 0) : emptyOutcome(prepared, 0, NO_DIFF)
}

async function runJob(
  prepared: PreparedJob,
  options: ReviewOptions,
  signal: AbortSignal,
  settle: (outcome: JobOutcome) => void,
): Promise<JobOutcome> {
  const { job, config, spec, promptBytes, oversize } = prepared
  if (signal.aborted) {
    // Starting an agent only to kill it at once would spend a spawn per
    // remaining job; record the job as not judged instead.
    const outcome = emptyOutcome(
      prepared,
      0,
      'aborted: the run was aborted before this job was dispatched',
    )
    settle(outcome)
    return outcome
  }
  if (!prepared.hasDiff) {
    const outcome = emptyOutcome(prepared, 0, NO_DIFF)
    settle(outcome)
    return outcome
  }
  let outcome: JobOutcome
  try {
    const dispatch = options.dispatch ?? dispatchViaAgentCall
    const result = await dispatch(spec, config, signal)
    // `callAgent` never throws on agent failure; it reports structurally. A
    // failed job degrades the run rather than aborting it, because a partial
    // set of real findings is worth more than none. A reply that is not a
    // findings object (prose, or JSON of another shape) is a failure too:
    // nothing was judged, so it must not read as clean.
    const error =
      result.error !== undefined
        ? `${result.error.reason}: ${result.error.detail}`
        : hasFindingsArray(result.structured)
          ? undefined
          : `agent-error: reply did not match the findings schema: ${oneLine(result.text ?? '').slice(0, 200)}`
    outcome =
      error !== undefined
        ? emptyOutcome(prepared, result.durationMs, error)
        : {
            job,
            findings: parseFindings(result.structured, job),
            durationMs: result.durationMs,
            promptBytes,
            ...(result.costUsd !== undefined ? { costUsd: result.costUsd } : {}),
            ...(result.usage?.inputTokens !== undefined
              ? { promptTokens: result.usage.inputTokens }
              : {}),
            ...(oversize !== undefined ? { oversize } : {}),
          }
  } catch (err) {
    // A custom `dispatch` that throws, or `callAgent` failing before it could
    // report structurally. Settings were checked before the run started.
    outcome = emptyOutcome(prepared, 0, errorText(err))
  }

  settle(outcome)
  return outcome
}

/** Collapse whitespace runs, newlines included, so a reply excerpt prints on one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function hasFindingsArray(structured: unknown): boolean {
  return (
    typeof structured === 'object' &&
    structured !== null &&
    Array.isArray((structured as Record<string, unknown>)['findings'])
  )
}

/**
 * `Promise.all` with a ceiling on in-flight work, preserving input order.
 *
 * An uncapped `Promise.all` would open one agent process per job at once.
 */
async function mapCapped<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  // validateConfig allows a positive integer or Infinity ("no cap"), and
  // Math.min turns Infinity into the count.
  const width = Math.max(1, Math.min(limit, items.length))
  let next = 0

  await Promise.all(
    Array.from({ length: width }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        const item = items[i]
        if (item === undefined) return
        results[i] = await fn(item)
      }
    }),
  )
  return results
}

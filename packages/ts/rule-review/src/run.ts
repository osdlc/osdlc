/**
 * Discovery, dispatch, and collection — the one module that does IO.
 *
 * Fan-out is concurrency-capped. There is no correctness reason for the cap:
 * verification is read-only and no job touches the working tree, so jobs
 * cannot conflict with each other. It exists purely so a wide changeset does
 * not open thirty agent processes at once.
 */
import { adapterFor, BUILTIN_AGENTS, callAgent } from '@osdlc/agent-call'
import type { AgentCallSpec, AgentName, AgentResult } from '@osdlc/agent-call'

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

/** Collect rule sources from every provider, in registration order. */
export async function discoverSources(
  providers: readonly RuleSourceProvider[],
  ctx: DiscoveryContext,
): Promise<RuleSource[]> {
  const collected = await Promise.all(providers.map((p) => p.discover(ctx)))

  // Ids must be unique — the intersect registry throws on a duplicate at
  // construction, and a collision here means two providers disagree about
  // what they own. Surface it as that, not as an opaque registry error.
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
      engineName(config.engine),
      config.binary !== undefined ? { binary: config.binary } : {},
    ),
    spec,
    { signal },
  )

/**
 * Narrow a configured engine name to one `adapterFor` accepts.
 *
 * `engine` is caller-supplied configuration, so it is an arbitrary string
 * until checked. Failing here names the valid set; letting it through would surface
 * as an opaque adapter error per job instead.
 */
function engineName(engine: string): AgentName {
  if (!(BUILTIN_AGENTS as readonly string[]).includes(engine)) {
    throw new Error(`unknown engine '${engine}' (expected one of: ${BUILTIN_AGENTS.join(', ')})`)
  }
  return engine as AgentName
}

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
   * Called once per planned job. Only the dispatch fields are read per job —
   * engine, model, effort, and timeout. `concurrency` and `exclude` stay run-level by
   * construction: the cap governs the whole fan-out, and exclusions are
   * applied before any job exists.
   */
  configFor?: (job: ReviewJob) => ReviewConfig
  /**
   * Plan and measure without dispatching anything.
   *
   * Every stage before the agent call is deterministic and free, so a dry run
   * can answer what would be judged, by which rules, at what prompt size —
   * the questions worth asking before paying for the answers.
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
 * @throws {Error} An engine name is not one of `BUILTIN_AGENTS`, checked for the
 * run and for every job before any agent starts. A custom `dispatch` skips the
 * check.
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
  if (options.dispatch === undefined) {
    engineName(options.config.engine)
    for (const c of configured) engineName(c.config.engine)
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

/** A planned job and the settings it is dispatched with. */
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
}

function prepare({ job, config }: ConfiguredJob, options: ReviewOptions): PreparedJob {
  const spec = buildSpec(job, options.diffs, config, options.projectRoot)
  const promptBytes = Buffer.byteLength(spec.prompt, 'utf8')
  const oversize =
    config.maxPromptBytes > 0 && promptBytes > config.maxPromptBytes
      ? { bytes: promptBytes, limit: config.maxPromptBytes }
      : undefined
  return { job, config, spec, promptBytes, ...(oversize !== undefined ? { oversize } : {}) }
}

/** What a job would do, without doing it. */
function measureJob({ job, promptBytes, oversize }: PreparedJob): JobOutcome {
  return {
    job,
    findings: [],
    durationMs: 0,
    promptBytes,
    ...(oversize !== undefined ? { oversize } : {}),
  }
}

async function runJob(
  { job, config, spec, promptBytes, oversize }: PreparedJob,
  options: ReviewOptions,
  signal: AbortSignal,
  settle: (outcome: JobOutcome) => void,
): Promise<JobOutcome> {
  if (signal.aborted) {
    // Starting an agent only to kill it at once would spend a spawn per
    // remaining job; record the job as not judged instead.
    const outcome: JobOutcome = {
      job,
      findings: [],
      error: 'aborted: the run was aborted before this job was dispatched',
      durationMs: 0,
      promptBytes,
      ...(oversize !== undefined ? { oversize } : {}),
    }
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
        ? {
            job,
            findings: [],
            error,
            durationMs: result.durationMs,
            promptBytes,
            ...(oversize !== undefined ? { oversize } : {}),
          }
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
    // Reached only for a failure before the call — an unknown engine name,
    // most likely.
    outcome = {
      job,
      findings: [],
      error: err instanceof Error ? err.message : String(err),
      durationMs: 0,
      promptBytes,
      ...(oversize !== undefined ? { oversize } : {}),
    }
  }

  settle(outcome)
  return outcome
}

/** Collapse whitespace runs, newlines included, so a reply excerpt prints on one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** True when a judge's reply is a record with a `findings` array. */
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
 * Written out rather than pulled in: it is a dozen lines, and an uncapped
 * `Promise.all` would open one agent process per job at once.
 */
async function mapCapped<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  // NaN would give no workers at all, and so no results; read it as 1.
  // Infinity is a real answer, "no cap", and Math.min turns it into the count.
  const cap = Number.isNaN(limit) ? 1 : limit
  const width = Math.max(1, Math.min(cap, items.length))
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

import { describe, expect, test } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentResult } from '@osdlc/agent-call'

import { discoverSources, review, type Dispatch } from '../src/run.ts'
import { DEFAULT_CONFIG, type RuleSource, type RuleSourceProvider } from '../src/types.ts'
import { alive, waitFor } from './process-helpers.ts'

function source(id: string, patterns: string[], depth: number): RuleSource {
  return {
    id,
    kind: 'instruction',
    path: `${id}/CLAUDE.md`,
    depth,
    patterns,
    text: `rules for ${id}`,
    label: id,
  }
}

function provider(id: string, sources: RuleSource[]): RuleSourceProvider {
  return { id, discover: async () => sources }
}

/** A minimal AgentResult carrying just the structured reply. */
function reply(structured: unknown): AgentResult {
  return {
    ok: true,
    exitCode: 0,
    durationMs: 1,
    structured,
    planned: {} as AgentResult['planned'],
    raw: {} as AgentResult['raw'],
  } as AgentResult
}

const FILE_A = 'lib/a.ts'
const FILE_B = 'web/b.ts'

const SOURCES = [
  source('root', ['**'], 0),
  source('lib', ['lib/**'], 1),
  source('docs', ['docs/**'], 1),
]

const DIFFS = [
  { file: FILE_A, diff: '+ a' },
  { file: FILE_B, diff: '+ b' },
]

function run(dispatch: Dispatch, config = DEFAULT_CONFIG) {
  return review({
    projectRoot: '/repo',
    sources: SOURCES,
    changedFiles: [FILE_A, FILE_B],
    diffs: DIFFS,
    config,
    dispatch,
  })
}

describe('discoverSources', () => {
  test("collects every provider's sources in registration order", async () => {
    const sources = await discoverSources(
      [provider('p1', [source('a', ['**'], 0)]), provider('p2', [source('b', ['x/**'], 1)])],
      { projectRoot: '/repo', changedFiles: [] },
    )

    expect(sources.map((s) => s.id)).toEqual(['a', 'b'])
  })

  test('names both providers when two claim the same id', async () => {
    // The registry would throw an opaque duplicate-id error later; catching it
    // here says which providers actually disagree.
    const dup = source('same', ['**'], 0)

    await expect(
      discoverSources([provider('p1', [dup]), provider('p2', [dup])], {
        projectRoot: '/repo',
        changedFiles: [],
      }),
    ).rejects.toThrow(/'same' claimed by both 'p1' and 'p2'/)
  })
})

describe('review', () => {
  test('dispatches one call per intersecting source and skips the rest', async () => {
    const seen: string[] = []
    const result = await run(async (spec) => {
      seen.push(spec.prompt.slice(0, 0) + String(seen.length))
      return reply({ findings: [] })
    })

    expect(result.jobs.map((j) => j.source.id)).toEqual(['root', 'lib'])
    expect(seen).toHaveLength(2)
    expect(result.skipped.map((s) => s.id)).toEqual(['docs'])
  })

  test('attributes findings to the source that produced them', async () => {
    const result = await run(async (_spec, _config) =>
      reply({
        findings: [{ file: FILE_A, evidence: 'e', why: 'w', severity: 'violation' }],
      }),
    )

    expect(result.findings.map((f) => [f.sourceId, f.file])).toEqual([
      ['root', FILE_A],
      ['lib', FILE_A],
    ])
    expect(result.degraded).toBe(false)
  })

  test('a failed job degrades the run without discarding the others', async () => {
    let call = 0
    const result = await run(async () => {
      if (call++ === 0) {
        return {
          ...reply(undefined),
          ok: false,
          error: { reason: 'timeout' as const, detail: 'killed after 1ms' },
        }
      }
      return reply({
        findings: [{ file: FILE_A, evidence: 'e', why: 'w', severity: 'drift' }],
      })
    })

    expect(result.degraded).toBe(true)
    expect(result.outcomes[0]?.error).toContain('timeout')
    expect(result.findings).toHaveLength(1)
  })

  test('Infinity concurrency runs every job at once', async () => {
    let inFlight = 0
    let peak = 0
    const dispatch: Dispatch = async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return reply({ findings: [] })
    }

    const all = await run(dispatch, { ...DEFAULT_CONFIG, concurrency: Number.POSITIVE_INFINITY })
    expect(peak).toBe(all.jobs.length)
  })

  test('a setting out of range rejects the run, naming the setting', async () => {
    const never: Dispatch = () => Promise.reject(new Error('no agent should start'))
    for (const [patch, message] of [
      [{ concurrency: Number.NaN }, 'concurrency expects a positive integer or Infinity'],
      [{ concurrency: 0 }, 'concurrency expects'],
      [{ maxFilesPerJob: -1 }, 'maxFilesPerJob expects'],
      [{ timeoutMs: 0 }, 'timeoutMs expects'],
      [{ severityFloor: 'fatal' }, 'severityFloor expects violation, tension, drift'],
    ] as const) {
      await expect(
        run(never, { ...DEFAULT_CONFIG, ...patch } as typeof DEFAULT_CONFIG),
      ).rejects.toThrow(message)
    }
  })

  test('an unknown engine rejects the run before any agent starts', async () => {
    const options = {
      projectRoot: '/repo',
      sources: SOURCES,
      changedFiles: [FILE_A],
      diffs: DIFFS,
      config: { ...DEFAULT_CONFIG, engine: 'not-an-agent' },
    }
    await expect(review(options)).rejects.toThrow('engine expects one of claude')
    // Per job too: a configFor that names an unknown engine is refused up front.
    await expect(
      review({
        ...options,
        config: DEFAULT_CONFIG,
        configFor: () => ({ ...DEFAULT_CONFIG, engine: 'nope' }),
      }),
    ).rejects.toThrow("(got 'nope')")
  })

  test('never exceeds the configured concurrency', async () => {
    let inFlight = 0
    let peak = 0
    const many = Array.from({ length: 12 }, (_, i) => source(`s${i}`, ['**'], i))

    await review({
      projectRoot: '/repo',
      sources: many,
      changedFiles: [FILE_A],
      diffs: DIFFS,
      config: { ...DEFAULT_CONFIG, concurrency: 3 },
      dispatch: async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight -= 1
        return reply({ findings: [] })
      },
    })

    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
  })

  test('outcomes stay in planned order regardless of settle order', async () => {
    const result = await run(async (spec) => {
      // Make the first-planned job settle last.
      const slow = spec.prompt.includes('rules for root')
      await new Promise((r) => setTimeout(r, slow ? 20 : 1))
      return reply({ findings: [] })
    })

    expect(result.outcomes.map((o) => o.job.source.id)).toEqual(['root', 'lib'])
  })

  test('flags a job whose prompt crosses the size limit, and still runs it', async () => {
    let dispatched = 0
    const result = await run(
      async () => {
        dispatched += 1
        return reply({ findings: [] })
      },
      { ...DEFAULT_CONFIG, maxPromptBytes: 200 },
    )

    // Recorded, not enforced: a partial answer beats none.
    expect(dispatched).toBe(result.jobs.length)
    for (const o of result.outcomes) {
      expect(o.oversize?.limit).toBe(200)
      expect(o.oversize!.bytes).toBeGreaterThan(200)
    }
  })

  test('leaves a job under the limit unflagged', async () => {
    const result = await run(async () => reply({ findings: [] }))

    for (const o of result.outcomes) expect(o.oversize).toBeUndefined()
  })

  test('maxPromptBytes 0 disables the check', async () => {
    const result = await run(async () => reply({ findings: [] }), {
      ...DEFAULT_CONFIG,
      maxPromptBytes: 0,
    })

    for (const o of result.outcomes) expect(o.oversize).toBeUndefined()
  })

  test('an oversized job that also fails reports both', async () => {
    const result = await run(
      async () => ({
        ...reply(undefined),
        ok: false,
        error: { reason: 'timeout' as const, detail: 'killed' },
      }),
      { ...DEFAULT_CONFIG, maxPromptBytes: 200 },
    )

    // The size is the likelier cause of the timeout, so it must survive it.
    expect(result.outcomes[0]?.error).toContain('timeout')
    expect(result.outcomes[0]?.oversize).toBeDefined()
  })

  test('a dry run plans and measures without dispatching', async () => {
    let dispatched = 0
    const result = await review({
      projectRoot: '/repo',
      sources: SOURCES,
      changedFiles: [FILE_A, FILE_B],
      diffs: DIFFS,
      config: DEFAULT_CONFIG,
      dryRun: true,
      dispatch: async () => {
        dispatched += 1
        return reply({ findings: [] })
      },
    })

    expect(dispatched).toBe(0)
    expect(result.dryRun).toBe(true)
    expect(result.jobs.map((j) => j.source.id)).toEqual(['root', 'lib'])
    expect(result.skipped.map((s) => s.id)).toEqual(['docs'])
    expect(result.findings).toEqual([])
    expect(result.degraded).toBe(false)
  })

  test('a dry run measures the same prompt a real run would send', async () => {
    const opts = {
      projectRoot: '/repo',
      sources: SOURCES,
      changedFiles: [FILE_A, FILE_B],
      diffs: DIFFS,
      config: DEFAULT_CONFIG,
      dispatch: async () => reply({ findings: [] }),
    }
    const dry = await review({ ...opts, dryRun: true })
    const wet = await review(opts)

    expect(dry.outcomes.map((o) => o.promptBytes)).toEqual(wet.outcomes.map((o) => o.promptBytes))
    expect(dry.outcomes.every((o) => o.promptBytes > 0)).toBe(true)
  })

  test('a dry run still flags an oversized prompt', async () => {
    // Catching this before spending is more useful than after.
    const result = await review({
      projectRoot: '/repo',
      sources: SOURCES,
      changedFiles: [FILE_A, FILE_B],
      diffs: DIFFS,
      config: { ...DEFAULT_CONFIG, maxPromptBytes: 200 },
      dryRun: true,
      dispatch: async () => reply({ findings: [] }),
    })

    expect(result.outcomes.every((o) => o.oversize !== undefined)).toBe(true)
  })

  test('a real run reports dryRun false', async () => {
    const result = await run(async () => reply({ findings: [] }))

    expect(result.dryRun).toBe(false)
  })

  test('an empty changeset dispatches nothing', async () => {
    let calls = 0
    const result = await review({
      projectRoot: '/repo',
      sources: SOURCES,
      changedFiles: [],
      diffs: [],
      config: DEFAULT_CONFIG,
      dispatch: async () => {
        calls += 1
        return reply({ findings: [] })
      },
    })

    expect(calls).toBe(0)
    expect(result.findings).toEqual([])
    expect(result.degraded).toBe(false)
  })
})

describe('review — sharding and observed tokens', () => {
  const wide = [source('root', ['**'], 0)]
  const files = Array.from({ length: 9 }, (_, i) => `lib/f${i}.ts`)
  const diffs = files.map((file) => ({ file, diff: `+ ${file}` }))

  function shardedRun(dispatch: Dispatch, maxFilesPerJob: number) {
    return review({
      projectRoot: '/repo',
      sources: wide,
      changedFiles: files,
      diffs,
      config: { ...DEFAULT_CONFIG, maxFilesPerJob },
      dispatch,
    })
  }

  test('each shard is asked about only its own files', async () => {
    const prompts: string[] = []
    await shardedRun((spec) => {
      prompts.push(spec.prompt)
      return Promise.resolve(reply({ findings: [] }))
    }, 3)

    expect(prompts).toHaveLength(3)
    for (const [i, prompt] of prompts.entries()) {
      for (const [j, file] of files.entries()) {
        // A shard's prompt names its three files and no others, so a judge
        // cannot be influenced by a diff that a different shard owns.
        expect(prompt.includes(` path=${JSON.stringify(file)}>`)).toBe(Math.floor(j / 3) === i)
      }
    }
  })

  test('findings from every shard merge under the one source', async () => {
    const run = await shardedRun((spec) => {
      // Cite whichever file this shard was actually given.
      const file = files.find((f) => spec.prompt.includes(` path=${JSON.stringify(f)}>`))!
      return Promise.resolve(
        reply({
          findings: [{ file, evidence: 'x', why: 'y', severity: 'drift' }],
        }),
      )
    }, 3)

    expect(run.jobs).toHaveLength(3)
    expect(run.findings).toHaveLength(3)
    // Attribution is to the rule source; the split leaves no trace here.
    expect(new Set(run.findings.map((f) => f.sourceId))).toEqual(new Set(['root']))
  })

  test("a shard's judge cannot cite a file belonging to another shard", async () => {
    const run = await shardedRun(
      () =>
        Promise.resolve(
          reply({
            findings: [{ file: files[8], evidence: 'x', why: 'y', severity: 'drift' }],
          }),
        ),
      3,
    )

    // Only the shard that owns f8 keeps the finding; the other two strayed
    // outside their scope and are dropped, exactly as an unsharded job would
    // be for a file outside its source.
    expect(run.findings).toHaveLength(1)
  })

  test('a smaller shard sends a smaller prompt', async () => {
    const one = await shardedRun(() => Promise.resolve(reply({ findings: [] })), 0)
    const many = await shardedRun(() => Promise.resolve(reply({ findings: [] })), 3)

    expect(one.outcomes).toHaveLength(1)
    for (const o of many.outcomes) {
      expect(o.promptBytes).toBeLessThan(one.outcomes[0]!.promptBytes)
    }
  })

  test("the engine's own input-token count is recorded when reported", async () => {
    const run = await shardedRun(
      () =>
        Promise.resolve({
          ...reply({ findings: [] }),
          usage: { inputTokens: 1234 },
        } as AgentResult),
      0,
    )

    expect(run.outcomes[0]?.promptTokens).toBe(1234)
  })

  test('an engine that reports no usage leaves the count absent, not zero', async () => {
    const run = await shardedRun(() => Promise.resolve(reply({ findings: [] })), 0)

    // Absent and zero mean different things: one is "not reported", the
    // other would claim a free call.
    expect(run.outcomes[0]?.promptTokens).toBeUndefined()
  })

  test('a dry run reports the shards it would dispatch', async () => {
    const run = await review({
      projectRoot: '/repo',
      sources: wide,
      changedFiles: files,
      diffs,
      config: { ...DEFAULT_CONFIG, maxFilesPerJob: 3 },
      dryRun: true,
      dispatch: () => Promise.reject(new Error('dry run must not dispatch')),
    })

    expect(run.jobs.map((j) => j.shard?.index)).toEqual([1, 2, 3])
    expect(run.outcomes.every((o) => o.promptBytes > 0)).toBe(true)
  })
})

describe('review signal', () => {
  test('aborting the signal kills the running agent process', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rule-review-abort-'))
    const pidFile = join(dir, 'pid')
    const agent = join(dir, 'agent.sh')
    writeFileSync(agent, `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 30\n`)
    chmodSync(agent, 0o755)
    const interrupt = new AbortController()
    try {
      const pending = review({
        projectRoot: dir,
        sources: [source('root', ['**'], 0)],
        changedFiles: [FILE_A],
        diffs: DIFFS,
        config: { ...DEFAULT_CONFIG, binary: agent },
        signal: interrupt.signal,
      })
      await waitFor('the agent to write its pid', () => existsSync(pidFile))
      const pid = Number(readFileSync(pidFile, 'utf8').trim())

      interrupt.abort()
      await waitFor(`agent pid ${pid} to exit`, () => !alive(pid))

      expect((await pending).degraded).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('review — a reply that is not a findings object', () => {
  for (const [name, structured] of [
    ['no structured reply', undefined],
    ['a prose reply', 'Sorry, here is prose instead of JSON'],
    ['an object with no findings array', { result: [] }],
    ['findings that is not an array', { findings: 'x' }],
  ] as const) {
    test(`${name} fails the job instead of reading as clean`, async () => {
      const result = await run(async () => ({ ...reply(structured), text: 'a.ts uses any' }))

      expect(result.degraded).toBe(true)
      expect(result.outcomes.every((o) => o.error !== undefined)).toBe(true)
      expect(result.outcomes[0]?.error).toContain('a.ts uses any')
    })
  }

  test('a valid array with one malformed entry keeps the good ones and stays clean', async () => {
    const result = await run(async () =>
      reply({
        findings: [{ file: FILE_A, evidence: 'e', why: 'w', severity: 'violation' }, { junk: 1 }],
      }),
    )

    expect(result.degraded).toBe(false)
    expect(result.findings).toHaveLength(2)
  })
})

describe('review — a throw while planning or reporting a job', () => {
  const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id) => source(id, ['**'], 0))

  test('a configFor that throws rejects before any agent is dispatched', async () => {
    const dispatched: string[] = []
    await expect(
      review({
        projectRoot: '/repo',
        sources: FIVE,
        changedFiles: [FILE_A],
        diffs: DIFFS,
        config: { ...DEFAULT_CONFIG, concurrency: 2 },
        configFor: (job) => {
          if (job.source.id === 'b') throw new Error('nested profile does not resolve')
          return DEFAULT_CONFIG
        },
        dispatch: async (spec) => {
          dispatched.push(spec.prompt)
          await new Promise((r) => setTimeout(r, 50))
          return reply({ findings: [] })
        },
      }),
    ).rejects.toThrow('nested profile does not resolve')

    // Nothing may arrive later either, so a fixed drain is the assertion.
    await new Promise((r) => setTimeout(r, 200))
    expect(dispatched).toEqual([])
  })

  test('an onJobSettled that throws aborts the jobs in flight and starts no more', async () => {
    let dispatched = 0
    const aborted: boolean[] = []
    await expect(
      review({
        projectRoot: '/repo',
        sources: FIVE,
        changedFiles: [FILE_A],
        diffs: DIFFS,
        config: { ...DEFAULT_CONFIG, concurrency: 2 },
        onJobSettled: () => {
          throw new Error('progress output broke')
        },
        // The first job settles at once; the second waits until it is aborted,
        // as a real agent is killed.
        dispatch: async (_spec, _config, signal) => {
          const n = dispatched++
          if (n === 0) return reply({ findings: [] })
          await new Promise<void>((r) => {
            if (signal?.aborted === true) r()
            else signal?.addEventListener('abort', () => r(), { once: true })
            setTimeout(r, 2_000)
          })
          aborted.push(signal?.aborted === true)
          return reply({ findings: [] })
        },
      }),
    ).rejects.toThrow('progress output broke')

    await waitFor('the in-flight job to settle', () => aborted.length === 1)
    expect(aborted).toEqual([true])
    // Nothing may start later either, so a fixed drain is the assertion.
    await new Promise((r) => setTimeout(r, 200))
    expect(dispatched).toBe(2)
  })
})

describe('review — after the run is aborted or has rejected', () => {
  const FIVE = ['a', 'b', 'c', 'd', 'e'].map((id) => source(id, ['**'], 0))

  test('aborting the signal dispatches no further job', async () => {
    const interrupt = new AbortController()
    let dispatched = 0
    const result = await review({
      projectRoot: '/repo',
      sources: FIVE,
      changedFiles: [FILE_A],
      diffs: DIFFS,
      config: { ...DEFAULT_CONFIG, concurrency: 1 },
      signal: interrupt.signal,
      dispatch: async () => {
        dispatched++
        interrupt.abort()
        return reply({ findings: [] })
      },
    })

    expect(dispatched).toBe(1)
    expect(result.outcomes).toHaveLength(5)
    expect(result.degraded).toBe(true)
    expect(result.outcomes.slice(1).every((o) => o.error?.startsWith('aborted') === true)).toBe(
      true,
    )
  })

  test('onJobSettled is not called once review has rejected', async () => {
    const settled: string[] = []
    let release = (): void => {}
    const held = new Promise<void>((r) => (release = r))
    await expect(
      review({
        projectRoot: '/repo',
        sources: FIVE.slice(0, 2),
        changedFiles: [FILE_A],
        diffs: DIFFS,
        config: { ...DEFAULT_CONFIG, concurrency: 2 },
        onJobSettled: (o) => {
          settled.push(o.job.source.id)
          if (o.job.source.id === 'a') throw new Error('progress output broke')
        },
        // Job b ignores the abort and settles only once released, after the
        // rejection has been seen.
        dispatch: async (spec) => {
          if (spec.prompt.includes('rules for b')) await held
          return reply({ findings: [] })
        },
      }),
    ).rejects.toThrow('progress output broke')

    release()
    // Nothing may arrive later, so a fixed drain is the assertion.
    await new Promise((r) => setTimeout(r, 100))
    expect(settled).toEqual(['a'])
  })

  test('a schema-mismatch error stays on one line', async () => {
    const result = await run(async () => ({ ...reply(undefined), text: 'line one\nline two\r\n' }))

    expect(result.outcomes[0]?.error).toContain('line one line two')
    expect(result.outcomes[0]?.error).not.toMatch(/[\r\n]/)
  })
})

test('a job none of whose files has a diff is not dispatched, and degrades the run', async () => {
  const dispatched: string[] = []
  const result = await review({
    projectRoot: '/repo',
    sources: [source('root', ['**'], 0)],
    changedFiles: ['nested/'],
    diffs: [],
    config: DEFAULT_CONFIG,
    dispatch: async (spec) => {
      dispatched.push(spec.prompt)
      return reply({ findings: [] })
    },
  })

  expect(dispatched).toEqual([])
  expect(result.degraded).toBe(true)
  expect(result.outcomes[0]?.error).toContain('none of its files has a diff')
})

test('a dry run shows the same job as not judged, so the preview matches what --strict fails on', async () => {
  const result = await review({
    projectRoot: '/repo',
    sources: [source('root', ['**'], 0)],
    changedFiles: ['nested/'],
    diffs: [],
    config: DEFAULT_CONFIG,
    dryRun: true,
  })

  expect(result.degraded).toBe(true)
  expect(result.outcomes[0]?.error).toBe('not judged: none of its files has a diff')
})

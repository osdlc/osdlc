import { describe, expect, test } from 'vitest'

import { planJobs } from '../src/plan.ts'
import type { RuleSource } from '../src/types.ts'

/** A rule source with only the fields selection cares about. */
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

// The worked example from the design doc: nested instruction files plus one
// standard, over a changeset touching three different subtrees.
const SOURCES: RuleSource[] = [
  source('root', ['**'], 0),
  source('docs', ['docs/**'], 1),
  source('pumice', ['apps/pumice/**'], 2),
  source('lib', ['packages/core/lib/**'], 3),
  source('skills', ['packages/core/skills/**'], 3),
  {
    ...source('style', ['packages/core/skills/**/SKILL.md'], 4),
    kind: 'standard',
  },
]

const FILE_A = 'packages/core/lib/model/read.ts'
const FILE_B = 'packages/core/skills/task-work/SKILL.md'
const FILE_C = 'apps/pumice/src/main.rs'
const CHANGESET = [FILE_A, FILE_B, FILE_C]

// Sharding off by default in these fixtures: the selection tests are about
// which source covers which file, and a split would double the expected jobs
// for reasons unrelated to what they assert.
const NO_EXCLUDE = { exclude: [] as string[], maxFilesPerJob: 0 }

describe('planJobs', () => {
  test('pairs every source with only the files it governs', () => {
    const { jobs } = planJobs(SOURCES, CHANGESET, NO_EXCLUDE)

    expect(jobs.map((j) => [j.source.id, [...j.files]])).toEqual([
      ['root', [FILE_A, FILE_B, FILE_C]],
      ['pumice', [FILE_C]],
      ['lib', [FILE_A]],
      ['skills', [FILE_B]],
      ['style', [FILE_B]],
    ])
  })

  test('drops sources the changeset cannot reach', () => {
    const { jobs, skipped } = planJobs(SOURCES, CHANGESET, NO_EXCLUDE)

    expect(skipped).toEqual([{ id: 'docs', label: 'docs' }])
    expect(jobs.map((j) => j.source.id)).not.toContain('docs')
  })

  test('overlapping scopes each judge the same file', () => {
    const { jobs } = planJobs(SOURCES, CHANGESET, NO_EXCLUDE)
    const judgingB = jobs.filter((j) => j.files.includes(FILE_B))

    // B is covered by the root rules, the skills rules, and style — three
    // independent judgements, which is the point of the fan-out.
    expect(judgingB.map((j) => j.source.id)).toEqual(['root', 'skills', 'style'])
  })

  test('orders jobs broad to specific', () => {
    const { jobs } = planJobs(SOURCES, CHANGESET, NO_EXCLUDE)
    const depths = jobs.map((j) => j.source.depth)

    expect(depths).toEqual([...depths].sort((a, b) => a - b))
  })

  test('ties at equal depth break by id, so ordering is stable', () => {
    const shuffled = [SOURCES[4]!, SOURCES[3]!, SOURCES[0]!]
    const { jobs } = planJobs(shuffled, [FILE_A, FILE_B], NO_EXCLUDE)

    expect(jobs.map((j) => j.source.id)).toEqual(['root', 'lib', 'skills'])
  })

  test('excluded files are removed before selection', () => {
    const { jobs, skipped } = planJobs(SOURCES, CHANGESET, {
      maxFilesPerJob: 0,
      exclude: ['packages/core/skills/**'],
    })

    expect(jobs.find((j) => j.source.id === 'root')?.files).toEqual([FILE_A, FILE_C])
    // Excluding every file a source governs drops the source entirely.
    expect(skipped.map((s) => s.id)).toEqual(['docs', 'skills', 'style'])
  })

  test('an empty changeset plans nothing and skips everything', () => {
    const { jobs, skipped } = planJobs(SOURCES, [], NO_EXCLUDE)

    expect(jobs).toEqual([])
    expect(skipped).toHaveLength(SOURCES.length)
  })

  test('no job is ever planned with zero files', () => {
    const { jobs } = planJobs(SOURCES, CHANGESET, NO_EXCLUDE)

    for (const job of jobs) expect(job.files.length).toBeGreaterThan(0)
  })

  test('a bare directory pattern does not match its subtree', () => {
    // Intersect does not infer: `src/x` is an exact path, not `src/x/**`.
    // A provider that forgets the `/**` gets nothing, loudly.
    const { jobs, skipped } = planJobs(
      [source('bare', ['packages/core/lib'], 3)],
      [FILE_A],
      NO_EXCLUDE,
    )

    expect(jobs).toEqual([])
    expect(skipped.map((s) => s.id)).toEqual(['bare'])
  })

  test('duplicate source ids are rejected at construction', () => {
    expect(() =>
      planJobs([source('dup', ['**'], 0), source('dup', ['docs/**'], 1)], CHANGESET, NO_EXCLUDE),
    ).toThrow(/duplicate registry id 'dup'/)
  })
})

describe('planJobs — sharding', () => {
  const files = Array.from({ length: 10 }, (_, i) => `docs/f${i}.md`)
  const only = [source('root', ['**'], 0)]

  test('a source under the limit produces one unsharded job', () => {
    const { jobs } = planJobs(only, files, { exclude: [], maxFilesPerJob: 10 })

    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.files).toEqual(files)
    // The common case carries no shard vocabulary at all.
    expect(jobs[0]?.shard).toBeUndefined()
  })

  test('a source over the limit is split, covering every file exactly once', () => {
    const { jobs } = planJobs(only, files, { exclude: [], maxFilesPerJob: 4 })

    expect(jobs).toHaveLength(3)
    expect(jobs.flatMap((j) => j.files)).toEqual(files)
    expect(jobs.map((j) => j.shard)).toEqual([
      { index: 1, of: 3 },
      { index: 2, of: 3 },
      { index: 3, of: 3 },
    ])
  })

  test('every shard judges the same rules', () => {
    const { jobs } = planJobs(only, files, { exclude: [], maxFilesPerJob: 4 })

    // The whole point: a split changes how many judgements run, never what
    // any of them is asked. Findings stay attributable to the one source.
    for (const job of jobs) expect(job.source).toBe(only[0]!)
  })

  test('shards are balanced rather than filled to the limit', () => {
    // 10 files over a limit of 6 is 5+5, not 6+4: a job that judges four
    // files reasons better than one judging six, and both calls happen
    // anyway, so there is nothing to gain by loading the first one up.
    const { jobs } = planJobs(only, files, { exclude: [], maxFilesPerJob: 6 })

    expect(jobs.map((j) => j.files.length)).toEqual([5, 5])
  })

  test('the remainder is spread, so no shard is left near-empty', () => {
    // 13 over 4 is 4+3+3+3, not 4+4+4+1; 10 over 3 is 3+3+2+2, not 3+3+3+1.
    const sizes = (n: number, limit: number) =>
      planJobs(
        only,
        Array.from({ length: n }, (_, i) => `docs/f${i}.md`),
        { exclude: [], maxFilesPerJob: limit },
      ).jobs.map((j) => j.files.length)

    expect(sizes(13, 4)).toEqual([4, 3, 3, 3])
    expect(sizes(10, 3)).toEqual([3, 3, 2, 2])
    for (let limit = 1; limit <= 12; limit++) {
      for (let n = 1; n <= 25; n++) {
        const s = sizes(n, limit)
        expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1)
      }
    }
  })

  test('no shard is ever empty', () => {
    for (let limit = 1; limit <= 12; limit++) {
      for (let count = 1; count <= 25; count++) {
        const { jobs } = planJobs(
          only,
          Array.from({ length: count }, (_, i) => `docs/f${i}.md`),
          { exclude: [], maxFilesPerJob: limit },
        )
        for (const job of jobs) {
          expect(job.files.length).toBeGreaterThan(0)
          expect(job.files.length).toBeLessThanOrEqual(limit)
        }
        // `of` must describe the shards that actually exist.
        const of = jobs[0]?.shard?.of
        if (of !== undefined) expect(of).toBe(jobs.length)
      }
    }
  })

  test('0 disables sharding however wide the source', () => {
    const { jobs } = planJobs(only, files, { exclude: [], maxFilesPerJob: 0 })

    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.files).toHaveLength(10)
  })

  test('shards of one source stay adjacent and in order', () => {
    const { jobs } = planJobs([source('root', ['**'], 0), source('docs', ['docs/**'], 1)], files, {
      exclude: [],
      maxFilesPerJob: 4,
    })

    // Broad-to-specific still holds, with a source's own shards contiguous
    // and ascending — a report reads down one source before starting the next.
    expect(jobs.map((j) => `${j.source.id}:${j.shard?.index ?? '-'}`)).toEqual([
      'root:1',
      'root:2',
      'root:3',
      'docs:1',
      'docs:2',
      'docs:3',
    ])
  })
})

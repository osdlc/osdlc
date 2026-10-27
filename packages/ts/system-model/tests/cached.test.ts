/**
 * The cached collection layer: `runners.readCached` and `runners.collectAndCache`.
 *
 * Every test passes its own throwaway cache directory. Discovery is pinned to
 * `"walk"`: a fixture root is a bare temp directory, and `"auto"` would make
 * the result depend on whether the machine's tmpdir sits inside a repository.
 */

import { describe, expect, test } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { EXEC_MAX_AGE_MS, MODEL_VERSION, entryPath, type CacheEntry } from '../src/cache.ts'
import { MAX_FINGERPRINT_FILES } from '../src/fingerprint.ts'
import type { CollectOptions, DetectOptions } from '../src/contract.ts'
import type { ProviderResult, Task } from '../src/model.ts'
import { nodeScripts, pnpm } from '../src/plugins/node/index.ts'
import { pythonTools } from '../src/plugins/python/index.ts'
import { procfile } from '../src/plugins/runners/index.ts'
import { createProject } from '../src/project.ts'
import type { ProjectProfile, ToolDef } from '../src/tool.ts'
import { fakeRunners, fixtureRoot, removeRoot } from './support.ts'

const CHAIN = [{ label: 'runner', hint: 'the runner' }]

function task(runner: string, name: string): Task {
  return {
    id: `${runner}:${name}`,
    runner,
    path: [runner, name],
    display: `${runner} ${name}`,
    argv: [runner, name],
    cwd: '.',
    source: `${runner}.txt`,
    origin: 'declared',
    parameters: [],
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

const absent: ProviderResult = { status: 'absent', tasks: [], diagnostics: [] }

/** A parse runner detected by, and answering from, one file it reads through `ctx`. */
function parseTool(id: string): ToolDef {
  return {
    id,
    markers: [{ files: `${id}.txt`, tier: 'files' }],
    roles: {
      runner: {
        kind: 'parse',
        chain: CHAIN,
        async collect(ctx) {
          const text = await ctx.readText(`${id}.txt`)
          if (text === null) return absent
          return { status: 'ok', tasks: [task(id, text.trim())], diagnostics: [] }
        },
      },
    },
  }
}

/**
 * A parse runner that DISCOVERS by listing: every `*.job` file is a task. Its
 * answer depends on the answer to its query, not only on the files that
 * answer happened to name.
 */
function listingTool(id: string): ToolDef {
  return {
    id,
    markers: [{ files: '*.job', tier: 'files' }],
    roles: {
      runner: {
        kind: 'parse',
        chain: CHAIN,
        async collect(ctx) {
          const found = await ctx.files('*.job')
          if (found.length === 0) return absent
          return {
            status: 'ok',
            tasks: found.map((path) => task(id, path.replace(/\.job$/, ''))),
            diagnostics: [],
          }
        },
      },
    },
  }
}

/**
 * An exec runner: detected by `<id>.conf`, asks its tool for the answer, and
 * declares a `watch` basename its own reads can never cover.
 */
function execTool(id: string): ToolDef {
  return {
    id,
    markers: [{ files: `${id}.conf`, tier: 'files' }],
    roles: {
      runner: {
        kind: 'exec',
        chain: CHAIN,
        watch: [`${id}.watched`],
        async collect(ctx) {
          const result = await ctx.runner(id).run(['list'], { cwd: ctx.root })
          return { status: 'ok', tasks: [task(id, result.stdout.trim())], diagnostics: [] }
        },
      },
    },
  }
}

/** A runner that throws, so its report is an error and never cacheable. */
function throwingTool(id: string): ToolDef {
  return {
    id,
    markers: [{ files: `${id}.txt`, tier: 'files' }],
    roles: {
      runner: {
        kind: 'parse',
        chain: CHAIN,
        collect(): Promise<ProviderResult> {
          return Promise.reject(new Error('boom'))
        },
      },
    },
  }
}

const runners = fakeRunners([{ binary: 'gamma', argv: ['list'], stdout: 'release' }])

type Options = DetectOptions & CollectOptions

/** A project over `tools`, and the options both detection and collection take. */
function setup(tools: ToolDef[], extra: Options = {}) {
  const options: Options = {
    discovery: 'walk',
    makeRunner: runners.make,
    which: () => null,
    ...extra,
  }
  return { project: createProject({ tools }), options }
}

async function detect(
  s: ReturnType<typeof setup>,
  root: string,
  extra: Options = {},
): Promise<ProjectProfile> {
  return s.project.detect(root, { ...s.options, ...extra })
}

/** Rewrite one stored entry in place: the only way to age a probe deterministically. */
async function patchEntry(
  dir: string,
  root: string,
  runner: string,
  patch: Partial<CacheEntry>,
): Promise<void> {
  const path = entryPath(dir, root, runner)
  const stored = JSON.parse(await readFile(path, 'utf-8')) as CacheEntry
  await writeFile(path, `${JSON.stringify({ ...stored, ...patch })}\n`, 'utf-8')
}

function stateOf(rows: Array<{ runner: string; state: string }>, id: string): string {
  return rows.find((r) => r.runner === id)?.state ?? '(no row)'
}

describe('runners.readCached', () => {
  test('a cold cache is all misses and no catalog', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'beta.txt': 'test\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), parseTool('beta')])
      const profile = await detect(s, root)
      const cached = await s.project.runners.readCached(profile, cache, s.options)

      expect(cached.catalog).toBeNull()
      expect(cached.allFresh).toBe(false)
      expect(cached.runners).toEqual([
        { runner: 'alpha', state: 'miss', estimateMs: null, slow: false, cost: 'cheap' },
        { runner: 'beta', state: 'miss', estimateMs: null, slow: false, cost: 'cheap' },
      ])
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('what collectAndCache stored comes back fresh, report for report', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'beta.txt': 'test\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), parseTool('beta')])
      const profile = await detect(s, root)
      const live = await s.project.runners.collectAndCache(profile, cache, s.options)
      const cached = await s.project.runners.readCached(profile, cache, s.options)

      expect(cached.allFresh).toBe(true)
      expect(cached.runners.map((r) => r.state)).toEqual(['fresh', 'fresh'])
      expect(cached.catalog?.reports).toEqual(live.reports)
      expect(cached.catalog?.root).toBe(live.root)
      expect(cached.catalog?.discovery).toBe('walk')
      expect(cached.catalog?.allowExec).toBe(false)
      // An age is reported for anything that came out of the store.
      expect(cached.runners.every((r) => typeof r.ageMs === 'number')).toBe(true)
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an aborted signal stops the read with its reason, rather than reading all misses', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha')])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      const closed = new AbortController()
      closed.abort(new Error('the caller left'))
      await expect(
        s.project.runners.readCached(profile, cache, { ...s.options, signal: closed.signal }),
      ).rejects.toThrow('the caller left')
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test("editing one runner's file stales that runner", async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'beta.txt': 'test\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), parseTool('beta')])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      await writeFile(`${root}/alpha.txt`, 'package\n', 'utf-8')

      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.allFresh).toBe(false)
      expect(cached.runners[0]).toMatchObject({
        runner: 'alpha',
        state: 'stale',
        reason: 'changed',
      })
      // Runners whose tools sit in one package share its detection evidence,
      // so `beta` is not asserted: an edit may stale both.
      // The stale report is still served, by design.
      expect(cached.catalog?.reports).toHaveLength(2)
      expect(cached.catalog?.reports[0]?.tasks[0]?.display).toBe('alpha build')
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('a rewrite to identical bytes changes nothing', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha')])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      // What a formatter, a `git checkout` of the same content, or a rebuild of
      // a generated file does all day. An mtime-keyed cache would miss here.
      await writeFile(`${root}/alpha.txt`, 'build\n', 'utf-8')

      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.allFresh).toBe(true)
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an aged exec entry expires; a parse entry of the same age does not', async () => {
    const root = await fixtureRoot({
      'alpha.txt': 'build\n',
      'gamma.conf': 'x\n',
      'gamma.watched': 'y\n',
    })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), execTool('gamma')], { allowExec: true })
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)

      const old = new Date(Date.now() - EXEC_MAX_AGE_MS - 60_000).toISOString()
      await patchEntry(cache, root, 'alpha', { takenAt: old })
      await patchEntry(cache, root, 'gamma', { takenAt: old })

      const cached = await s.project.runners.readCached(profile, cache, s.options)
      // The parse runner read every byte it depends on through `ctx`, so its
      // digest is enough and the clock adds nothing.
      expect(stateOf(cached.runners, 'alpha')).toBe('fresh')
      expect(cached.runners.find((r) => r.runner === 'gamma')).toMatchObject({
        state: 'stale',
        reason: 'max-age',
      })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test("an exec runner's declared watch file stales the entry", async () => {
    const root = await fixtureRoot({ 'gamma.conf': 'x\n', 'gamma.watched': 'y\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([execTool('gamma')], { allowExec: true })
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      expect((await s.project.runners.readCached(profile, cache, s.options)).allFresh).toBe(true)

      await writeFile(`${root}/gamma.watched`, 'changed\n', 'utf-8')
      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.runners[0]).toMatchObject({ state: 'stale', reason: 'changed' })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('generatedAt is the oldest contributing probe, not now', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'beta.txt': 'test\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), parseTool('beta')])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)

      const oldest = new Date(Date.now() - 90 * 60_000).toISOString()
      await patchEntry(cache, root, 'alpha', { takenAt: oldest })
      await patchEntry(cache, root, 'beta', {
        takenAt: new Date(Date.now() - 60_000).toISOString(),
      })

      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.catalog?.generatedAt).toBe(oldest)
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an errored runner is never stored, so it stays a miss', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'bad.txt': '' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), throwingTool('bad')])
      const profile = await detect(s, root)
      const live = await s.project.runners.collectAndCache(profile, cache, s.options)
      expect(live.reports[1]?.status).toBe('error')

      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(stateOf(cached.runners, 'alpha')).toBe('fresh')
      expect(stateOf(cached.runners, 'bad')).toBe('miss')
      expect(cached.allFresh).toBe(false)
      expect(cached.catalog?.reports.map((r) => r.runner)).toEqual(['alpha'])
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test("a withheld exec runner is fresh, carrying collect()'s own report", async () => {
    const root = await fixtureRoot({ 'gamma.conf': 'x\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([execTool('gamma')], {
        allowExec: false,
        execWithheldHint: 'run `way trust` first',
      })
      const profile = await detect(s, root)
      const cached = await s.project.runners.readCached(profile, cache, s.options)
      const live = await s.project.runners.collect(profile, s.options)

      expect(cached.runners).toEqual([
        { runner: 'gamma', state: 'fresh', estimateMs: null, slow: false, cost: 'slow' },
      ])
      expect(cached.allFresh).toBe(true)
      expect(cached.catalog?.reports).toEqual(live.reports)
      expect(cached.catalog?.reports[0]?.skippedForExec).toBe(true)
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('a tool that was not detected has no row, cached or live', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), parseTool('beta'), execTool('gamma')])
      const profile = await detect(s, root)
      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.runners.map((r) => r.runner)).toEqual(['alpha'])
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('`only` and `exclude` narrow the rows read', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'beta.txt': 'test\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), parseTool('beta')])
      const profile = await detect(s, root)
      const only = await s.project.runners.readCached(profile, cache, {
        ...s.options,
        only: ['beta'],
      })
      expect(only.runners.map((r) => r.runner)).toEqual(['beta'])
      const without = await s.project.runners.readCached(profile, cache, {
        ...s.options,
        exclude: ['beta'],
      })
      expect(without.runners.map((r) => r.runner)).toEqual(['alpha'])
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('estimateMs and slow come from the stored window', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha')])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      await patchEntry(cache, root, 'alpha', { durations: [1800, 2000, 9000] })

      const cached = await s.project.runners.readCached(profile, cache, s.options)
      // The median, so one cold outlier does not set the expectation.
      expect(cached.runners[0]?.estimateMs).toBe(2000)
      expect(cached.runners[0]?.slow).toBe(true)
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('a NEW file matching a pattern the runner queried makes the entry stale', async () => {
    // A fingerprint built only from recorded reads describes the files as they
    // were. `one.job` was read and hashed. `two.job` did not exist and was
    // never read, so it changed nothing. The cache would then never show its
    // task, because a parse entry has no max-age limit.
    const root = await fixtureRoot({ 'one.job': 'x' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([listingTool('jobs')])
      const profile = await detect(s, root)
      const live = await s.project.runners.collectAndCache(profile, cache, s.options)
      expect(live.reports[0]?.tasks).toHaveLength(1)

      // Nothing that already existed changed.
      await writeFile(join(root, 'two.job'), 'y', 'utf-8')

      // A fresh profile, as a later run would have: the lister memoizes.
      const later = await detect(s, root)
      const cached = await s.project.runners.readCached(later, cache, s.options)
      expect(cached.runners[0]?.state).toBe('stale')
      expect(cached.runners[0]?.reason).toBe('changed')
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  // 257 files to write and hash, which Windows runners take seconds over.
  test(
    'a truncated fingerprint is an info diagnostic on the runner',
    { timeout: 30_000 },
    async () => {
      const jobs: Record<string, string> = { 'alpha.txt': 'build' }
      for (let i = 0; i <= MAX_FINGERPRINT_FILES; i++) jobs[`job-${i}.job`] = 'x'
      const root = await fixtureRoot(jobs)
      const cache = await fixtureRoot({})
      try {
        const s = setup([listingTool('jobs'), parseTool('alpha')])
        const profile = await detect(s, root)
        const live = await s.project.runners.collectAndCache(profile, cache, s.options)
        const diagnosticsOf = (id: string) =>
          live.reports.find((r) => r.runner === id)?.diagnostics ?? []

        expect(diagnosticsOf('jobs')).toEqual([
          {
            severity: 'info',
            message: expect.stringContaining(`first ${MAX_FINGERPRINT_FILES} files`),
          },
        ])
      } finally {
        await removeRoot(root)
        await removeRoot(cache)
      }
    },
  )

  test('a queried pattern that matches nothing new leaves the entry fresh', async () => {
    // Re-expanding the query must not make every entry stale.
    const root = await fixtureRoot({ 'one.job': 'x' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([listingTool('jobs')])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      await writeFile(join(root, 'unrelated.txt'), 'y', 'utf-8')

      const later = await detect(s, root)
      const cached = await s.project.runners.readCached(later, cache, s.options)
      expect(cached.runners[0]?.state).toBe('fresh')
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })
})

describe('marker files the runner never read', () => {
  /** A runner detected by `alpha.txt` or `alpha.lock` that reads only `alpha.txt`. */
  const twoMarkers: ToolDef = {
    id: 'alpha',
    markers: [
      { files: 'alpha.txt', tier: 'files' },
      { files: 'alpha.lock', tier: 'files' },
    ],
    roles: {
      runner: {
        kind: 'parse',
        chain: CHAIN,
        async collect(ctx) {
          const text = await ctx.readText('alpha.txt')
          return text === null
            ? absent
            : { status: 'ok', tasks: [task('alpha', text.trim())], diagnostics: [] }
        },
      },
    },
  }

  test('editing a marker file stales the entry, though the runner did not read it', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'alpha.lock': 'v1\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([twoMarkers])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      expect((await s.project.runners.readCached(profile, cache, s.options)).allFresh).toBe(true)

      await writeFile(join(root, 'alpha.lock'), 'v2\n', 'utf-8')
      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.runners[0]).toMatchObject({ state: 'stale', reason: 'changed' })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('a marker file that appears later stales the entry', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([twoMarkers])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)

      await writeFile(join(root, 'alpha.lock'), 'v1\n', 'utf-8')
      const later = await detect(s, root)
      const cached = await s.project.runners.readCached(later, cache, s.options)
      expect(cached.runners[0]).toMatchObject({ state: 'stale', reason: 'changed' })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('editing the lockfile in a package stales its node-scripts entry', async () => {
    const root = await fixtureRoot({
      'package.json': JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    })
    const cache = await fixtureRoot({})
    try {
      const s = setup([nodeScripts, pnpm])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      expect(
        (await s.project.runners.readCached(profile, cache, s.options)).runners[0],
      ).toMatchObject({ runner: 'node-scripts', state: 'fresh' })

      await writeFile(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 10\n', 'utf-8')
      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.runners[0]).toMatchObject({
        runner: 'node-scripts',
        state: 'stale',
        reason: 'changed',
      })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })
})

describe('a manifest edit after detect', () => {
  /** Detect, cache, edit the manifest, cache again with the held profile, then read with a new one. */
  async function recache(
    runner: string,
    tools: ToolDef[],
    files: Record<string, string>,
    edit: [string, string],
  ): Promise<{ held: string[]; fresh: { state: string | undefined; tasks: string[] } }> {
    const root = await fixtureRoot(files)
    const cache = await fixtureRoot({})
    try {
      const s = setup(tools)
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      await writeFile(join(root, edit[0]), edit[1], 'utf-8')
      const again = await s.project.runners.collectAndCache(profile, cache, s.options)
      const read = await s.project.runners.readCached(await detect(s, root), cache, s.options)
      const displays = (c: typeof again | null) =>
        (c?.reports ?? [])
          .filter((r) => r.runner === runner)
          .flatMap((r) => r.tasks)
          .map((t) => t.display)
      return {
        held: displays(again),
        fresh: {
          state: read.runners.find((r) => r.runner === runner)?.state,
          tasks: displays(read.catalog),
        },
      }
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  }

  test('node-scripts: the held profile collects the new script, and the cache does not keep the old list', async () => {
    const result = await recache(
      'node-scripts',
      [nodeScripts, pnpm],
      {
        'package.json': JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }),
        'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      },
      ['package.json', JSON.stringify({ name: 'x', scripts: { build: 'tsc', deploy: 'x' } })],
    )
    expect(result.held).toEqual(['pnpm run build', 'pnpm run deploy'])
    expect(result.fresh).toEqual({ state: 'fresh', tasks: ['pnpm run build', 'pnpm run deploy'] })
  })

  test('python: the held profile collects the new script, and the cache does not keep the old list', async () => {
    const result = await recache(
      'python',
      [...pythonTools],
      { 'pyproject.toml': '[project.scripts]\na = "m:a"\n', 'uv.lock': '' },
      ['pyproject.toml', '[project.scripts]\na = "m:a"\nb = "m:b"\n'],
    )
    expect(result.held).toEqual(['uv run a', 'uv run b'])
    expect(result.fresh).toEqual({ state: 'fresh', tasks: ['uv run a', 'uv run b'] })
  })
})

describe('runners.collectAndCache', () => {
  test('stores one entry per runner that ran, and none for a withheld one', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'gamma.conf': 'x\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), execTool('gamma')], { allowExec: false })
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)

      expect(await readFile(entryPath(cache, root, 'alpha'), 'utf-8')).toContain('"runner":"alpha"')
      await expect(readFile(entryPath(cache, root, 'gamma'), 'utf-8')).rejects.toThrow()
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an unwritable cache directory costs time, never the answer', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    try {
      const s = setup([parseTool('alpha')])
      const profile = await detect(s, root)
      // A path that cannot be a directory: `alpha.txt` is a file.
      const catalog = await s.project.runners.collectAndCache(
        profile,
        `${root}/alpha.txt`,
        s.options,
      )
      expect(catalog.reports[0]?.tasks[0]?.display).toBe('alpha build')
    } finally {
      await removeRoot(root)
    }
  })
})

describe('a changed exclusion set', () => {
  /** A root whose listing runner finds one real job and one inside a fixture tree. */
  const jobsRoot = () => fixtureRoot({ 'real.job': 'x', 'tests/mini-repo/fake.job': 'x' })

  test('stales an entry the excluded files are baked into', async () => {
    // The case no digest can catch. Excluding a tree changes nothing on disk:
    // every path the probe recorded still exists with the same bytes, so the
    // fingerprint matches, the entry reads fresh, and the tasks just excluded
    // go on being served out of the store.
    const root = await jobsRoot()
    const cache = await fixtureRoot({})
    try {
      const s = setup([listingTool('alpha')])
      const before = await detect(s, root)
      const live = await s.project.runners.collectAndCache(before, cache, s.options)
      expect(live.reports[0]?.tasks).toHaveLength(2)

      const after = await detect(s, root, { excludePaths: ['tests/mini-repo'] })
      const cached = await s.project.runners.readCached(after, cache, s.options)

      expect(stateOf(cached.runners, 'alpha')).toBe('stale')
      // Named for what actually moved: "changed" would send someone looking
      // through their repository for an edit that is in their config file.
      expect(cached.runners[0]?.reason).toBe('excludes')
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('turning the built-in excludes off marks an entry stale, reason excludes', async () => {
    const root = await jobsRoot()
    const cache = await fixtureRoot({})
    try {
      const s = setup([listingTool('alpha')])
      const before = await detect(s, root)
      await s.project.runners.collectAndCache(before, cache, s.options)
      const after = await detect(s, root, { useBuiltinExcludes: false })
      const cached = await s.project.runners.readCached(after, cache, s.options)
      expect(cached.runners[0]?.reason).toBe('excludes')
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('re-probing under the exclusion drops the excluded tasks and stays fresh', async () => {
    const root = await jobsRoot()
    const cache = await fixtureRoot({})
    try {
      const s = setup([listingTool('alpha')])
      const profile = await detect(s, root, { excludePaths: ['tests/mini-repo'] })
      const live = await s.project.runners.collectAndCache(profile, cache, s.options)
      expect(live.reports[0]?.tasks.map((t) => t.display)).toEqual(['alpha real'])

      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(stateOf(cached.runners, 'alpha')).toBe('fresh')
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an unchanged exclusion set is not a reason to re-probe', async () => {
    // An ordering difference between the write and the read would stale every
    // entry on every run, which is indistinguishable from having no cache.
    const root = await jobsRoot()
    const cache = await fixtureRoot({})
    try {
      const s = setup([listingTool('alpha')])
      const write = await detect(s, root, { excludePaths: ['vendor', 'tests/mini-repo'] })
      await s.project.runners.collectAndCache(write, cache, s.options)

      const read = await detect(s, root, { excludePaths: ['tests/mini-repo', 'vendor'] })
      expect(
        stateOf((await s.project.runners.readCached(read, cache, s.options)).runners, 'alpha'),
      ).toBe('fresh')
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })
})

describe('how an entry was probed', () => {
  test('an entry probed without exec is stale once exec is allowed, and the reverse', async () => {
    // A parse runner such as just reads more when it may run its tool, so a
    // scan stored by an untrusted run must not answer a trusted one.
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha')])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)

      const trusted = await s.project.runners.readCached(profile, cache, {
        ...s.options,
        allowExec: true,
      })
      expect(trusted.runners[0]).toMatchObject({ state: 'stale', reason: 'exec' })
      // A scan without exec is still a fair answer, marked stale.
      expect(trusted.catalog?.reports).toHaveLength(1)

      await s.project.runners.collectAndCache(profile, cache, { ...s.options, allowExec: true })
      const untrusted = await s.project.runners.readCached(profile, cache, s.options)
      expect(untrusted.runners[0]).toMatchObject({ state: 'stale', reason: 'exec' })
      // A report probed with exec does not answer a run without it.
      expect(untrusted.catalog).toBeNull()
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an entry another package version probed is stale', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha')])
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      const stored = JSON.parse(
        await readFile(entryPath(cache, profile.root, 'alpha'), 'utf-8'),
      ) as CacheEntry
      expect(stored.modelVersion).toBe(MODEL_VERSION)
      expect(MODEL_VERSION).toMatch(/^\d+\.\d+\.\d+/)

      await patchEntry(cache, profile.root, 'alpha', { modelVersion: '0.0.1' })
      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.runners[0]).toMatchObject({ state: 'stale', reason: 'version' })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an entry is stale when the tool binary resolves elsewhere, or appears', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const tool = { ...parseTool('alpha'), binary: 'alpha' }
      const s = setup([tool], { which: () => '/opt/alpha/1.0/bin/alpha' })
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      expect((await s.project.runners.readCached(profile, cache, s.options)).allFresh).toBe(true)

      const upgraded = { ...s.options, which: () => '/opt/alpha/2.0/bin/alpha' }
      const after = await s.project.runners.readCached(profile, cache, upgraded)
      expect(after.runners[0]).toMatchObject({ state: 'stale', reason: 'tool' })

      const removed = { ...s.options, which: () => null }
      const gone = await s.project.runners.readCached(profile, cache, removed)
      expect(gone.runners[0]).toMatchObject({ state: 'stale', reason: 'tool' })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an entry is stale when a binary the runner looked up appears', async () => {
    // A Procfile picks its manager by what is on the PATH.
    const root = await fixtureRoot({ Procfile: 'web: node server.js\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([procfile])
      const profile = await detect(s, root)
      const first = await s.project.runners.collectAndCache(profile, cache, s.options)
      expect(first.reports[0]?.tasks[0]?.argv).toEqual(['sh', '-c', 'node server.js'])
      expect((await s.project.runners.readCached(profile, cache, s.options)).allFresh).toBe(true)

      const installed = {
        ...s.options,
        which: (b: string) => (b === 'overmind' ? '/bin/overmind' : null),
      }
      const after = await s.project.runners.readCached(profile, cache, installed)
      expect(after.runners[0]).toMatchObject({ state: 'stale', reason: 'tool' })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('an entry is stale when the tool binary is replaced in place', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    const bin = await fixtureRoot({ alpha: '#!/bin/sh\necho 1\n' })
    try {
      const path = join(bin, 'alpha')
      const tool = { ...parseTool('alpha'), binary: 'alpha' }
      const s = setup([tool], { which: () => path })
      const profile = await detect(s, root)
      await s.project.runners.collectAndCache(profile, cache, s.options)
      expect((await s.project.runners.readCached(profile, cache, s.options)).allFresh).toBe(true)

      await writeFile(path, '#!/bin/sh\necho 2.0\n')
      const after = await s.project.runners.readCached(profile, cache, s.options)
      expect(after.runners[0]).toMatchObject({ state: 'stale', reason: 'tool' })
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
      await removeRoot(bin)
    }
  })
})

describe('runners.collectAndStore', () => {
  test('the catalog comes before the store is written, and stored settles once it is', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n', 'beta.txt': 'test\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha'), parseTool('beta')])
      const profile = await detect(s, root)
      const { catalog, stored } = await s.project.runners.collectAndStore(profile, cache, s.options)
      expect(catalog.reports.map((r) => r.runner)).toEqual(['alpha', 'beta'])
      // The writes need file I/O, so they cannot have ended yet.
      const first = await Promise.race([stored.then(() => 'stored'), Promise.resolve('catalog')])
      expect(first).toBe('catalog')

      await stored
      const cached = await s.project.runners.readCached(profile, cache, s.options)
      expect(cached.allFresh).toBe(true)
      expect(cached.catalog?.reports).toEqual(catalog.reports)
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  // 300 fixture files; a loaded Windows runner can pass the 5 s default.
  test(
    'a fingerprint over the cap is noted in the catalog at once',
    { timeout: 30_000 },
    async () => {
      const files: Record<string, string> = {}
      for (let i = 0; i < 300; i++) files[`job-${String(i).padStart(3, '0')}.job`] = ''
      const root = await fixtureRoot(files)
      const cache = await fixtureRoot({})
      try {
        const s = setup([listingTool('jobs')])
        const profile = await detect(s, root)
        const { catalog, stored } = await s.project.runners.collectAndStore(
          profile,
          cache,
          s.options,
        )
        const messages = catalog.reports[0]!.diagnostics.map((d) => d.message)
        expect(messages.some((m) => m.includes('fingerprint covers only the first'))).toBe(true)
        await stored
      } finally {
        await removeRoot(root)
        await removeRoot(cache)
      }
    },
  )

  test('two probes in a row store in order: the later one is what stays', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha')])
      const profile = await detect(s, root)
      const a = await s.project.runners.collectAndStore(profile, cache, s.options)
      await writeFile(join(root, 'alpha.txt'), 'release\n')
      const b = await s.project.runners.collectAndStore(profile, cache, s.options)
      await Promise.all([a.stored, b.stored])
      const entry = JSON.parse(
        await readFile(entryPath(cache, profile.root, 'alpha'), 'utf-8'),
      ) as CacheEntry
      expect(entry.report.tasks.map((t) => t.path.at(-1))).toEqual(['release'])
      expect(entry.durations).toHaveLength(2)
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })

  test('a failed write never rejects stored', async () => {
    const root = await fixtureRoot({ 'alpha.txt': 'build\n' })
    const cache = await fixtureRoot({})
    try {
      const s = setup([parseTool('alpha')])
      const profile = await detect(s, root)
      // A file where the cache directory should be: every write fails.
      const blocked = join(cache, 'file')
      await writeFile(blocked, '')
      const { stored } = await s.project.runners.collectAndStore(profile, blocked, s.options)
      await expect(stored).resolves.toBeUndefined()
    } finally {
      await removeRoot(root)
      await removeRoot(cache)
    }
  })
})

/**
 * Cache store behaviour.
 *
 * Every test names its own cache directory; nothing reads or writes a real
 * home or cache directory.
 */

import { describe, expect, test } from 'vitest'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  CACHE_FORMAT_VERSION,
  DURATION_WINDOW,
  entryPath,
  estimateMs,
  isSlow,
  pushDuration,
  readEntry,
  writeEntry,
  type CacheEntry,
} from '../src/cache.ts'
import { builtins } from '../src/builtins.ts'
import { collectRunners, type ProbeRecord } from '../src/collect.ts'
import type { RunnerReport } from '../src/model.ts'
import { buildRegistry } from '../src/registry.ts'
import { createProject } from '../src/project.ts'
import { fakeRunners, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

function okReport(runner: string): RunnerReport {
  return {
    runner,
    chain: [{ label: 'runner', hint: 'the runner' }],
    status: 'ok',
    skippedForExec: false,
    diagnostics: [{ severity: 'info', message: 'nested object' }],
    tasks: [
      {
        id: `${runner}:build`,
        runner,
        path: [runner, 'build'],
        display: `${runner} build`,
        argv: [runner, 'build'],
        cwd: '.',
        source: 'justfile',
        origin: 'declared',
        parameters: [],
        tags: [],
        persistent: { value: false, declared: false },
        executes: 'local',
      },
    ],
  }
}

function entryFor(
  root: string,
  report: RunnerReport,
  overrides: Partial<CacheEntry> = {},
): CacheEntry {
  return {
    version: CACHE_FORMAT_VERSION,
    root,
    runner: report.runner,
    kind: 'parse',
    takenAt: new Date().toISOString(),
    probeMs: 12,
    durations: [12],
    fingerprint: {
      digest: 'abc',
      paths: ['justfile'],
      patterns: [],
      truncated: false,
      excludes: [],
    },
    report,
    allowExec: false,
    modelVersion: '0.0.0',
    ...overrides,
  }
}

describe('entryPath', () => {
  test('is versioned and one file per runner', () => {
    // With `/`, so the checks read the same on Windows.
    const slashed = (p: string) => p.replaceAll('\\', '/')
    const path = slashed(entryPath('/c/dir', '/repos/dev', 'moon'))
    expect(path).toContain(`/reports/v${CACHE_FORMAT_VERSION}/`)
    expect(path.startsWith('/c/dir/')).toBe(true)
    expect(path.endsWith('/moon.json')).toBe(true)
    expect(dirname(path).split('/').pop()).toMatch(/^dev-[0-9a-f]{16}$/)
    // Two runners under one root share a directory but never a file.
    expect(dirname(slashed(entryPath('/c/dir', '/repos/dev', 'just')))).toBe(dirname(path))
  })

  test('same-named roots in different places get different directories', () => {
    expect(dirname(entryPath('/c/dir', '/a/dev', 'just'))).not.toBe(
      dirname(entryPath('/c/dir', '/b/dev', 'just')),
    )
  })

  test('the format version is 5', () => {
    expect(CACHE_FORMAT_VERSION).toBe(5)
  })
})

describe('readEntry / writeEntry', () => {
  test('a cold miss is null, not an error', async () => {
    const dir = await fixtureRoot({})
    try {
      expect(await readEntry(dir, '/repos/dev', 'moon')).toBeNull()
    } finally {
      await removeRoot(dir)
    }
  })

  test('a warm hit round-trips the report', async () => {
    const dir = await fixtureRoot({})
    try {
      const entry = entryFor('/repos/dev', okReport('just'))
      expect(await writeEntry(dir, entry)).toBe(true)
      const back = await readEntry(dir, '/repos/dev', 'just')
      expect(back?.report.tasks[0]?.display).toBe('just build')
      expect(back?.report).toEqual(entry.report)
      expect(back?.runner).toBe('just')
      expect(back?.fingerprint.digest).toBe('abc')
      expect(back?.durations).toEqual([12])
    } finally {
      await removeRoot(dir)
    }
  })

  test('a format-version bump discards the entry', async () => {
    const dir = await fixtureRoot({})
    try {
      await writeEntry(dir, entryFor('/repos/dev', okReport('just')))
      const path = entryPath(dir, '/repos/dev', 'just')
      const stored = JSON.parse(await readFile(path, 'utf-8')) as CacheEntry
      await writeFile(path, JSON.stringify({ ...stored, version: CACHE_FORMAT_VERSION + 1 }))
      expect(await readEntry(dir, '/repos/dev', 'just')).toBeNull()
    } finally {
      await removeRoot(dir)
    }
  })

  test('a corrupt file is a miss, never a throw', async () => {
    const dir = await fixtureRoot({})
    try {
      await writeEntry(dir, entryFor('/repos/dev', okReport('just')))
      await writeFile(entryPath(dir, '/repos/dev', 'just'), '{ not json')
      expect(await readEntry(dir, '/repos/dev', 'just')).toBeNull()
    } finally {
      await removeRoot(dir)
    }
  })

  test('a file holding something other than an entry is a miss', async () => {
    const dir = await fixtureRoot({})
    try {
      await writeEntry(dir, entryFor('/repos/dev', okReport('just')))
      await writeFile(entryPath(dir, '/repos/dev', 'just'), 'null')
      expect(await readEntry(dir, '/repos/dev', 'just')).toBeNull()
    } finally {
      await removeRoot(dir)
    }
  })

  test('an entry with the right version but no usable report is a miss', async () => {
    const dir = await fixtureRoot({})
    try {
      await writeEntry(dir, entryFor('/repos/dev', okReport('just')))
      const path = entryPath(dir, '/repos/dev', 'just')
      await writeFile(path, JSON.stringify({ version: CACHE_FORMAT_VERSION }))
      expect(await readEntry(dir, '/repos/dev', 'just')).toBeNull()
      const report = { ...okReport('just'), tasks: undefined }
      const entry = { ...entryFor('/repos/dev', okReport('just')), report }
      await writeFile(path, JSON.stringify(entry))
      expect(await readEntry(dir, '/repos/dev', 'just')).toBeNull()
    } finally {
      await removeRoot(dir)
    }
  })

  test('an error report is never written', async () => {
    const dir = await fixtureRoot({})
    try {
      const report = { ...okReport('moon'), status: 'error' as const, tasks: [] }
      expect(await writeEntry(dir, entryFor('/repos/dev', report))).toBe(false)
      expect(await readEntry(dir, '/repos/dev', 'moon')).toBeNull()
    } finally {
      await removeRoot(dir)
    }
  })

  test('a skippedForExec report is never written', async () => {
    const dir = await fixtureRoot({})
    try {
      const report = {
        ...okReport('moon'),
        status: 'absent' as const,
        skippedForExec: true,
        tasks: [],
      }
      expect(await writeEntry(dir, entryFor('/repos/dev', report))).toBe(false)
      expect(await readEntry(dir, '/repos/dev', 'moon')).toBeNull()
    } finally {
      await removeRoot(dir)
    }
  })

  test('a write leaves no temp file behind', async () => {
    const dir = await fixtureRoot({})
    try {
      await writeEntry(dir, entryFor('/repos/dev', okReport('just')))
      const names = await readdir(dirname(entryPath(dir, '/repos/dev', 'just')))
      expect(names).toEqual(['just.json'])
    } finally {
      await removeRoot(dir)
    }
  })

  test('a concurrent write of another runner is not lost', async () => {
    const dir = await fixtureRoot({})
    try {
      await Promise.all([
        writeEntry(dir, entryFor('/repos/dev', okReport('just'))),
        writeEntry(dir, entryFor('/repos/dev', okReport('moon'))),
      ])
      expect((await readEntry(dir, '/repos/dev', 'just'))?.runner).toBe('just')
      expect((await readEntry(dir, '/repos/dev', 'moon'))?.runner).toBe('moon')
    } finally {
      await removeRoot(dir)
    }
  })

  test('a write into an unwritable location reports false instead of throwing', async () => {
    const dir = await fixtureRoot({ blocker: 'a file, not a directory' })
    try {
      const entry = entryFor('/repos/dev', okReport('just'))
      expect(await writeEntry(`${dir}/blocker`, entry)).toBe(false)
    } finally {
      await removeRoot(dir)
    }
  })
})

describe('durations', () => {
  test('estimateMs is the median, and null when empty', () => {
    expect(estimateMs([])).toBeNull()
    expect(estimateMs([100])).toBe(100)
    expect(estimateMs([100, 200, 4000])).toBe(200)
    expect(estimateMs([100, 200, 300, 400])).toBe(250)
    // A single cold JVM boot does not drag the estimate the way a mean would.
    expect(estimateMs([80, 90, 100, 110, 9000])).toBe(100)
  })

  test("isSlow reads the repo's own measurements", () => {
    expect(isSlow([])).toBe(false)
    expect(isSlow([50, 60, 70])).toBe(false)
    expect(isSlow([1500, 1600, 1700])).toBe(true)
  })

  test('the window keeps the last five, oldest first', () => {
    let window: number[] = []
    for (let i = 1; i <= 8; i++) {
      window = pushDuration({ durations: window } as CacheEntry, i)
    }
    expect(window.length).toBe(DURATION_WINDOW)
    expect(window).toEqual([4, 5, 6, 7, 8])
    expect(pushDuration(null, 42)).toEqual([42])
  })
})

describe('collect probeObserver', () => {
  /** Detect with the built-ins, then collect through the internal observer. */
  async function observe(
    root: string,
    options: { allowExec?: boolean; which?: (b: string) => string | null },
  ) {
    const project = createProject({ tools: builtins })
    const registry = buildRegistry(builtins)
    const makeRunner = fakeRunners([]).make
    const which = options.which ?? fakeWhich({})
    const profile = await project.detect(root, { discovery: 'walk', makeRunner, which })
    const probes: ProbeRecord[] = []
    const catalog = await collectRunners(registry, profile, {
      allowExec: options.allowExec ?? false,
      makeRunner,
      which,
      probeObserver: (p) => probes.push(p),
    })
    return { probes, catalog }
  }

  test('records non-empty reads for a runner whose tool was detected', async () => {
    const root = await fixtureRoot({
      'package.json': JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }),
    })
    try {
      const { probes } = await observe(root, {})

      const node = probes.find((p) => p.runner === 'node-scripts')
      expect(node).toBeDefined()
      expect(node?.reads).toContain('package.json')
      expect(node?.durationMs).toBeGreaterThanOrEqual(0)
      expect(node?.report.status).toBe('ok')
      // The lister comes through so a fingerprint costs no second walk.
      expect(await node?.files('package.json')).toEqual(['package.json'])
    } finally {
      await removeRoot(root)
    }
  })

  test("the queries include the tool's marker and manifest patterns", async () => {
    const root = await fixtureRoot({
      'package.json': JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }),
    })
    try {
      const { probes } = await observe(root, {})
      const node = probes.find((p) => p.runner === 'node-scripts')
      expect(node?.queries).toContain('package.json')
    } finally {
      await removeRoot(root)
    }
  })

  test('is not called for an exec runner withheld under allowExec: false', async () => {
    const root = await fixtureRoot({ '.moon/workspace.yml': 'projects: []\n' })
    try {
      const { probes, catalog } = await observe(root, {
        allowExec: false,
        which: fakeWhich({ moon: '/usr/bin/moon' }),
      })

      expect(catalog.reports.find((r) => r.runner === 'moon')?.skippedForExec).toBe(true)
      expect(probes.map((p) => p.runner)).not.toContain('moon')
    } finally {
      await removeRoot(root)
    }
  })

  test('an exec runner that ran and failed IS observed, but is not stored', async () => {
    const root = await fixtureRoot({ 'mise.toml': "[tasks.build]\nrun = 'x'\n" })
    const dir = await fixtureRoot({})
    try {
      // No canned answer: the fake runner reports a non-zero exit, which is
      // what a missing or refusing tool looks like.
      const { probes } = await observe(root, {
        allowExec: true,
        which: fakeWhich({ mise: '/usr/bin/mise' }),
      })

      const mise = probes.find((p) => p.runner === 'mise')
      expect(mise).toBeDefined()
      expect(mise?.report.status).toBe('error')
      expect(mise?.watch).toContain('/mise.toml')
      // The detection evidence is part of what the fingerprint reads.
      expect(mise?.reads).toContain('mise.toml')

      const written = await writeEntry(
        dir,
        entryFor(root, mise?.report as RunnerReport, { kind: 'exec' }),
      )
      expect(written).toBe(false)
    } finally {
      await removeRoot(root)
      await removeRoot(dir)
    }
  })
})

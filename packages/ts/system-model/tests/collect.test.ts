import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import type { RunnerContext } from '../src/contract.ts'
import { diagnostics, tasks, type ProviderResult, type RunnerReport } from '../src/model.ts'
import { just, make, moon } from '../src/plugins/runners/index.ts'
import { nodeScripts } from '../src/plugins/node/index.ts'
import { createProject } from '../src/project.ts'
import type { ProjectProfile, RunnerRole, ToolDef } from '../src/tool.ts'
import {
  collect,
  detectAndCollect,
  fakeRunners,
  fakeWhich,
  fixtureRoot,
  moonProjectsJson,
  removeRoot,
} from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

function walkOpts(extra: Record<string, unknown> = {}) {
  return {
    discovery: 'walk' as const,
    makeRunner: fakeRunners([]).make,
    which: fakeWhich({}),
    ...extra,
  }
}

const SAMPLE = {
  justfile: 'build:\n    echo build\n',
  'package.json': JSON.stringify({ name: 'demo', scripts: { test: 'node --test' } }),
  Makefile: 'all:\n\techo all\n',
}

const absent: ProviderResult = { status: 'absent', tasks: [], diagnostics: [] }

/** A runner tool detected by a marker file named `<id>.txt`. */
function toolOf(id: string, role: Partial<RunnerRole> = {}, extra: Partial<ToolDef> = {}): ToolDef {
  return {
    id,
    markers: [{ files: `${id}.txt`, tier: 'files' }],
    roles: {
      runner: {
        kind: 'parse',
        chain: [{ label: 'runner', hint: '' }],
        collect: async () => absent,
        ...role,
      },
    },
    ...extra,
  }
}

describe('collect', () => {
  test('records how it was configured, because that changes the results', async () => {
    const dir = await root(SAMPLE)
    const catalog = await collect(dir, walkOpts())

    expect(catalog.root).toBe(dir)
    expect(catalog.discovery).toBe('walk')
    expect(catalog.allowExec).toBe(false)
    expect(Date.parse(catalog.generatedAt)).not.toBeNaN()
  })

  test('reports every detected runner in registry order', async () => {
    const dir = await root(SAMPLE)
    const catalog = await collect(dir, walkOpts())

    expect(catalog.reports.map((r) => r.runner).slice(0, 3)).toEqual([
      'just',
      'node-scripts',
      'make',
    ])
    expect(catalog.reports.every((r) => r.chain.length > 0)).toBe(true)
  })

  test('an undetected tool produces no report', async () => {
    const dir = await root({ justfile: 'build:\n    echo\n' })
    const { profile, catalog } = await detectAndCollect(dir, walkOpts())

    expect(profile.tools).toContain('just')
    expect(profile.tools).not.toContain('make')
    expect(catalog.reports.find((r) => r.runner === 'make')).toBeUndefined()
    expect(catalog.reports.find((r) => r.runner === 'cargo')).toBeUndefined()
  })

  test('`only` and `exclude` narrow the runner set', async () => {
    const dir = await root(SAMPLE)
    expect(
      (await collect(dir, walkOpts({ only: ['just', 'make'] }))).reports.map((r) => r.runner),
    ).toEqual(['just', 'make'])
    expect(
      (await collect(dir, walkOpts({ exclude: ['node-scripts'] }))).reports
        .map((r) => r.runner)
        .filter((id) => ['just', 'node-scripts', 'make'].includes(id)),
    ).toEqual(['just', 'make'])
  })

  test('onProbe gets each probed runner and its time, but not a withheld one', async () => {
    const dir = await root({ 'quick.txt': '', 'held.txt': '' })
    const probes: { runner: string; durationMs: number }[] = []
    await collect(
      dir,
      walkOpts({
        tools: [toolOf('quick'), toolOf('held', { kind: 'exec' })],
        allowExec: false,
        onProbe: (probe: { runner: string; durationMs: number }) => probes.push(probe),
      }),
    )
    expect(probes.map((p) => p.runner)).toEqual(['quick'])
    expect(probes[0]!.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('onRunners names every reported runner before onReport gets the first report', async () => {
    const dir = await root({ 'quick.txt': '', 'held.txt': '' })
    const seen: string[] = []
    const catalog = await collect(
      dir,
      walkOpts({
        tools: [toolOf('quick'), toolOf('held', { kind: 'exec' })],
        allowExec: false,
        onRunners: (runners: readonly string[]) => seen.push(`runners ${runners.join(',')}`),
        onReport: (report: RunnerReport) => seen.push(`report ${report.runner}`),
      }),
    )
    const ids = catalog.reports.map((r) => r.runner)
    expect(seen[0]).toBe(`runners ${ids.join(',')}`)
    // The withheld runner is reported too, and each runner exactly once.
    expect(seen.slice(1).sort()).toEqual(ids.map((id) => `report ${id}`).sort())
    const held = catalog.reports.find((r) => r.runner === 'held')!
    expect(held.skippedForExec).toBe(true)
  })

  test('onReport gets each report as it is ready, before slower runners finish', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slow = toolOf('slow', {
      collect: async () => {
        await gate
        return absent
      },
    })
    const dir = await root({ 'quick.txt': '', 'slow.txt': '' })
    const order: string[] = []
    const done = collect(
      dir,
      walkOpts({
        tools: [toolOf('quick'), slow],
        onReport: (report: RunnerReport) => {
          order.push(report.runner)
          if (report.runner === 'quick') release()
        },
      }),
    )
    await done
    expect(order).toEqual(['quick', 'slow'])
  })

  test('a throwing onReport rejects the collect', async () => {
    const dir = await root({ 'quick.txt': '' })
    await expect(
      collect(
        dir,
        walkOpts({
          tools: [toolOf('quick')],
          onReport: () => {
            throw new Error('listener failed')
          },
        }),
      ),
    ).rejects.toThrow('listener failed')
  })

  test('`only` can name a tool that was not detected, and gets nothing for it', async () => {
    const dir = await root({ justfile: 'build:\n    echo\n' })
    expect((await collect(dir, walkOpts({ only: ['make'] }))).reports).toEqual([])
  })

  test('synthesized runner groups come after the registered runners', async () => {
    const dir = await root({
      ...SAMPLE,
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'mise.toml': '[tools]\nnode = "22"\n',
    })
    const catalog = await collect(dir, walkOpts())
    const ids = catalog.reports.map((r) => r.runner)

    expect(ids.slice(-2)).toEqual(['package-manager', 'tool-manager'])
    expect(ids.indexOf('make')).toBeLessThan(ids.indexOf('package-manager'))
    expect(
      (await collect(dir, walkOpts({ exclude: ['package-manager'] }))).reports.map((r) => r.runner),
    ).not.toContain('package-manager')
  })

  test("a runner that throws does not lose the others' work", async () => {
    const exploding = toolOf('boom', {
      collect: () => {
        throw new Error('runner blew up')
      },
    })
    const dir = await root({ ...SAMPLE, 'boom.txt': '' })
    const catalog = await collect(dir, walkOpts({ tools: [exploding, just, make] }))

    const boom = catalog.reports.find((r) => r.runner === 'boom')!
    expect(boom.status).toBe('error')
    expect(boom.diagnostics[0]?.message).toBe('runner blew up')
    expect(boom.skippedForExec).toBe(false)
    expect(tasks(catalog).length).toBeGreaterThan(0)
  })

  test("a caller's own tool is a first-class citizen", async () => {
    const mine = toolOf('house', {
      chain: [
        { label: 'runner', hint: 'the house runner' },
        { label: 'script', hint: 'one entry' },
      ],
      collect: async (ctx: RunnerContext) => {
        const found = await ctx.files('house.txt')
        return {
          status: found.length > 0 ? 'ok' : 'absent',
          tasks: found.map((source) => ({
            id: `house:${source}:go`,
            runner: 'house',
            path: ['house', 'go'],
            argv: ['house', 'go'],
            cwd: '.',
            display: 'house go',
            parameters: [],
            source,
            origin: 'declared' as const,
            tags: [],
            persistent: { value: false, declared: false },
            executes: 'local' as const,
          })),
          diagnostics: [],
        }
      },
    })
    const dir = await root({ 'house.txt': '' })
    const catalog = await collect(dir, walkOpts({ tools: [mine] }))

    expect(tasks(catalog).map((t) => t.display)).toEqual(['house go'])
  })

  test("the report's brand comes from the tool, else from the deprecated role field", async () => {
    const dir = await root({ 'a.txt': '', 'b.txt': '' })
    const tools = [
      toolOf('a', { brand: { color: '#000000' } }, { brand: { color: '#111111' } }),
      toolOf('b', { brand: { color: '#222222' } }),
    ]
    const catalog = await collect(dir, walkOpts({ tools }))
    expect(catalog.reports.map((r) => [r.runner, r.brand?.color])).toEqual([
      ['a', '#111111'],
      ['b', '#222222'],
    ])
  })

  test("a runner's brand is copied onto its report, and stays optional", async () => {
    const dir = await root(SAMPLE)
    const catalog = await collect(dir, walkOpts())

    const justReport = catalog.reports.find((r) => r.runner === 'just')!
    expect(justReport.brand?.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(justReport.brand?.icon).toContain('<svg')

    // A runner with no brand omits the `brand` key. Consumers must not require it.
    const plain = await collect(
      await root({ 'bare.txt': '' }),
      walkOpts({ tools: [toolOf('bare')] }),
    )
    expect('brand' in plain.reports[0]!).toBe(false)
  })

  test('every task carries an executable argv and a chain rooted at its runner', async () => {
    const dir = await root(SAMPLE)
    const catalog = await collect(dir, walkOpts({ tools: [just, nodeScripts, make] }))

    expect(tasks(catalog).length).toBeGreaterThan(0)
    for (const report of catalog.reports) {
      for (const task of report.tasks) {
        expect(task.runner).toBe(report.runner)
        expect(task.path[0]).toBe(report.runner)
        expect(task.argv.length).toBeGreaterThan(0)
        expect(task.id).toContain(report.runner)
        // The model's core invariant: no argv element carries a shell metacharacter.
        for (const arg of task.argv) expect(arg).not.toMatch(/[<>*?|&;$`()[\]{}!~\\]/)
      }
    }
  })

  test('ids are stable across a re-collect', async () => {
    const dir = await root(SAMPLE)
    const first = tasks(await collect(dir, walkOpts())).map((t) => t.id)
    const second = tasks(await collect(dir, walkOpts())).map((t) => t.id)
    expect(second).toEqual(first)
  })

  test('diagnostics carry the runner that raised them', async () => {
    const dir = await root({ ...SAMPLE, '.moon/workspace.yml': 'projects: []\n' })
    const found = diagnostics(await collect(dir, walkOpts()))
    expect(found.some((d) => d.runner === 'moon')).toBe(true)
  })

  test('walk discovery works with no repository at all', async () => {
    // Walk discovery must not depend on git-tracked files.
    const dir = await root({ 'nested/deep/justfile': 'go:\n    echo\n' })
    const catalog = await collect(dir, walkOpts())
    expect(tasks(catalog).map((t) => t.source)).toEqual(['nested/deep/justfile'])
  })

  test('walk discovery skips dependency and build directories', async () => {
    const dir = await root({
      justfile: 'go:\n    echo\n',
      'node_modules/pkg/justfile': 'nope:\n    echo\n',
      'target/debug/justfile': 'nope:\n    echo\n',
    })
    const catalog = await collect(dir, walkOpts())
    expect(tasks(catalog).map((t) => t.source)).toEqual(['justfile'])
  })

  describe('execution withheld', () => {
    const execTool = (): ToolDef =>
      toolOf(
        'gamma',
        {
          kind: 'exec',
          collect: async () => {
            throw new Error('must not run: exec is disallowed')
          },
        },
        { binary: 'gamma' },
      )

    test('a detected exec runner is reported as withheld, with the hint', async () => {
      const dir = await root({ 'gamma.txt': '' })
      const catalog = await collect(
        dir,
        walkOpts({ tools: [execTool()], execWithheldHint: 'run `x trust` first' }),
      )
      const report = catalog.reports[0]!
      expect(report.skippedForExec).toBe(true)
      expect(report.status).toBe('absent')
      expect(report.diagnostics[0]?.message).toContain('run `x trust` first')
    })

    test('an undetected exec runner has no withheld row', async () => {
      const dir = await root({ justfile: 'build:\n    echo\n' })
      const catalog = await collect(dir, walkOpts({ tools: [execTool(), just] }))
      expect(catalog.reports.map((r) => r.runner)).toEqual(['just'])
    })

    test('moon is withheld without allowExec and runs with it', async () => {
      const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
      const withheld = await collect(dir, walkOpts({ tools: [moon] }))
      expect(withheld.reports[0]).toMatchObject({ runner: 'moon', skippedForExec: true })

      const { make: makeRunner } = fakeRunners([
        { binary: 'moon', argv: ['query', 'projects'], stdout: moonProjectsJson([]) },
        { binary: 'moon', argv: ['query', 'tasks'], stdout: JSON.stringify({ tasks: {} }) },
      ])
      const ran = await collect(dir, walkOpts({ tools: [moon], allowExec: true, makeRunner }))
      expect(ran.reports[0]?.skippedForExec).toBe(false)
      expect(ran.allowExec).toBe(true)
    })
  })

  describe('tool presence', () => {
    const declaring = (binary: string) => toolOf('declares', {}, { binary })

    test('a present binary is reported with its resolved path', async () => {
      const dir = await root({ 'declares.txt': '' })
      const catalog = await collect(
        dir,
        walkOpts({ tools: [declaring('foo')], which: fakeWhich({ foo: '/usr/bin/foo' }) }),
      )
      expect(catalog.reports[0]?.tool).toEqual({ binary: 'foo', found: true, path: '/usr/bin/foo' })
    })

    test('an absent binary is reported found:false with no path', async () => {
      const dir = await root({ 'declares.txt': '' })
      const catalog = await collect(dir, walkOpts({ tools: [declaring('foo')] }))
      expect(catalog.reports[0]?.tool).toEqual({ binary: 'foo', found: false })
    })

    test('a tool declaring no binary carries no `tool` key at all', async () => {
      const dir = await root({ 'no-binary.txt': '' })
      const catalog = await collect(dir, walkOpts({ tools: [toolOf('no-binary')] }))
      expect('tool' in catalog.reports[0]!).toBe(false)
    })

    test('tool presence is filled even when the runner is withheld for exec', async () => {
      const dir = await root({ 'exec-tool.txt': '' })
      const execTool = toolOf('exec-tool', { kind: 'exec' }, { binary: 'foo' })
      const catalog = await collect(
        dir,
        walkOpts({
          tools: [execTool],
          allowExec: false,
          which: fakeWhich({ foo: '/usr/bin/foo' }),
        }),
      )
      const report = catalog.reports[0]!
      expect(report.skippedForExec).toBe(true)
      expect(report.tool).toEqual({ binary: 'foo', found: true, path: '/usr/bin/foo' })
    })

    test('tool presence is filled even when the runner errors', async () => {
      const dir = await root({ 'boom-tool.txt': '' })
      const exploding = toolOf(
        'boom-tool',
        {
          collect: () => {
            throw new Error('blew up')
          },
        },
        { binary: 'foo' },
      )
      const catalog = await collect(
        dir,
        walkOpts({ tools: [exploding], which: fakeWhich({ foo: '/usr/bin/foo' }) }),
      )
      const report = catalog.reports[0]!
      expect(report.status).toBe('error')
      expect(report.tool).toEqual({ binary: 'foo', found: true, path: '/usr/bin/foo' })
    })
  })
})

describe('each collect reads afresh', () => {
  test('a second collect on one profile sees an edit made after the first', async () => {
    const dir = await root({ justfile: 'build:\n    echo build\n' })
    const { project, profile, catalog } = await detectAndCollect(dir, walkOpts({ tools: [just] }))
    expect(tasks(catalog).map((t) => t.display)).toEqual(['just build'])

    await writeFile(join(dir, 'justfile'), 'build:\n    echo build\n\ndeploy:\n    echo deploy\n')
    const again = await project.runners.collect(profile, walkOpts())
    expect(tasks(again).map((t) => t.display)).toEqual(['just build', 'just deploy'])
  })

  test("editing one report's chain does not reach the next collect", async () => {
    const dir = await root({ justfile: 'build:\n    echo build\n' })
    const { project, profile, catalog } = await detectAndCollect(dir, walkOpts({ tools: [just] }))
    const first = catalog.reports.find((r) => r.runner === 'just')!
    const label = first.chain[0]!.label
    first.chain[0]!.label = 'MUTATED'
    const again = await project.runners.collect(profile, walkOpts())
    expect(again.reports.find((r) => r.runner === 'just')!.chain[0]!.label).toBe(label)
  })

  test('a profile copied through JSON collects the same way, with its exclude settings', async () => {
    const dir = await root({
      'build/justfile': 'inner:\n    echo inner\n',
      justfile: 'outer:\n    echo outer\n',
    })
    // `build` is a built-in exclude; turning the list off makes it visible.
    const opts = walkOpts({ tools: [just], useBuiltinExcludes: false })
    const { project, profile, catalog } = await detectAndCollect(dir, opts)
    expect(profile.useBuiltinExcludes).toBe(false)
    const copy = JSON.parse(JSON.stringify(profile)) as typeof profile
    const fromCopy = await project.runners.collect(copy, walkOpts())
    expect(tasks(fromCopy).map((t) => t.display)).toEqual(tasks(catalog).map((t) => t.display))
    expect(tasks(fromCopy).map((t) => t.argv.at(-1))).toEqual(['inner', 'outer'])
  })

  test('a profile built by hand, not by detect, collects', async () => {
    const dir = await root({ justfile: 'build:\n    echo build\n' })
    const project = createProject({ tools: [just] })
    const profile: ProjectProfile = {
      root: dir,
      generatedAt: new Date(0).toISOString(),
      discovery: 'walk',
      allowExec: false,
      excludePaths: [],
      useBuiltinExcludes: true,
      packages: [
        {
          dir: '.',
          ecosystems: [],
          languages: [],
          manifests: {},
          manifestFiles: [],
          tools: [
            {
              tool: 'just',
              roles: ['runner'],
              evidence: [{ kind: 'files', tier: 3, source: 'justfile', found: 'justfile' }],
            },
          ],
        },
      ],
      ecosystems: [],
      languages: [],
      tools: ['just'],
      malformed: [],
    }
    const catalog = await project.runners.collect(profile, walkOpts())
    expect(tasks(catalog).map((t) => t.display)).toEqual(['just build'])
  })
})
